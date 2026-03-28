from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.core.seed import run_seed
from app.database import get_db
from app.limiter import limiter
from app.routers import auth, users, agreements, rules, chat, telephony, export, audit, health, workforce

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation
    s = get_settings()
    required_for_prod = [
        ("DATABASE_URL", s.DATABASE_URL),
        ("JWT_SECRET", s.JWT_SECRET),
        ("AWS_ACCESS_KEY_ID", s.AWS_ACCESS_KEY_ID),
        ("AWS_SECRET_ACCESS_KEY", s.AWS_SECRET_ACCESS_KEY),
        ("SES_FROM_EMAIL", s.SES_FROM_EMAIL),
    ]
    missing = [name for name, val in required_for_prod if not val]
    if missing:
        import sys
        print(f"[STARTUP ERROR] Missing required env vars: {', '.join(missing)}", file=sys.stderr)
        if not s.is_dev:
            raise RuntimeError(f"Missing required env vars for prod: {', '.join(missing)}")

    if s.LLM_PROVIDER == "anthropic" and not s.ANTHROPIC_API_KEY:
        import sys
        print("[STARTUP WARNING] LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set", file=sys.stderr)

    print(f"[STARTUP] Gator API starting — ENV={s.ENV}, LLM={s.LLM_PROVIDER}")
    try:
        async for db in get_db():
            await run_seed(db)
            break
    except Exception as exc:
        import sys
        print(
            f"[STARTUP ERROR] Seed failed — database tables may not exist.\n"
            f"  Run: cd api && alembic upgrade head\n"
            f"  Detail: {exc}",
            file=sys.stderr,
        )
        raise RuntimeError(
            "Database not initialised. Run 'alembic upgrade head' first."
        ) from exc
    yield
    print("[SHUTDOWN] Gator API stopping")


app = FastAPI(
    title="Gator + Shyftmate API",
    description="AI-powered workforce management and award rule configuration platform",
    version="0.1.0",
    docs_url="/docs" if settings.is_dev else None,
    redoc_url="/redoc" if settings.is_dev else None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again.",
            "detail": str(exc) if settings.is_dev else None,
        },
    )


# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1", tags=["Users & Orgs"])
app.include_router(agreements.router, prefix="/api/v1", tags=["Agreements"])
app.include_router(rules.router, prefix="/api/v1", tags=["Rule Lines"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(telephony.router, prefix="/api/v1/telephony", tags=["Telephony"])
app.include_router(export.router, prefix="/api/v1/export", tags=["Export"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(workforce.router, prefix="/api/v1", tags=["Workforce"])
