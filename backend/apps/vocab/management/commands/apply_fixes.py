"""应用本地校验生成的修复数据（word_fixes.json）。

服务器 IP 被有道反爬限制时，在校验干净的本地机器运行
scripts/verify_enrichment_local.py 生成修复数据，再用本命令写入数据库。

用法：
    python manage.py apply_fixes /path/to/word_fixes.json [--dry-run]
"""

import json

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "应用 word_fixes.json 中的释义修复数据"

    def add_arguments(self, parser):
        parser.add_argument("fixes_file", help="word_fixes.json 路径")
        parser.add_argument("--dry-run", action="store_true", help="只统计不修改")

    def handle(self, *args, **options):
        fixes = json.load(open(options["fixes_file"]))
        dry_run = options["dry_run"]
        self.stdout.write(f"载入 {len(fixes)} 条修复{'（dry-run）' if dry_run else ''}")

        applied = 0
        with connection.cursor() as cursor:
            for fix in fixes:
                if dry_run:
                    applied += 1
                    continue
                pron = fix.get("pronunciation")
                if pron:
                    cursor.execute(
                        "UPDATE words SET definitions=%s, phrases=%s, examples=%s, "
                        "pronunciation=%s WHERE id=%s",
                        [fix["definitions"], fix["phrases"], fix["examples"], pron, fix["id"]],
                    )
                else:
                    cursor.execute(
                        "UPDATE words SET definitions=%s, phrases=%s, examples=%s WHERE id=%s",
                        [fix["definitions"], fix["phrases"], fix["examples"], fix["id"]],
                    )
                applied += cursor.rowcount if cursor.rowcount > 0 else 0

        self.stdout.write(self.style.SUCCESS(
            f"完成：{'需修复' if dry_run else '已修复'} {applied}/{len(fixes)} 条"
        ))
