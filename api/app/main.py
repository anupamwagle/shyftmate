from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.routers import auth, users, agreements, rules, chat, telephony, export, audit, health, workforce

settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


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
