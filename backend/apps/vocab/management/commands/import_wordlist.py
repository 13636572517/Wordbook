"""
导入内置词表到数据库。

数据源：lib/seedWords.ts（KyleBing/english-vocabulary 高中-乱序，6008 条）
可选：lib/data/dictCache.json（有道词典缓存，含音标）

用法：
    python manage.py import_wordlist
    python manage.py import_wordlist --dry-run
"""

import json
import re
import time
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.vocab.models import Word, Wordbook, WordbookWord

# 项目根目录（backend/apps/vocab/management/commands/ -> 上6级 = wordhoard/）
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent.parent
SEED_FILE = PROJECT_ROOT / "lib" / "seedWords.ts"
DICT_CACHE_FILE = PROJECT_ROOT / "lib" / "data" / "dictCache.json"


class Command(BaseCommand):
    help = "导入高中内置词表（系统词本）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="只统计，不写入数据库",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        # 1. 解析 seedWords.ts
        self.stdout.write(f"读取词表: {SEED_FILE}")
        if not SEED_FILE.exists():
            self.stderr.write(self.style.ERROR(f"文件不存在: {SEED_FILE}"))
            return

        content = SEED_FILE.read_text(encoding="utf-8")
        # 提取 JSON 数组部分（在 "= [" 和 "];" 之间）
        match = re.search(r"=\s*(\[.*\])\s*;?\s*$", content, re.DOTALL)
        if not match:
            self.stderr.write(self.style.ERROR("无法解析 seedWords.ts 中的数组"))
            return

        seed_words = json.loads(match.group(1))
        self.stdout.write(f"  解析到 {len(seed_words)} 条词条")

        # 2. 加载音标缓存（可选）
        ipa_map = {}
        if DICT_CACHE_FILE.exists():
            try:
                cache = json.loads(DICT_CACHE_FILE.read_text(encoding="utf-8"))
                for word_key, info in cache.items():
                    if isinstance(info, dict) and info.get("phonetic"):
                        ipa_map[word_key] = info["phonetic"]
                self.stdout.write(f"  加载音标缓存: {len(ipa_map)} 条")
            except (json.JSONDecodeError, KeyError):
                self.stdout.write("  音标缓存解析失败，跳过")

        if dry_run:
            self.stdout.write(self.style.WARNING("[DRY RUN] 不写入数据库"))
            return

        # 3. 创建/获取系统词本
        now_ms = int(time.time() * 1000)
        wb, created = Wordbook.objects.get_or_create(
            owner_id=None,
            name="高中",
            defaults={
                "level": "high-school",
                "type": Wordbook.Type.SYSTEM,
                "source": "KyleBing/english-vocabulary 高中-乱序 (open)",
                "created_at": now_ms,
            },
        )
        if created:
            self.stdout.write(f"  创建系统词本: {wb.name} (id={wb.id})")
        else:
            self.stdout.write(f"  系统词本已存在: {wb.name} (id={wb.id})")

        # 4. 批量导入单词
        words_to_create = []
        existing_words = set(
            Word.objects.filter(
                word__in=[s["word"] for s in seed_words]
            ).values_list("word", flat=True)
        )

        new_count = 0
        for item in seed_words:
            w = item["word"].strip()
            if not w or w in existing_words:
                continue
            pronunciation = ipa_map.get(w.lower())
            words_to_create.append(Word(
                word=w,
                translation=item["translation"],
                pronunciation=pronunciation,
            ))
            existing_words.add(w)
            new_count += 1

        if words_to_create:
            Word.objects.bulk_create(words_to_create, batch_size=500)
        self.stdout.write(f"  新增单词: {new_count} 条")

        # 4b. 更新已有单词的音标
        if ipa_map:
            updated_ipa = 0
            existing_word_objs = Word.objects.filter(
                word__in=list(ipa_map.keys()),
                pronunciation__isnull=True,
            )
            for w_obj in existing_word_objs:
                w_obj.pronunciation = ipa_map.get(w_obj.word.lower())
                if w_obj.pronunciation:
                    w_obj.save(update_fields=["pronunciation"])
                    updated_ipa += 1
            self.stdout.write(f"  更新音标: {updated_ipa} 条")

        # 5. 关联词本-单词
        all_words = Word.objects.filter(
            word__in=[s["word"].strip() for s in seed_words]
        )
        word_id_map = {w.word: w.id for w in all_words}

        existing_links = set(
            WordbookWord.objects.filter(wordbook=wb).values_list("word_id", flat=True)
        )
        links_to_create = []
        for item in seed_words:
            w = item["word"].strip()
            wid = word_id_map.get(w)
            if wid and wid not in existing_links:
                links_to_create.append(WordbookWord(wordbook=wb, word_id=wid))
                existing_links.add(wid)

        if links_to_create:
            WordbookWord.objects.bulk_create(links_to_create, batch_size=500)
        self.stdout.write(f"  新增词本关联: {len(links_to_create)} 条")

        # 6. 统计
        total_words = WordbookWord.objects.filter(wordbook=wb).count()
        self.stdout.write(self.style.SUCCESS(
            f"\n完成！词本「{wb.name}」共 {total_words} 个单词"
        ))
