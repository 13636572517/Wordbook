"""二次补救：通过有道 HTML 页面修复被 CDN 投毒的失败词。

jsonapi_s 接口对部分词被持久投毒（返回随机词条缓存），
但 HTML 页面（dict.youdao.com/w/<word>）数据正常。
本脚本读取 verify_progress.json 中的 failed_ids，
解析 HTML 页面生成修复数据，合并进 word_fixes.json。

用法：python3 scripts/fix_failed_via_html.py
"""

import json
import re
import time
import urllib.parse
import urllib.request

PROGRESS_FILE = "/tmp/verify_progress.json"
EXPORT_FILE = "/tmp/words_export.json"
FIXES_FILE = "/tmp/word_fixes.json"
HTML_FIXES_FILE = "/tmp/word_fixes_html.json"
SLEEP = 0.8

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


def strip_tags(s: str) -> str:
    """去除 HTML 标签并解码常见实体。"""
    s = re.sub(r"<[^>]+>", "", s)
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ").strip())


def fetch_html(word: str) -> str:
    url = "https://dict.youdao.com/w/" + urllib.parse.quote(word)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def parse_html_page(html: str, word: str):
    """解析有道 HTML 页面 → 与 _parse_youdao 相同的结构。"""
    definitions = []
    examples = []
    phrases = []
    phonetic = None

    # 音标：优先美音（与 jsonapi 的 usphone 偏好一致）
    m = re.search(r'美\s*<span class="phonetic">\[?([^\]<]+)\]?</span>', html)
    if not m:
        m = re.search(r'英\s*<span class="phonetic">\[?([^\]<]+)\]?</span>', html)
    if m:
        phonetic = f"/{m.group(1).strip()}/"

    # 释义 + 词组：phrsListTab 内的 <li>，格式 "pos. 释义" 或 "词组 释义"
    m = re.search(r'<div id="phrsListTab".*?<ul>(.*?)</ul>', html, re.S)
    if m:
        for li in re.findall(r"<li>(.*?)</li>", m.group(1), re.S):
            text = strip_tags(li)
            if not text:
                continue
            # 词性行：conj. 虽然，尽管
            pm = re.match(r"^([a-z]+\.?)\s+(.+)$", text)
            if pm and len(pm.group(1).rstrip(".")) <= 5:
                definitions.append({"pos": pm.group(1).rstrip("."), "definition": pm.group(2)})
            else:
                # 词组行：as though 仿佛
                parts = re.split(r"\s{2,}|　", text, maxsplit=1)
                if len(parts) == 2:
                    phrases.append({"phrase": parts[0].strip(), "meaning": parts[1].strip()})
                elif definitions:
                    pass  # 无法解析的行跳过

    # 例句：通过 src_N_0 / tran_N_1 的 span ID 提取（不受区域嵌套影响）
    ens = {}
    for m in re.finditer(r'<span id="src_(\d+)_0".*?</p>', html, re.S):
        ens.setdefault(int(m.group(1)), strip_tags(m.group(0)))
    zhs = {}
    for m in re.finditer(r'<span id="tran_(\d+)_1".*?</p>', html, re.S):
        zhs.setdefault(int(m.group(1)), strip_tags(m.group(0)))
    for i in sorted(ens.keys())[:4]:
        if ens[i]:
            examples.append({"en": ens[i], "zh": zhs.get(i) or None})

    if not definitions and not phrases and not examples:
        return None
    return {"phonetic": phonetic, "definitions": definitions, "examples": examples, "phrases": phrases}


def main():
    prog = json.load(open(PROGRESS_FILE))
    failed_ids = prog.get("failed_ids", [])
    if not failed_ids:
        print("无失败词，无需补救")
        return

    words_by_id = {w["id"]: w for w in json.load(open(EXPORT_FILE))}
    print(f"开始 HTML 补救 {len(failed_ids)} 个失败词...")

    html_fixes = []
    still_failed = []

    for i, wid in enumerate(failed_ids, 1):
        w = words_by_id.get(wid)
        if not w:
            continue
        word_text = w["word"]
        try:
            html = fetch_html(word_text)
            # 防投毒校验：页面标题必须包含查询词
            title_m = re.search(r"<title>([^<]+)</title>", html)
            title = title_m.group(1) if title_m else ""
            if word_text.lower() not in title.lower():
                raise ValueError(f"页面标题不含查询词: {title[:40]}")
            result = parse_html_page(html, word_text)
        except Exception as exc:
            still_failed.append(wid)
            print(f"[{i}/{len(failed_ids)}] FAIL {word_text}: {str(exc)[:60]}", flush=True)
            time.sleep(SLEEP)
            continue

        if result is None:
            new_defs, new_phrs, new_exs, new_pron = "[]", "[]", "[]", None
        else:
            new_defs = json.dumps(result["definitions"], ensure_ascii=False)
            new_phrs = json.dumps(result["phrases"], ensure_ascii=False)
            new_exs = json.dumps(result["examples"], ensure_ascii=False)
            new_pron = result.get("phonetic")

        html_fixes.append({
            "id": wid, "word": word_text,
            "definitions": new_defs, "phrases": new_phrs, "examples": new_exs,
            "pronunciation": new_pron,
        })
        print(f"[{i}/{len(failed_ids)}] FIX {word_text}: pron={(new_pron or '')[:20]!r} defs={len(result['definitions']) if result else 0}", flush=True)
        time.sleep(SLEEP)

    json.dump(html_fixes, open(HTML_FIXES_FILE, "w"), ensure_ascii=False)

    # 合并进主修复文件
    main_fixes = []
    try:
        main_fixes = json.load(open(FIXES_FILE))
    except Exception:
        pass
    existing_ids = {f["id"] for f in main_fixes}
    added = 0
    for f in html_fixes:
        if f["id"] not in existing_ids:
            main_fixes.append(f)
            added += 1
    json.dump(main_fixes, open(FIXES_FILE, "w"), ensure_ascii=False)

    print(f"\nHTML 补救完成：修复 {len(html_fixes)}，仍失败 {len(still_failed)}: {still_failed[:30]}")
    print(f"合并后 word_fixes.json 共 {len(main_fixes)} 条（新增 {added}）")


if __name__ == "__main__":
    main()
