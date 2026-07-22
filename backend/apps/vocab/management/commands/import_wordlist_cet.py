"""
导入 CET-4 / CET-6 内置词表到数据库。

数据源：lib/seedWordsCet4.ts / lib/seedWordsCet6.ts
（KyleBing/english-vocabulary CET4-顺序 / CET6-顺序，开放授权）

用法：
    python manage.py import_wordlist_cet
    python manage.py import_wordlist_cet --level cet4
    python manage.py import_wordlist_cet --level cet6
    python manage.py import_wordlist_cet --dry-run
"""

import json
import re
import time
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.vocab.models import Word, Wordbook, WordbookWord

# 项目根目录（backend/apps/vocab/management/commands/ -> 上6级 = wordhoard/）
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent.parent

LEVELS = {
    "cet4": {
        "seed_file": PROJECT_ROOT / "lib" / "seedWordsCet4.ts",
        "name": "四级",
        "source": "KyleBing/english-vocabulary CET4-顺序 (open)",
    },
    "cet6": {
        "seed_file": PROJECT_ROOT / "lib" / "seedWordsCet6.ts",
        "name": "六级",
        "source": "KyleBing/english-vocabulary CET6-顺序 (open)",
    },
}


class Command(BaseCommand):
    help = "导入 CET-4/CET-6 内置词表（系统词本）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--level",
            choices=["cet4", "cet6"],
            help="只导入指定级别（默认两个都导入）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="只统计，不写入数据库",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        levels_to_import = (
            [options["level"]] if options["level"] else ["cet4", "cet6"]
        )

        for level in levels_to_import:
            self._import_level(level, dry_run)

    def _import_level(self, level: str, dry_run: bool):
        cfg = LEVELS[level]
        seed_file = cfg["seed_file"]

        self.stdout.write(f"\n{'='*50}")
        self.stdout.write(f"导入 {cfg['name']}（{level}）词表")
        self.stdout.write(f"{'='*50}")

        # 1. 解析 seed TS 文件
        self.stdout.write(f"读取词表: {seed_file}")
        if not seed_file.exists():
            self.stderr.write(self.style.ERROR(f"文件不存在: {seed_file}"))
            return

        content = seed_file.read_text(encoding="utf-8")
        match = re.search(r"=\s*(\[.*\])\s*;?\s*$", content, re.DOTALL)
        if not match:
            self.stderr.write(self.style.ERROR(f"无法解析 {seed_file.name} 中的数组"))
            return

        seed_words = json.loads(match.group(1))
        self.stdout.write(f"  解析到 {len(seed_words)} 条词条")

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] {cfg['name']} 不写入数据库"))
            return

        # 2. 创建/获取系统词本
        now_ms = int(time.time() * 1000)
        wb, created = Wordbook.objects.get_or_create(
            owner_id=None,
            name=cfg["name"],
            defaults={
                "level": level,
                "type": Wordbook.Type.SYSTEM,
                "source": cfg["source"],
                "created_at": now_ms,
            },
        )
        if created:
            self.stdout.write(f"  创建系统词本: {wb.name} (id={wb.id})")
        else:
            self.stdout.write(f"  系统词本已存在: {wb.name} (id={wb.id})")

        # 3. 批量导入单词（大小写不敏感去重）
        existing_words = set(
            w.lower()
            for w in Word.objects.filter(
                word__in=[s["word"] for s in seed_words]
            ).values_list("word", flat=True)
        )

        words_to_create = []
        new_count = 0
        for item in seed_words:
            w = item["word"].strip()
            if not w or w.lower() in existing_words:
                continue
            words_to_create.append(Word(
                word=w,
                translation=item["translation"],
                pronunciation=None,
            ))
            existing_words.add(w.lower())
            new_count += 1

        if words_to_create:
            Word.objects.bulk_create(words_to_create, batch_size=500)
        self.stdout.write(f"  新增单词: {new_count} 条（已有跳过: {len(seed_words) - new_count}）")

        # 4. 关联词本-单词
        all_words = Word.objects.filter(
            word__in=[s["word"].strip() for s in seed_words]
        )
        word_id_map = {w.word.lower(): w.id for w in all_words}

        existing_links = set(
            WordbookWord.objects.filter(wordbook=wb).values_list("word_id", flat=True)
        )
        links_to_create = []
        for item in seed_words:
            w = item["word"].strip()
            wid = word_id_map.get(w.lower())
            if wid and wid not in existing_links:
                links_to_create.append(WordbookWord(wordbook=wb, word_id=wid))
                existing_links.add(wid)

        if links_to_create:
            WordbookWord.objects.bulk_create(links_to_create, batch_size=500)
        self.stdout.write(f"  新增词本关联: {len(links_to_create)} 条")

        # 5. 统计
        total_words = WordbookWord.objects.filter(wordbook=wb).count()
        self.stdout.write(self.style.SUCCESS(
            f"完成！词本「{wb.name}」共 {total_words} 个单词"
        ))
