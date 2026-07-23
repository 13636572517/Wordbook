"""
一键补全释义 — 后台任务服务。

设计要点：
- 单例任务：同一时刻只允许一个补全进程（threading.Lock 保护）
- 进度存 Redis：Gunicorn 多 worker 均可查询进度
- 断点续传：跳过 definitions 非空的单词，中断后重新启动自动接续
- 进程管理：
  - daemon 线程，不阻塞 Gunicorn 关闭
  - 每词之间检查停止标志（Redis key），支持中途停止
  - heartbeat (updated_at)，超过 120s 无更新视为异常中断
  - 单词级 try/except，失败不中断整体流程
- 限流：每词间隔 0.5s，避免被封 IP
"""

import json
import logging
import threading
import time
import urllib.parse
import urllib.request
from collections import deque

from django.db import connection

logger = logging.getLogger(__name__)

# --- Redis keys ---
STATE_KEY = "learning:enrich:state"
LOG_KEY = "learning:enrich:log"
STOP_KEY = "learning:enrich:stop"

# --- 配置 ---
RATE_LIMIT_SECONDS = 0.5  # 每词间隔
HEARTBEAT_TIMEOUT = 60  # 超过此秒数无更新视为中断
LOG_MAX_ENTRIES = 300  # Redis 日志保留条数
REQUEST_TIMEOUT = 15  # 单词查询超时(秒)

YOUDAO_API = "https://dict.youdao.com/jsonapi_s"

# 单例锁：防止并发启动
_start_lock = threading.Lock()
_task_thread: threading.Thread | None = None


def _get_redis():
    """获取 Redis 客户端（通过 django-redis 连接池）。"""
    from django_redis import get_redis_connection

    return get_redis_connection("default")


def get_task_state() -> dict:
    """获取当前任务状态。"""
    try:
        r = _get_redis()
        raw = r.get(STATE_KEY)
        if not raw:
            return {"status": "idle"}
        state = json.loads(raw)

        # 心跳检测：running 但长时间无更新 → 标记为中断
        if state.get("status") == "running":
            updated_at = state.get("updated_at", 0)
            if time.time() - updated_at > HEARTBEAT_TIMEOUT:
                state["status"] = "interrupted"
                state["error"] = "任务异常中断（服务重启或进程崩溃），可重新启动继续"
        return state
    except Exception as exc:
        logger.warning("读取 enrich 状态失败: %s", exc)
        return {"status": "idle"}


def get_task_log(offset: int = 0, limit: int = 50) -> list:
    """获取任务日志（最新的在前）。offset=0 表示从最新开始。"""
    try:
        r = _get_redis()
        entries = r.lrange(LOG_KEY, offset, offset + limit - 1)
        return [json.loads(e) for e in entries]
    except Exception:
        return []


def _set_state(**kwargs) -> None:
    """更新 Redis 中的任务状态（merge 式）。"""
    try:
        r = _get_redis()
        raw = r.get(STATE_KEY)
        state = json.loads(raw) if raw else {}
        state.update(kwargs)
        state["updated_at"] = time.time()
        r.set(STATE_KEY, json.dumps(state, ensure_ascii=False))
    except Exception as exc:
        logger.warning("写入 enrich 状态失败: %s", exc)


def _push_log(word: str, status: str, detail: str = "") -> None:
    """写入一条日志。"""
    try:
        r = _get_redis()
        entry = json.dumps(
            {"ts": int(time.time() * 1000), "word": word, "status": status, "detail": detail},
            ensure_ascii=False,
        )
        pipe = r.pipeline()
        pipe.lpush(LOG_KEY, entry)
        pipe.ltrim(LOG_KEY, 0, LOG_MAX_ENTRIES - 1)
        pipe.execute()
    except Exception:
        pass


def _should_stop() -> bool:
    """检查停止标志。"""
    try:
        r = _get_redis()
        return r.get(STOP_KEY) == b"1" or r.get(STOP_KEY) == "1"
    except Exception:
        return False


FREE_DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en"

# --- 词典解析：Free Dictionary API（主源）---


def _parse_free_dict(data: list) -> dict | None:
    """解析 Free Dictionary API 响应 (api.dictionaryapi.dev)。

    返回: {phonetic, definitions, examples, phrases} 或 None（无有效内容）。
    """
    if not isinstance(data, list) or not data:
        return None
    entry = data[0]
    if not isinstance(entry, dict):
        return None

    definitions: list[dict] = []
    examples: list[dict] = []

    for meaning in entry.get("meanings") or []:
        if not isinstance(meaning, dict):
            continue
        pos = meaning.get("partOfSpeech", "释义")
        for defn in meaning.get("definitions") or []:
            if not isinstance(defn, dict):
                continue
            d_text = (defn.get("definition") or "").strip()
            if d_text:
                definitions.append({"pos": pos, "definition": d_text})
            example = (defn.get("example") or "").strip()
            if example:
                examples.append({"en": example, "zh": None})

    if not definitions and not examples:
        return None

    return {
        "phonetic": entry.get("phonetic"),
        "definitions": definitions,
        "examples": examples[:4],
        "phrases": [],  # Free Dictionary API 无词组
    }


def _fetch_free_dict(word_text: str) -> dict | None:
    """查询 Free Dictionary API。

    返回: 解析结果 dict 或 None。
    抛出: urllib.error.HTTPError(404) 等网络异常。
    """
    url = f"{FREE_DICT_API}/{urllib.parse.quote(word_text)}"
    req = urllib.request.Request(url, headers={"User-Agent": "WordbookBot/1.0"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return _parse_free_dict(data)


# --- 词典解析：有道词典（回退）---


def _extract_text(v) -> str:
    """从有道各种嵌套结构提取纯文本。

    支持："str" | {"l": {"i": "str" | ["str"]}} | {"tr": ...} | {"headword": ...}
    无法提取时返回空字符串（绝不返回 dict，避免前端渲染崩溃）。
    """
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


def _parse_youdao(data: dict) -> dict | None:
    """解析有道词典 API 响应（兼容多种返回结构）。"""
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
    # ec.word 可能是列表（多义词条目），取第一个
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
            # inner 可能是 [{"tr": "..."}] 或 ["..."] 或 {"tr": "..."}
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

    # 备用：ec.source 字段（部分词返回结构不同）
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
        # 格式 A: {"phr": "...", "trs": [{"tr": "..."}]}
        # 格式 B: {"headword": "...", "translation": "..."}
        # 格式 C: {"headword": {"l": {"i": "..."}}, "trs": [{"tr": {"l": {"i": "..."}}}], "source": ""}
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


def _fetch_youdao(word_text: str) -> dict | None:
    """查询有道词典（urllib，gevent 下自动协程化）。

    返回 None = 有效响应但无词典内容（跳过）；
    抛出异常 = 网络错误/限流垃圾响应（可重试）。

    重要：有道 CDN 偶发返回其他词条的缓存响应（input 字段不匹配），
    必须校验 input 与查询词一致，否则会把别的词的数据存进来。
    """
    params = urllib.parse.urlencode({
        "doctype": "json",
        "jsonversion": "4",
        "q": word_text,
        "le": "en",
    })
    url = f"{YOUDAO_API}?{params}"
    last_input = None
    for attempt in range(3):
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "Referer": "https://dict.youdao.com/",
            "User-Agent": "Mozilla/5.0 (compatible; WordbookBot/1.0)",
        })
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        # 有效响应必须包含 input 字段，否则视为限流/异常响应（抛异常以便重试）
        if not isinstance(data, dict) or "input" not in data:
            raise ValueError("无效 API 响应（可能被限流）")
        # 校验 input：防止 CDN 缓存串扰导致数据错位
        last_input = str(data.get("input", "")).strip()
        if last_input.lower() == word_text.strip().lower():
            return _parse_youdao(data)
        # input 不匹配 → CDN 污染，等待后重试
        if attempt < 2:
            time.sleep(1.5 * (attempt + 1))
    raise ValueError(f"API 连续返回错误词条数据（input={last_input}）")


def _fetch_word(word_text: str) -> dict | None:
    """查询单词释义：优先 Free Dictionary API，失败后回退有道。

    Free Dict 返回 null → 尝试有道（提供中文释义作为补充）。
    抛出异常 → 视为网络错误，_run_enrich_task 会标记 failed 并继续。
    """
    try:
        result = _fetch_free_dict(word_text)
        if result is not None:
            return result
    except Exception:
        pass  # Free Dict 失败，回退有道

    return _fetch_youdao(word_text)


# --- 后台任务主体 ---


def _run_enrich_task() -> None:
    """后台线程入口：逐词补全释义。"""
    import django

    django.setup() if not django.apps.apps.ready else None

    done = 0
    failed = 0
    skipped = 0

    try:
        _set_state(status="running", started_at=time.time())
        _push_log("__system__", "info", "补全任务启动")

        # 断点续传：只取 definitions 为空的词
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, word FROM words "
                "WHERE definitions IS NULL OR definitions = 'null' OR definitions = '[]'"
            )
            pending = cursor.fetchall()

        total = len(pending)
        _set_state(total=total, done=0, failed=0, skipped=0)
        _push_log("__system__", "info", f"待补全 {total} 词（已跳过有释义的词）")

        if total == 0:
            _set_state(status="done", done=0, failed=0, total=0)
            _push_log("__system__", "info", "所有单词均已有释义，无需补全")
            return

        for word_id, word_text in pending:
            # 停止检查
            if _should_stop():
                _set_state(status="stopped", done=done, failed=failed)
                _push_log("__system__", "info", f"任务已手动停止（已完成 {done}，失败 {failed}）")
                return

            _set_state(current_word=word_text, done=done, failed=failed)

            try:
                result = _fetch_word(word_text)
                if result:
                    # 写入数据库
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "UPDATE words SET definitions=%s, phrases=%s, examples=%s, "
                            "pronunciation=COALESCE(NULLIF(pronunciation,''), %s) "
                            "WHERE id=%s",
                            [
                                json.dumps(result["definitions"], ensure_ascii=False),
                                json.dumps(result["phrases"], ensure_ascii=False),
                                json.dumps(result["examples"], ensure_ascii=False),
                                result.get("phonetic"),
                                word_id,
                            ],
                        )
                    done += 1
                    n_defs = len(result["definitions"])
                    n_phr = len(result["phrases"])
                    _push_log(word_text, "ok", f"{n_defs} 条释义, {n_phr} 个词组")
                else:
                    # API 无结果 — 标记为空数组避免重复查询
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "UPDATE words SET definitions='[]', phrases='[]', examples='[]' WHERE id=%s",
                            [word_id],
                        )
                    skipped += 1
                    _push_log(word_text, "skip", "词典无结果")
            except Exception as exc:
                failed += 1
                _push_log(word_text, "fail", str(exc)[:100])
                logger.warning("补全 %s 失败: %s", word_text, exc)

            _set_state(done=done, failed=failed, skipped=skipped)
            time.sleep(RATE_LIMIT_SECONDS)

        _set_state(status="done", done=done, failed=failed, skipped=skipped, current_word=None)
        _push_log("__system__", "info", f"任务完成：成功 {done}，失败 {failed}，无结果 {skipped}")

    except Exception as exc:
        logger.exception("enrich 任务异常退出")
        _set_state(status="error", error=str(exc)[:200], done=done, failed=failed)
        _push_log("__system__", "error", f"任务异常: {str(exc)[:100]}")
    finally:
        # 清理停止标志
        try:
            r = _get_redis()
            r.delete(STOP_KEY)
        except Exception:
            pass
        # 关闭数据库连接（daemon 线程需自行清理）
        connection.close()


# --- 公开 API ---


def start_task() -> dict:
    """
    启动补全任务。

    返回: {"started": True} 或 {"started": False, "reason": "..."}
    """
    global _task_thread

    with _start_lock:
        state = get_task_state()
        if state.get("status") == "running":
            return {"started": False, "reason": "任务正在运行中"}

        # 清理旧停止标志
        try:
            r = _get_redis()
            r.delete(STOP_KEY)
            r.delete(LOG_KEY)
        except Exception:
            pass

        _set_state(
            status="starting", total=0, done=0, failed=0, skipped=0,
            current_word=None, error=None, started_at=time.time(),
        )

        _task_thread = threading.Thread(
            target=_run_enrich_task,
            name="enrich-task",
            daemon=True,  # 不阻塞进程退出
        )
        _task_thread.start()
        return {"started": True}


def stop_task() -> dict:
    """请求停止任务（优雅停止，当前词处理完后退出）。"""
    state = get_task_state()
    if state.get("status") != "running":
        return {"stopped": False, "reason": "没有正在运行的任务"}

    try:
        r = _get_redis()
        r.set(STOP_KEY, "1")
    except Exception:
        return {"stopped": False, "reason": "Redis 不可用"}

    return {"stopped": True}


def get_progress() -> dict:
    """获取完整进度信息（状态 + 最近日志）。"""
    state = get_task_state()
    log = get_task_log(0, 50)
    return {**state, "recent_log": log}
