"""
管理员权限校验。

跨库查询 GESP (gesp_trainer) 的 user_profile.is_admin 字段，
结果缓存到 Redis 5 分钟，避免每次请求都跨库。
"""

import logging

from django.db import connection

logger = logging.getLogger(__name__)

CACHE_TIMEOUT = 300  # 5 分钟


def is_admin_user(user_id: int) -> bool:
    """检查 user_id 是否为管理员（查 gesp_trainer.user_profile）。"""
    # 先查 Redis 缓存
    try:
        from django.core.cache import cache

        cache_key = f"learning:is_admin:{user_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass  # Redis 不可用时降级为直接查库

    # 跨库原始 SQL（同一 MySQL 实例）
    result = False
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT up.is_admin "
                "FROM gesp_trainer.user_profile up "
                "JOIN gesp_trainer.auth_user au ON up.user_id = au.id "
                "WHERE au.id = %s",
                [user_id],
            )
            row = cursor.fetchone()
            result = bool(row[0]) if row else False
    except Exception as exc:
        logger.warning("跨库查询管理员状态失败: %s", exc)
        result = False

    # 写入缓存
    try:
        from django.core.cache import cache

        cache.set(cache_key, result, CACHE_TIMEOUT)
    except Exception:
        pass

    return result


def invalidate_admin_cache(user_id: int) -> None:
    """清除管理员状态缓存。"""
    try:
        from django.core.cache import cache

        cache.delete(f"learning:is_admin:{user_id}")
    except Exception:
        pass
