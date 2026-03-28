"""Redis cache utility — get/set/invalidate with graceful fallback if Redis is unavailable."""
import json
from typing import Any, Optional

import redis.asyncio as aioredis

from app.config import get_settings

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def cache_get(key: str) -> Optional[Any]:
    try:
        r = await get_redis()
        val = await r.get(key)
        if val is not None:
            return json.loads(val)
    except Exception:
        pass
    return None


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    try:
        r = await get_redis()
        await r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


async def cache_del(pattern: str) -> None:
    try:
        r = await get_redis()
        keys = [k async for k in r.scan_iter(pattern)]
        if keys:
            await r.delete(*keys)
    except Exception:
        pass
