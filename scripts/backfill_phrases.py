"""词组补充（backfill）：为生产库中无词组的单词补齐词组。

三级数据源（按优先级）：
  1. 教材 JSONL（data/PEPGaoZhong_*.json，本地离线）—— 仅高中词本，教材配套质量最高
  2. 有道网页版词组短语板块（dict.youdao.com/w/<word>/）
  3. 海词词汇搭配板块（dict.cn/<word>）—— 有道失败/无词组时兜底

流程：读取 scripts/.phrase_backfill/missing_words.json（无词组词清单 + 所在词本 levels）
→ 逐词提取词组 → 清洗（去词性前缀/噪音，2-5 词）→ 打 levels → 保留前 4 条
→ 输出 scripts/.phrase_backfill/patch.json（断点续跑、幂等）。

用法：
  python3 scripts/backfill_phrases.py --stage textbook   # 教材数据（离线，秒级）
  python3 scripts/backfill_phrases.py --stage web        # 有道+海词（在线，约 20-40 分钟）

应用补丁（服务器上执行）：
  python3 scripts/apply_phrase_patch.py
"""
import json
import os
import re
import random
import sys
import time
import urllib.parse
import urllib.request
import glob

BASE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(BASE, ".phrase_backfill")
MISSING_PATH = os.path.join(DIR, "missing_words.json")
PATCH_PATH = os.path.join(DIR, "patch.json")
FAILED_PATH = os.path.join(DIR, "web_failed.json")
TEXTBOOK_DIR = "/Users/michael/Workbuddy/高中学习工具/wordhoard/data"

UA_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
]

# 释义中的词性前缀（有道/海词/教材释义都可能有）
POS_RE = re.compile(
    r"^\s*(?:n|v|vt|vi|adj|adv|prep|pron|conj|int|num|art|aux|modal|abbr)\s*\.?\s*",
    re.I,
)
# 只允许英文字母、空格、连字符、撇号、点（缩写）
VALID_PHRASE_RE = re.compile(r"^[A-Za-z][A-Za-z' .\-]*[A-Za-z.]$")
ALL_CAPS_TOKEN_RE = re.compile(r"\b[A-Z]{2,}\b")
SPLICE_RE = re.compile(r"[…]{2,}|\.{3,}|；\s*[A-Za-z]|——")

MAX_PHRASES = 4
MIN_WORDS, MAX_WORDS = 2, 5


# ---------- 清洗 ----------

def clean_meaning(raw):
    """清理中文释义：去词性前缀、拼接噪声、截断。"""
    if not raw:
        return ""
    m = "".join(raw).strip()
    m = POS_RE.sub("", m)
    m = SPLICE_RE.split(m)[0].strip()
    m = re.sub(r"\s+", " ", m)
    if len(m) > 80:
        m = m[:80].rstrip("；;，, ")
    return m


def is_valid_phrase(p):
    if not p or not VALID_PHRASE_RE.match(p):
        return False
    toks = p.split()
    if not (MIN_WORDS <= len(toks) <= MAX_WORDS):
        return False
    # 全大写缩写 token（IP/IT/USB 等）视为噪音
    if ALL_CAPS_TOKEN_RE.search(p):
        return False
    return True


def rank_phrases(items, target):
    """排序：包含目标词 > 词数 ≤3 > 原顺序。"""
    tl = target.lower()

    def key(entry):
        p = entry["phrase"].lower()
        has = 1 if tl in p else 0
        short = 1 if len(p.split()) <= 3 else 0
        return (-has, -short)

    return sorted(items, key=key)[:MAX_PHRASES]


def merge_unique(items):
    seen = set()
    out = []
    for it in items:
        k = it["phrase"].strip().lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


# ---------- 数据源 1：教材 JSONL ----------

def load_textbook_phrases():
    """headWord -> [{phrase, meaning}]，读取全部教材 JSONL。"""
    by_word = {}
    for path in sorted(glob.glob(os.path.join(TEXTBOOK_DIR, "PEPGaoZhong_*.json"))):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            head = (rec.get("headWord") or "").strip().lower()
            if not head:
                continue
            content = ((rec.get("content") or {}).get("word") or {}).get("content") or {}
            phs = (content.get("phrase") or {}).get("phrases") or []
            items = []
            for p in phs:
                if not isinstance(p, dict):
                    continue
                phrase = (p.get("pContent") or "").strip()
                meaning = clean_meaning(p.get("pCn") or "")
                if is_valid_phrase(phrase):
                    items.append({"phrase": phrase, "meaning": meaning})
            if items:
                by_word[head] = items
    return by_word


# ---------- 数据源 2：有道网页 ----------

def http_get(url, referer=None, timeout=6):
    req = urllib.request.Request(url, headers={
        "User-Agent": random.choice(UA_POOL),
        "Accept": "text/html,application/xhtml+xml",
        "Referer": referer or "https://dict.youdao.com/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def parse_youdao_web(html):
    """解析 #wordGroup 板块的 <p class="wordGroup"> 行。"""
    m = re.search(r'id="wordGroup"[^>]*>(.*?)</div>', html, re.S)
    if not m:
        return []
    block = m.group(1)
    items = []
    for pm in re.finditer(r'<p class="wordGroup">(.*?)</p>', block, re.S):
        seg = pm.group(1)
        am = re.search(r'<a class="search-js"[^>]*>(.*?)</a>', seg, re.S)
        if not am:
            continue
        phrase = re.sub(r"<[^>]+>", "", am.group(1)).strip()
        meaning_raw = re.sub(r"<[^>]+>", " ", seg)
        meaning_raw = meaning_raw.replace(phrase, " ", 1)
        meaning = clean_meaning(meaning_raw)
        if is_valid_phrase(phrase):
            items.append({"phrase": phrase, "meaning": meaning})
    return items


def fetch_youdao(word):
    url = f"https://dict.youdao.com/w/{urllib.parse.quote(word)}/"
    html = http_get(url)
    # 防御 CDN 污染：页面标题/关键词不含目标词时视为无效
    if f">{word}</a>" not in html and word not in html[:3000]:
        return []
    return parse_youdao_web(html)


# ---------- 数据源 3：海词 ----------

def parse_dictcn(html):
    """解析「词汇搭配」板块（<h3>词汇搭配</h3> 到 <h3>经典引文</h3>）。"""
    i = html.find("词汇搭配")
    if i < 0:
        return []
    j = html.find("经典引文", i)
    block = html[i:j if j > 0 else i + 20000]
    items = []
    for lim in re.finditer(r"<li>(.*?)</li>", block, re.S):
        seg = lim.group(1)
        am = re.search(r'<a[^>]*href="https://dict\.cn/[^"]*"[^>]*>(.*?)</a>', seg, re.S)
        if not am:
            continue
        phrase = re.sub(r"<[^>]+>", "", am.group(1)).strip()
        meaning_raw = re.sub(r"<[^>]+>", " ", seg)
        meaning_raw = meaning_raw.replace(phrase, " ", 1)
        meaning = clean_meaning(meaning_raw)
        if is_valid_phrase(phrase):
            items.append({"phrase": phrase, "meaning": meaning})
    return items


def fetch_dictcn(word):
    url = f"https://dict.cn/{urllib.parse.quote(word)}"
    try:
        html = http_get(url, referer="https://dict.cn/")
    except Exception:
        return []
    if word not in html[:2000]:
        return []
    return parse_dictcn(html)


# ---------- 主流程 ----------

def load_missing():
    with open(MISSING_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_patch():
    if os.path.exists(PATCH_PATH):
        with open(PATCH_PATH, encoding="utf-8") as f:
            return json.load(f)
    return []


def save_patch(patch):
    with open(PATCH_PATH, "w", encoding="utf-8") as f:
        json.dump(patch, f, ensure_ascii=False, indent=1)


def stage_textbook():
    """教材阶段：只处理 levels 含 high-school 的词。"""
    print("[textbook] 加载教材 JSONL ...")
    tb = load_textbook_phrases()
    print(f"[textbook] 教材词条数（含词组）: {len(tb)}")
    missing = load_missing()
    patch = load_patch()
    done = {p["word"] for p in patch}
    added = 0
    for w in missing:
        if w["word"] in done or "high-school" not in w["levels"]:
            continue
        src = tb.get(w["word"].lower())
        if not src:
            continue
        items = rank_phrases(merge_unique(src), w["word"])
        if not items:
            continue
        patch.append({
            "id": w["id"], "word": w["word"],
            "phrases": [{**it, "levels": w["levels"]} for it in items],
        })
        added += 1
    save_patch(patch)
    print(f"[textbook] 本次补充 {added} 词，patch 累计 {len(patch)} 词")


def stage_web():
    """在线阶段：有道 → 海词。断点续跑。"""
    missing = load_missing()
    patch = load_patch()
    done = {p["word"] for p in patch}
    failed = []
    if os.path.exists(FAILED_PATH):
        with open(FAILED_PATH, encoding="utf-8") as f:
            failed = json.load(f)
    failed_set = set(failed)

    todo = [w for w in missing
            if w["word"] not in done and w["word"] not in failed_set]
    print(f"[web] 待处理 {len(todo)} 词（已完成 {len(done)}，已失败 {len(failed_set)}）")

    ok = skipped = 0
    t0 = time.time()
    for idx, w in enumerate(todo):
        word = w["word"]
        items = []
        source = None
        try:
            items = fetch_youdao(word)
            source = "youdao"
        except Exception:
            items = []
        if not items:
            try:
                items = fetch_dictcn(word)
                source = "dictcn"
            except Exception:
                items = []
        # 在线源词组必须包含目标词，防止错词污染
        tl = word.lower()
        items = [it for it in items if tl in it["phrase"].lower()]
        if items:
            items = rank_phrases(merge_unique(items), word)
            patch.append({
                "id": w["id"], "word": word,
                "phrases": [{**it, "levels": w["levels"]} for it in items],
            })
            ok += 1
        else:
            failed.append(word)
            skipped += 1
        if (idx + 1) % 20 == 0:
            save_patch(patch)
            with open(FAILED_PATH, "w", encoding="utf-8") as f:
                json.dump(failed, f, ensure_ascii=False)
            el = time.time() - t0
            rate = (idx + 1) / max(el, 1e-6)
            eta = (len(todo) - idx - 1) / max(rate, 1e-6)
            print(f"[web] {idx + 1}/{len(todo)} 补充 {ok} 无词组 {skipped} "
                  f"({rate:.2f} 词/s, 预计剩余 {eta / 60:.1f} 分钟)", flush=True)
        time.sleep(random.uniform(0.25, 0.5))
    save_patch(patch)
    with open(FAILED_PATH, "w", encoding="utf-8") as f:
        json.dump(failed, f, ensure_ascii=False)
    print(f"[web] 完成：补充 {ok}，无词组 {skipped}，patch 累计 {len(patch)} 词")


if __name__ == "__main__":
    stage = sys.argv[sys.argv.index("--stage") + 1] if "--stage" in sys.argv else "all"
    if stage == "textbook":
        stage_textbook()
    elif stage == "web":
        stage_web()
    else:
        stage_textbook()
        stage_web()
