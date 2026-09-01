"""词组重新整理：去噪、精选、按词本分级标注。

背景：
- words.phrases 来自有道词典前 8 条搭配，含大量非考试噪音（IT/地质/商务术语、
  释义拼接错误等），且没有考试级别信息；
- 每日学习队列取 word.phrases[0]，噪音词组会被直接学进 user_phrase_progress；
- 同一个词在高中/四级/六级词本间共享，词组无法按词本差异化。

本命令行为：
1. 去噪：按规则过滤技术术语、拼接错误、无效条目；
2. 精选：按打分规则每个词保留最多 4 个词组，最高分排最前（即 phrases[0]）；
3. 分级：每条词组打 levels 标签（继承该词所在系统词本的 level）；
   命中内置考试高频词组表（CURATED）的条目使用表中指定的 levels 并加分保序；
4. 清理（--clean-progress）：删除 user_phrase_progress 中词组已被移除的孤儿进度，
   避免噪音词组继续出现在学员复习队列；
5. 写入前把 words.phrases 与 user_phrase_progress 备份为 JSON 文件到服务器
   /opt/learning/backend/phrase_backup_<ts>.json（dry-run 不备份不写入）。

用法：
    python manage.py reorganize_phrases --dry-run
    python manage.py reorganize_phrases --clean-progress
"""

import json
import re
import time
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import connection

# 系统词本 level 值（与 wordbooks.level 一致），作为词组 levels 标签
KNOWN_LEVELS = ("high-school", "cet4", "cet6", "junior-shanghai-hj-open")

# 技术术语标记：释义中出现即视为噪音
TECH_MARKERS = (
    "[计]", "[地理学]", "[地质]", "[医]", "[法]", "[化]", "[物]", "[建]",
    "[电信]", "[贸易]", "[航空]", "[航海]", "[生物]", "[数]", "[矿]", "[农]",
    "[军]", "[金融]", "[气象]", "[天文]", "[体]", "[解]", "[植]", "[动]",
)

# 释义拼接串位标记（词典数据错误，如 "减少对…之消耗量；努力，致力于…"）
SPLICE_MARKERS = ("…之", "……", "减少对")

# 常见动词（词组以这些动词开头说明是动词短语，考试价值更高）
COMMON_VERBS = frozenset(
    """
    make take get do go have come put turn look break bring call carry catch
    cut drop fall find give hold keep lay let live pay pick pull push run set
    show stand throw try work apply ask be become begin build buy change check
    choose close continue cover create cross decide deliver develop draw drink
    drive eat end enjoy enter fail feel fight fill finish fly follow forget
    grow happen hear help hit hope improve include join jump keep know laugh
    learn leave lend like listen lose love meet miss move need open order pass
    play prefer prepare promise protect prove read receive remember repeat reply
    require rest return ride ring rise save say see sell send serve share shout
    shut sing sit sleep smell smile speak spend start stay stop study succeed
    swim talk teach tell thank think touch travel understand use visit wait
    wake walk want watch wear win wish write worry
    """.split()
)

# 考试高频词组表：word -> phrase(lower) -> levels
# 命中即按此 levels 标注并 +3 分保序，未命中的词组继承单词所在词本 level。
CURATED = {
    "apply": {
        "apply for": ["high-school", "cet4", "cet6"],
        "apply to": ["high-school", "cet4", "cet6"],
        "apply oneself to": ["cet6"],
    },
    "address": {
        "home address": ["high-school", "cet4"],
        "address book": ["cet4"],
        "email address": ["high-school", "cet4"],
        "mailing address": ["cet4", "cet6"],
    },
    "strike": {
        "on strike": ["cet4", "cet6"],
        "general strike": ["cet6"],
        "air strike": ["cet6"],
        "strike at": ["cet6"],
    },
    "charge": {
        "in charge of": ["high-school", "cet4", "cet6"],
        "take charge of": ["cet4", "cet6"],
        "free of charge": ["high-school", "cet4"],
    },
    "character": {
        "main character": ["high-school", "cet4"],
        "moral character": ["cet4", "cet6"],
        "in character": ["cet6"],
    },
    "break": {
        "break down": ["high-school", "cet4"],
        "break out": ["high-school", "cet4"],
        "break up": ["high-school", "cet4"],
        "break into": ["high-school", "cet4"],
        "break off": ["cet4", "cet6"],
        "break through": ["cet4", "cet6"],
    },
    "bring": {
        "bring up": ["high-school", "cet4"],
        "bring about": ["cet4", "cet6"],
        "bring down": ["cet4"],
        "bring out": ["cet4", "cet6"],
        "bring in": ["cet4"],
    },
    "call": {
        "call for": ["high-school", "cet4"],
        "call on": ["high-school", "cet4"],
        "call off": ["cet4", "cet6"],
        "call up": ["high-school", "cet4"],
        "call at": ["high-school"],
    },
    "carry": {
        "carry on": ["high-school", "cet4"],
        "carry out": ["high-school", "cet4", "cet6"],
        "carry away": ["cet4"],
    },
    "come": {
        "come across": ["high-school", "cet4"],
        "come up with": ["high-school", "cet4"],
        "come true": ["high-school"],
        "come out": ["high-school", "cet4"],
        "come back": ["high-school"],
        "come from": ["high-school"],
        "come on": ["high-school"],
        "come about": ["cet4", "cet6"],
        "come to": ["cet4"],
        "come up": ["cet4"],
    },
    "cut": {
        "cut down": ["high-school", "cet4"],
        "cut off": ["cet4", "cet6"],
        "cut out": ["cet4"],
        "cut in": ["cet4", "cet6"],
        "cut up": ["high-school"],
    },
    "do": {
        "do well in": ["high-school"],
        "do one's best": ["high-school"],
        "do with": ["cet4"],
        "do without": ["cet6"],
    },
    "get": {
        "get along with": ["high-school", "cet4"],
        "get rid of": ["high-school", "cet4"],
        "get used to": ["high-school", "cet4"],
        "get over": ["high-school", "cet4"],
        "get through": ["cet4", "cet6"],
        "get down to": ["cet4"],
        "get in": ["high-school"],
        "get off": ["high-school"],
        "get on": ["high-school"],
        "get up": ["high-school"],
        "get to": ["high-school"],
        "get together": ["high-school"],
    },
    "give": {
        "give up": ["high-school", "cet4"],
        "give in": ["high-school", "cet4"],
        "give out": ["cet4", "cet6"],
        "give away": ["cet4"],
        "give back": ["high-school"],
        "give off": ["cet4", "cet6"],
    },
    "go": {
        "go on": ["high-school"],
        "go over": ["high-school", "cet4"],
        "go through": ["cet4", "cet6"],
        "go out": ["high-school"],
        "go up": ["high-school"],
        "go down": ["high-school"],
        "go ahead": ["high-school", "cet4"],
        "go back": ["high-school"],
        "go away": ["high-school"],
        "go in for": ["cet6"],
        "go off": ["cet4"],
    },
    "hold": {
        "hold on": ["high-school", "cet4"],
        "hold up": ["cet4", "cet6"],
        "hold back": ["cet4", "cet6"],
        "hold out": ["cet6"],
    },
    "keep": {
        "keep up with": ["high-school", "cet4"],
        "keep on": ["high-school"],
        "keep away from": ["high-school", "cet4"],
        "keep in touch with": ["high-school", "cet4"],
        "keep off": ["cet4"],
    },
    "look": {
        "look after": ["high-school"],
        "look for": ["high-school"],
        "look forward to": ["high-school", "cet4"],
        "look up": ["high-school", "cet4"],
        "look into": ["cet4", "cet6"],
        "look out": ["high-school", "cet4"],
        "look down upon": ["cet4", "cet6"],
        "look back": ["cet4"],
        "look at": ["high-school"],
        "look like": ["high-school"],
    },
    "make": {
        "make up": ["high-school", "cet4"],
        "make up one's mind": ["high-school"],
        "make use of": ["high-school", "cet4"],
        "make sure": ["high-school"],
        "make friends with": ["high-school"],
        "make fun of": ["high-school", "cet4"],
        "make out": ["cet6"],
        "make for": ["cet6"],
    },
    "pick": {
        "pick up": ["high-school", "cet4"],
        "pick out": ["cet4", "cet6"],
    },
    "put": {
        "put on": ["high-school"],
        "put off": ["high-school", "cet4"],
        "put up": ["high-school", "cet4"],
        "put away": ["high-school", "cet4"],
        "put down": ["cet4"],
        "put forward": ["cet4", "cet6"],
        "put out": ["cet4", "cet6"],
        "put up with": ["cet4", "cet6"],
    },
    "run": {
        "run out of": ["high-school", "cet4"],
        "run away": ["high-school"],
        "run after": ["high-school"],
        "run into": ["cet4", "cet6"],
        "run over": ["cet6"],
    },
    "set": {
        "set up": ["high-school", "cet4"],
        "set off": ["cet4", "cet6"],
        "set out": ["cet4"],
        "set about": ["cet6"],
        "set aside": ["cet4", "cet6"],
    },
    "take": {
        "take care of": ["high-school"],
        "take part in": ["high-school"],
        "take place": ["high-school"],
        "take off": ["high-school", "cet4"],
        "take up": ["high-school", "cet4"],
        "take on": ["cet4", "cet6"],
        "take over": ["cet4", "cet6"],
        "take away": ["high-school", "cet4"],
        "take down": ["cet4"],
        "take in": ["cet4", "cet6"],
        "take out": ["high-school", "cet4"],
    },
    "turn": {
        "turn on": ["high-school"],
        "turn off": ["high-school"],
        "turn up": ["high-school", "cet4"],
        "turn down": ["high-school", "cet4"],
        "turn out": ["cet4", "cet6"],
        "turn to": ["high-school", "cet4"],
        "turn over": ["cet4", "cet6"],
    },
    "work": {
        "work out": ["high-school", "cet4"],
        "work on": ["cet4"],
        "at work": ["high-school"],
        "out of work": ["high-school", "cet4"],
    },
    "deal": {
        "deal with": ["high-school", "cet4"],
        "a great deal of": ["high-school", "cet4"],
    },
    "depend": {
        "depend on": ["high-school", "cet4"],
    },
    "result": {
        "result in": ["high-school", "cet4"],
        "result from": ["high-school", "cet4"],
        "as a result": ["high-school", "cet4"],
        "as a result of": ["cet4"],
    },
    "account": {
        "account for": ["cet4", "cet6"],
        "on account of": ["cet6"],
        "take into account": ["cet4", "cet6"],
    },
    "attention": {
        "pay attention to": ["high-school", "cet4"],
    },
    "stand": {
        "stand for": ["high-school", "cet4"],
        "stand up": ["high-school"],
        "stand by": ["cet4", "cet6"],
        "stand out": ["cet4", "cet6"],
    },
    "catch": {
        "catch up with": ["high-school", "cet4"],
        "catch fire": ["high-school"],
        "catch sight of": ["high-school", "cet4"],
    },
}

# 全大写独立单词（IP、DNA、URL 等）——通常非考试词组
_CAPS_RE = re.compile(r"\b[A-Z]{2,}\b")


def _clean_phrase(p: dict) -> dict | None:
    """去噪：返回干净条目或 None（应丢弃）。"""
    phrase = str(p.get("phrase") or "").strip()
    meaning = str(p.get("meaning") or "").strip()
    if not phrase or not meaning:
        return None
    if "..." in phrase or "..." in meaning:
        return None
    if any(m in meaning for m in SPLICE_MARKERS):
        return None
    if any(m in meaning for m in TECH_MARKERS):
        return None
    if re.search(r"\d", phrase):
        return None
    if _CAPS_RE.search(phrase):
        return None
    words = phrase.split()
    if len(words) < 2 or len(words) > 5:
        return None
    return {"phrase": phrase, "meaning": meaning}


def _score(p: dict, word: str, curated_levels: list[str] | None) -> tuple:
    """打分：(score, word_count, phrase)，供排序。score 高者优先保留。"""
    phrase_lower = p["phrase"].lower()
    target = word.lower()
    score = 0
    if curated_levels is not None:
        score += 3
    if re.search(rf"\b{re.escape(target)}\b", phrase_lower):
        score += 2
    wc = len(p["phrase"].split())
    if wc <= 3:
        score += 1
    first = phrase_lower.split()[0]
    if first in COMMON_VERBS:
        score += 1
    return (score, wc, phrase_lower)


class Command(BaseCommand):
    help = "词组整理：去噪、精选、按词本分级标注（--clean-progress 清理孤儿词组进度）"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="只统计不写入")
        parser.add_argument(
            "--clean-progress", action="store_true",
            help="删除 user_phrase_progress 中词组已从 words.phrases 移除的孤儿记录",
        )
        parser.add_argument("--backup-path", type=str, default=None,
                            help="备份文件路径（默认 <backend>/phrase_backup_<ts>.json）")

    def _load_wordbook_levels(self):
        """word_id -> 所属系统词本的 level 列表。"""
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT ww.word_id, wb.level
                FROM wordbook_words ww
                JOIN wordbooks wb ON wb.id = ww.wordbook_id
                WHERE wb.type = 'system' AND wb.level IS NOT NULL
                """
            )
            rows = cursor.fetchall()
        levels_map: dict[int, list[str]] = {}
        for word_id, level in rows:
            if level in KNOWN_LEVELS:
                levels_map.setdefault(word_id, []).append(level)
        for levels in levels_map.values():
            levels.sort()
        return levels_map

    def _backup(self, words_rows, prog_rows, item_rows, backup_path):
        """写入前备份到服务器 JSON 文件。"""
        import datetime
        from django.conf import settings

        if backup_path:
            path = Path(backup_path)
        else:
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            path = Path(settings.BASE_DIR) / f"phrase_backup_{ts}.json"
        payload = {
            "words": [
                {"id": wid, "word": w, "phrases": json.loads(r) if isinstance(r, str) else r}
                for wid, w, r in words_rows
            ],
            "user_phrase_progress": [
                {"id": pid, "word_id": pwid, "phrase": phr, "phrase_key": pkey}
                for pid, pwid, phr, pkey in prog_rows
            ],
            "daily_study_session_items": [
                {"id": iid, "word_id": iwid, "phrase": iphr, "phrase_key": ikey}
                for iid, iwid, iphr, ikey in item_rows
            ],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        self.stdout.write(f"  已备份到 {path}（{len(payload['words'])} 词 / "
                         f"{len(payload['user_phrase_progress'])} 词组进度 / "
                         f"{len(payload['daily_study_session_items'])} 会话项）")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        clean_progress = options["clean_progress"]
        backup_path = options["backup_path"]
        levels_map = self._load_wordbook_levels()

        total_words = 0
        changed = 0
        dropped_total = 0
        kept_total = 0
        valid_keys: set[str] = set()
        words_rows = []

        with connection.cursor() as cursor:
            cursor.execute("SELECT id, word, phrases FROM words WHERE phrases IS NOT NULL AND phrases <> '[]'")
            rows = cursor.fetchall()
        words_rows = list(rows)

        for word_id, word_text, raw in rows:
            total_words += 1
            try:
                items = json.loads(raw) if isinstance(raw, str) else (raw or [])
            except (TypeError, ValueError):
                continue
            if not isinstance(items, list):
                continue

            inherited = levels_map.get(word_id, [])
            cleaned: list[dict] = []
            dropped = 0
            for item in items:
                if not isinstance(item, dict):
                    dropped += 1
                    continue
                c = _clean_phrase(item)
                if c is None:
                    dropped += 1
                    continue
                cleaned.append(c)

            curated = CURATED.get(word_text.lower())
            for p in cleaned:
                p_lower = p["phrase"].lower()
                levels = None
                if curated and p_lower in curated:
                    levels = curated[p_lower]
                sc = _score(p, word_text, levels)
                p["_score"] = sc
                p["levels"] = levels if levels is not None else list(inherited)

            cleaned.sort(key=lambda x: x["_score"], reverse=True)
            cleaned = cleaned[:4]
            for p in cleaned:
                p.pop("_score", None)

            dropped_total += dropped
            kept_total += len(cleaned)
            for p in cleaned:
                valid_keys.add(f"{word_id}:{p['phrase'].lower()}")

            # 幂等比较：两侧都归一化为 {phrase, meaning, levels}
            old_norm = json.dumps(
                [
                    {"phrase": str(i.get("phrase", "")).strip(),
                     "meaning": str(i.get("meaning", "")).strip(),
                     "levels": i.get("levels") or []}
                    for i in items
                    if isinstance(i, dict) and str(i.get("phrase", "")).strip()
                ],
                ensure_ascii=False,
            )
            new_norm = json.dumps(
                [{"phrase": p["phrase"], "meaning": p["meaning"], "levels": p["levels"]}
                 for p in cleaned],
                ensure_ascii=False,
            )
            if new_norm != old_norm:
                changed += 1
                if not dry_run:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "UPDATE words SET phrases=%s WHERE id=%s",
                            [new_norm, word_id],
                        )

        # ---- 孤儿词组进度/会话项收集（仅在 --clean-progress 时） ----
        prog_rows = []
        item_rows = []
        orphan_prog_ids = []
        orphan_item_ids = []
        if clean_progress:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, word_id, phrase, phrase_key FROM user_phrase_progress")
                prog_rows = list(cursor.fetchall())
                cursor.execute(
                    "SELECT id, word_id, phrase, phrase_key FROM daily_study_session_items WHERE kind='phrase'"
                )
                item_rows = list(cursor.fetchall())
            for pid, p_word_id, p_phrase, _pkey in prog_rows:
                rebuilt = f"{p_word_id}:{str(p_phrase or '').strip().lower()}"
                if rebuilt not in valid_keys:
                    orphan_prog_ids.append(pid)
            for iid, i_word_id, i_phrase, _ikey in item_rows:
                rebuilt = f"{i_word_id}:{str(i_phrase or '').strip().lower()}"
                if rebuilt not in valid_keys:
                    orphan_item_ids.append(iid)

        if not dry_run:
            self._backup(words_rows, prog_rows, item_rows, backup_path)
            if orphan_prog_ids:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM user_phrase_progress WHERE id IN (%s)"
                        % ",".join(["%s"] * len(orphan_prog_ids)),
                        orphan_prog_ids,
                    )
            if orphan_item_ids:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM daily_study_session_items WHERE id IN (%s)"
                        % ",".join(["%s"] * len(orphan_item_ids)),
                        orphan_item_ids,
                    )

        action = "将" if dry_run else "已"
        self.stdout.write(self.style.SUCCESS(
            f"扫描 {total_words} 词，{action}整理 {changed} 词；"
            f"共丢弃 {dropped_total} 条噪音词组，保留 {kept_total} 条"
            + ("（dry-run 未写入）" if dry_run else "")
        ))
        if clean_progress:
            self.stdout.write(self.style.WARNING(
                f"孤儿词组清理：进度 {len(orphan_prog_ids)} 条，会话项 {len(orphan_item_ids)} 条"
                + ("（dry-run 未删除）" if dry_run else " 已删除")
            ))
