"""全量校验并修复补全数据。

背景：有道 CDN 偶发返回其他词条的缓存响应，早期补全未校验 input 字段，
导致部分单词存储了错误词条的释义/音标/例句（如 although 存了 technician 的数据）。

本命令逐词重新查询有道词典（带 input 校验 + 重试），
对比并更新与数据库不一致的数据。

用法：
    DJANGO_SETTINGS_MODULE=config.settings.prod python manage.py verify_enrichment [--dry-run]
"""

import json
import time

from django.core.management.base import BaseCommand
from django.db import connection

from ...enrich_service import _fetch_word


class Command(BaseCommand):
    help = "全量校验补全数据，修复 CDN 缓存串扰导致的错位"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="只检测不修改")
        parser.add_argument("--sleep", type=float, default=0.55, help="每词间隔秒数")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        sleep_s = options["sleep"]

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, word, IFNULL(definitions,''), IFNULL(phrases,''), "
                "IFNULL(examples,''), IFNULL(pronunciation,'') FROM words ORDER BY id"
            )
            rows = cursor.fetchall()

        total = len(rows)
        fixed = 0
        ok = 0
        failed = 0
        empty = 0

        self.stdout.write(f"开始校验 {total} 个单词{'（dry-run 模式）' if dry_run else ''}...")

        for idx, (wid, word, db_defs, db_phrs, db_exs, db_pron) in enumerate(rows, 1):
            try:
                result = _fetch_word(word)
            except Exception as exc:
                failed += 1
                if idx % 50 == 0 or idx == total:
                    self.stdout.write(f"[{idx}/{total}] {word} 查询失败: {str(exc)[:60]}")
                time.sleep(sleep_s)
                continue

            if result is None:
                # 词典确实无结果
                new_defs, new_phrs, new_exs, new_pron = "[]", "[]", "[]", db_pron
                empty += 1
            else:
                new_defs = json.dumps(result["definitions"], ensure_ascii=False)
                new_phrs = json.dumps(result["phrases"], ensure_ascii=False)
                new_exs = json.dumps(result["examples"], ensure_ascii=False)
                new_pron = result.get("phonetic") or db_pron

            # 对比
            changed = (
                new_defs != db_defs
                or new_phrs != db_phrs
                or new_exs != db_exs
                or (result and result.get("phonetic") and db_pron != result["phonetic"])
            )

            if changed:
                fixed += 1
                new_pron_val = result.get("phonetic") if result else None
                self.stdout.write(
                    f"[{idx}/{total}] 修复 {word} (id={wid}) "
                    f"pron: {db_pron[:20]!r} -> {(new_pron_val or '')[:20]!r}"
                )
                if not dry_run:
                    with connection.cursor() as cursor:
                        if new_pron_val:
                            # 有正确音标→直接覆写（旧值可能是错位数据）
                            cursor.execute(
                                "UPDATE words SET definitions=%s, phrases=%s, examples=%s, "
                                "pronunciation=%s WHERE id=%s",
                                [new_defs, new_phrs, new_exs, new_pron_val, wid],
                            )
                        else:
                            cursor.execute(
                                "UPDATE words SET definitions=%s, phrases=%s, examples=%s "
                                "WHERE id=%s",
                                [new_defs, new_phrs, new_exs, wid],
                            )
            else:
                ok += 1

            if idx % 100 == 0:
                self.stdout.write(
                    f"[{idx}/{total}] 进度: 一致={ok} 修复={fixed} 失败={failed} 无结果={empty}"
                )

            time.sleep(sleep_s)

        self.stdout.write(self.style.SUCCESS(
            f"\n完成！总计 {total} | 一致 {ok} | {'需修复' if dry_run else '已修复'} {fixed} | "
            f"查询失败 {failed} | 词典无结果 {empty}"
        ))
