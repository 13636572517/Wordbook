"""本地校验有道词典数据（服务器 IP 被反爬限制时的替代方案）。

逐词查询有道 API（input 校验 + 3 次重试），与数据库导出数据对比，
生成 word_fixes.json 供服务器端 apply_fixes 命令写入。

用法：
    1. 从服务器导出: words_export.json（见 HANDOFF 或 export_words 脚本）
    2. python3 scripts/verify_enrichment_local.py
    3. 将 /tmp/word_fixes.json 上传服务器，运行 manage.py apply_fixes

支持断点续传：进度存 /tmp/verify_progress.json。
"""

import json
import os
import time
import urllib.parse
import urllib.request

EXPORT_FILE = "/tmp/words_export.json"
FIXES_FILE = "/tmp/word_fixes.json"
PROGRESS_FILE = "/tmp/verify_progress.json"
YOUDAO_API = "https://dict.youdao.com/jsonapi_s"
SLEEP = 0.55


# --- 解析逻辑（与 backend/apps/vocab/enrich_service.py 完全一致）---

def _extract_text(v) -> str:
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, dict):
        l = v.get("l")
        if isinstance(l, dict):
            i = l.get("i")
            if isinstance(i, str):
                return i.strip()
            if isinstance(i, list):
                return "；".join(x.strip() for x in i if isinstance(x, str) and x.strip())
        for key in ("tr", "headword", "phr", "translation"):
            if v.get(key):
                t = _extract_text(v[key])
                if t:
                    return t
        trs = v.get("trs")
        if isinstance(trs, list):
            parts = [_extract_text(t) for t in trs]
            return "；".join(p for p in parts if p)
    return ""


def _parse_youdao(data: dict):
    if not isinstance(data, dict):
        return None
    definitions = []
    examples = []
    phrases = []
    phonetic = None

    ec = data.get("ec") or {}
    if not isinstance(ec, dict):
        ec = {}
    ec_word = ec.get("word") or {}
    if isinstance(ec_word, list):
        ec_word = ec_word[0] if ec_word else {}
    if not isinstance(ec_word, dict):
        ec_word = {}
    ec_trs = ec_word.get("trs") or []

    if ec_word.get("usphone"):
        phonetic = f"/{ec_word['usphone']}/"
    elif ec_word.get("ukphone"):
        phonetic = f"/{ec_word['ukphone']}/"
    elif ec_word.get("phone"):
        phonetic = f"/{ec_word['phone']}/"

    for tr in ec_trs:
        if not isinstance(tr, dict):
            continue
        pos = (tr.get("pos") or "").replace(".", "").strip()
        meanings = []
        tran = tr.get("tran")
        if tran and isinstance(tran, str):
            meanings.append(tran)
        inner = tr.get("tr")
        if inner:
            if isinstance(inner, dict):
                inner = [inner]
            if isinstance(inner, list):
                for t in inner:
                    if isinstance(t, dict):
                        v = t.get("tr", "")
                        if not v and isinstance(t.get("l"), dict):
                            i_list = t["l"].get("i") or []
                            v = i_list[0] if i_list and isinstance(i_list[0], str) else ""
                    elif isinstance(t, str):
                        v = t
                    else:
                        continue
                    if v and v not in meanings:
                        meanings.append(v)
        if meanings:
            definitions.append({"pos": pos or "释义", "definition": "；".join(str(m) for m in meanings)})

    if not definitions:
        trs2 = ec.get("source") or []
        for tr in trs2:
            if isinstance(tr, dict) and tr.get("tran"):
                definitions.append({"pos": "释义", "definition": tr["tran"]})

    phrs_data = data.get("phrs") or {}
    phrs = phrs_data.get("phrs") or []
    if isinstance(phrs, dict):
        phrs = [phrs]
    for p in phrs[:8]:
        if not isinstance(p, dict):
            continue
        phrase_text = _extract_text(p.get("phr")) or _extract_text(p.get("headword"))
        if phrase_text:
            parts = []
            trans = _extract_text(p.get("translation"))
            if trans and trans not in parts:
                parts.append(trans)
            trs = p.get("trs") or []
            if isinstance(trs, dict):
                trs = [trs]
            for t in trs:
                v = _extract_text(t.get("tr")) if isinstance(t, dict) else _extract_text(t)
                if v and v not in parts:
                    parts.append(v)
            phrases.append({"phrase": phrase_text, "meaning": "；".join(parts)})

    sent_source = (
        (data.get("blng_sents_part") or {}).get("sentence-pair")
        or (data.get("auth_sents_part") or {}).get("sentence-pair")
        or []
    )
    if isinstance(sent_source, dict):
        sent_source = [sent_source]
    for s in sent_source[:4]:
        if isinstance(s, dict) and s.get("sentence"):
            examples.append({"en": s["sentence"], "zh": s.get("sentence-translation") or None})

    if not definitions and not phrases and not examples:
        return None
    return {"phonetic": phonetic, "definitions": definitions, "examples": examples, "phrases": phrases}


def fetch_word(word_text: str):
    """带 input 校验的查询，3 次重试。"""
    params = urllib.parse.urlencode({"doctype": "json", "jsonversion": "4", "q": word_text, "le": "en"})
    url = f"{YOUDAO_API}?{params}"
    last_input = None
    for attempt in range(3):
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "Referer": "https://dict.youdao.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if not isinstance(data, dict) or "input" not in data:
            raise ValueError("无效 API 响应（可能被限流）")
        last_input = str(data.get("input", "")).strip()
        if last_input.lower() == word_text.strip().lower():
            return _parse_youdao(data)
        if attempt < 2:
            time.sleep(1.5 * (attempt + 1))
    raise ValueError(f"API 连续返回错误词条数据（input={last_input}）")


def main():
    words = json.load(open(EXPORT_FILE))
    total = len(words)

    # 断点续传
    start_idx = 0
    fixes = []
    failed_ids = []
    if os.path.exists(PROGRESS_FILE):
        prog = json.load(open(PROGRESS_FILE))
        start_idx = prog.get("next_idx", 0)
        fixes = prog.get("fixes", [])
        failed_ids = prog.get("failed_ids", [])
        print(f"续传：从 #{start_idx} 继续，已有 {len(fixes)} 条修复")

    ok = 0
    empty = 0
    failed = 0

    for idx in range(start_idx, total):
        w = words[idx]
        wid, word_text = w["id"], w["word"]
        try:
            result = fetch_word(word_text)
        except Exception as exc:
            failed += 1
            failed_ids.append(wid)
            print(f"[{idx+1}/{total}] FAIL {word_text}: {str(exc)[:60]}", flush=True)
            time.sleep(SLEEP)
            continue

        if result is None:
            new_defs, new_phrs, new_exs, new_pron = "[]", "[]", "[]", None
            empty += 1
        else:
            new_defs = json.dumps(result["definitions"], ensure_ascii=False)
            new_phrs = json.dumps(result["phrases"], ensure_ascii=False)
            new_exs = json.dumps(result["examples"], ensure_ascii=False)
            new_pron = result.get("phonetic")

        changed = (
            new_defs != w["defs"]
            or new_phrs != w["phrs"]
            or new_exs != w["exs"]
            or (new_pron and w["pron"] != new_pron)
        )

        if changed:
            fixes.append({
                "id": wid, "word": word_text,
                "definitions": new_defs, "phrases": new_phrs, "examples": new_exs,
                "pronunciation": new_pron,
            })
            print(f"[{idx+1}/{total}] FIX {word_text}: pron {w['pron'][:18]!r} -> {(new_pron or '')[:18]!r}", flush=True)
        else:
            ok += 1

        # 每 50 词保存进度
        if (idx + 1) % 50 == 0:
            json.dump({"next_idx": idx + 1, "fixes": fixes, "failed_ids": failed_ids},
                      open(PROGRESS_FILE, "w"), ensure_ascii=False)
            print(f"[{idx+1}/{total}] 进度: 一致={ok} 修复={len(fixes)} 失败={failed} 无结果={empty}", flush=True)

        time.sleep(SLEEP)

    # 最终保存
    json.dump({"next_idx": total, "fixes": fixes, "failed_ids": failed_ids},
              open(PROGRESS_FILE, "w"), ensure_ascii=False)
    json.dump(fixes, open(FIXES_FILE, "w"), ensure_ascii=False)
    print(f"\n完成！总计 {total} | 一致 {ok} | 修复 {len(fixes)} | 失败 {failed} | 无结果 {empty}")
    print(f"修复数据已写入 {FIXES_FILE}，失败 ID: {failed_ids[:20]}{'...' if len(failed_ids) > 20 else ''}")


if __name__ == "__main__":
    main()
