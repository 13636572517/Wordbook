"""
管理员 / 教师权限校验。

- is_admin_user: 跨库查 gesp_trainer.user_profile.is_admin
- is_teacher_or_admin: 跨库查 is_teacher OR is_admin（学员统计用）
结果缓存到 Redis 5 分钟，避免每次请求都跨库。
"""

import logging

from django.db import connection

logger = logging.getLogger(__name__)

CACHE_TIMEOUT = 300  # 5 分钟


def _query_gesp_profile(user_id: int, fields: tuple) -> dict | None:
    """跨库查询 gesp_trainer.user_profile（同一 MySQL 实例）。"""
    cols = ", ".join(f"up.{f}" for f in fields)
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT {cols} "
            "FROM gesp_trainer.user_profile up "
            "JOIN gesp_trainer.auth_user au ON up.user_id = au.id "
            "WHERE au.id = %s",
            [user_id],
        )
        row = cursor.fetchone()
    if not row:
        return None
    return dict(zip(fields, row))


def is_admin_user(user_id: int) -> bool:
    """检查 user_id 是否为管理员（查 gesp_trainer.user_profile）。"""
    cache_key = f"learning:is_admin:{user_id}"
    try:
        from django.core.cache import cache
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    result = False
    try:
        profile = _query_gesp_profile(user_id, ("is_admin",))
        result = bool(profile["is_admin"]) if profile else False
    except Exception as exc:
        logger.warning("跨库查询管理员状态失败: %s", exc)

    try:
        from django.core.cache import cache
        cache.set(cache_key, result, CACHE_TIMEOUT)
    except Exception:
        pass
    return result


def is_teacher_or_admin(user_id: int) -> bool:
    """
    检查 user_id 是否为教师或管理员（学员统计等教学功能用）。
    同时查 is_teacher 和 is_admin，有一个为真即通过。
    """
    cache_key = f"learning:is_teacher_or_admin:{user_id}"
    try:
        from django.core.cache import cache
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    result = False
    try:
        profile = _query_gesp_profile(user_id, ("is_teacher", "is_admin"))
        if profile:
            result = bool(profile["is_teacher"]) or bool(profile["is_admin"])
    except Exception as exc:
        logger.warning("跨库查询教师/管理员状态失败: %s", exc)

    try:
        from django.core.cache import cache
        cache.set(cache_key, result, CACHE_TIMEOUT)
    except Exception:
        pass
    return result


def invalidate_admin_cache(user_id: int) -> None:
    """清除管理员 / 教师状态缓存。"""
    try:
        from django.core.cache import cache
        cache.delete(f"learning:is_admin:{user_id}")
        cache.delete(f"learning:is_teacher_or_admin:{user_id}")
    except Exception:
        pass
