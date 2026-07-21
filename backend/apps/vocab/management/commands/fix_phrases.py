"""修复历史补全数据中的异常结构。

有道 API 部分词条返回嵌套对象（如 phrase 值为 {"trs":..., "headword": {"l":{"i":...}}}），
早期解析器未处理，导致前端渲染对象而崩溃（React error #31）。
本命令将所有 definitions/phrases/examples 字段规范化为纯字符串结构。

用法：python manage.py fix_phrases [--dry-run]
"""

import json

from django.core.management.base import BaseCommand

from ...enrich_service import _extract_text
from ...models import Word


def _norm_phrase(p) -> dict | None:
    if not isinstance(p, dict):
        return None
    phrase = p.get("phrase")
    phrase = phrase if isinstance(phrase, str) else _extract_text(phrase)
    if not phrase:
        return None
    meaning = p.get("meaning")
    meaning = meaning if isinstance(meaning, str) else _extract_text(meaning)
    return {"phrase": phrase.strip(), "meaning": (meaning or "").strip()}


def _norm_definition(d) -> dict | None:
    if not isinstance(d, dict):
        return None
    pos = d.get("pos")
    pos = pos if isinstance(pos, str) else _extract_text(pos)
    definition = d.get("definition")
    definition = definition if isinstance(definition, str) else _extract_text(definition)
    if not definition:
        return None
    return {"pos": (pos or "释义").strip(), "definition": definition.strip()}


def _norm_example(e) -> dict | None:
    if not isinstance(e, dict):
        return None
    en = e.get("en")
    en = en if isinstance(en, str) else _extract_text(en)
    if not en:
        return None
    zh = e.get("zh")
    zh = zh if isinstance(zh, str) else _extract_text(zh)
    return {"en": en.strip(), "zh": zh.strip() or None}


class Command(BaseCommand):
    help = "规范化 words 表中 definitions/phrases/examples 的 JSON 结构（修复对象嵌套脏数据）"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="只统计不写入")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        fixed = 0
        scanned = 0
        qs = Word.objects.exclude(definitions=None).iterator(chunk_size=500)
        for w in qs:
            scanned += 1
            changed = False
            new_vals = {}

            for field, norm in (
                ("definitions", _norm_definition),
                ("phrases", _norm_phrase),
                ("examples", _norm_example),
            ):
                raw = getattr(w, field)
                if not isinstance(raw, list):
                    continue
                cleaned = []
                field_changed = False
                for item in raw:
                    c = norm(item)
                    if c is None:
                        field_changed = True  # 丢弃无效条目
                        continue
                    if c != item:
                        field_changed = True
                    cleaned.append(c)
                if field_changed:
                    new_vals[field] = cleaned
                    changed = True

            if changed:
                fixed += 1
                if not dry_run:
                    for field, val in new_vals.items():
                        setattr(w, field, val)
                    w.save(update_fields=list(new_vals.keys()))
                if fixed <= 5:
                    self.stdout.write(f"  修复: {w.word} -> {list(new_vals.keys())}")

        action = "将修复" if dry_run else "已修复"
        self.stdout.write(self.style.SUCCESS(
            f"扫描 {scanned} 条，{action} {fixed} 条" + ("（dry-run 未写入）" if dry_run else "")
        ))
