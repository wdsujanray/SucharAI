import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
from backend.database import Base, engine
from backend.routes import auth_routes, chat_routes

# Create databases tables on start if SQLite is used, or in PostgreSQL
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Database table generation failed or skipped: {e}")

app = FastAPI(
    title="AI Chatbot Backend",
    description="FastAPI-powered scalable Chatbot API with modular structure, secure JWT Auth, RAG search and voice input.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis Rate Limiting Setup (simulated if redis is unavailable, or using active redis client)
# This implements sliding window rate limiting.
RATE_LIMIT_REQUESTS = 60  # 60 requests
RATE_LIMIT_WINDOW = 60    # per 60 seconds

# In-memory rate limiting tracker (fallback if Redis isn't configured)
_rate_limits = {}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    now = time.time()
    
    # Try using Redis if possible, otherwise use local fallback
    try:
        import redis
        REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.Redis.from_url(REDIS_URL, socket_timeout=1)
        # Check connection
        r.ping()
        
        key = f"rate_limit:{client_ip}"
        requests = r.lrange(key, 0, -1)
        # Clean expired timestamps
        requests = [float(req) for req in requests if now - float(req) < RATE_LIMIT_WINDOW]
        
        if len(requests) >= RATE_LIMIT_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again in a minute."}
            )
            
        r.delete(key)
        for req in requests:
            r.rpush(key, req)
        r.rpush(key, now)
        r.expire(key, RATE_LIMIT_WINDOW)
    except Exception:
        # Fallback to local memory tracking
        if client_ip not in _rate_limits:
            _rate_limits[client_ip] = []
        
        # Clean expired timestamps
        _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < RATE_LIMIT_WINDOW]
        
        if len(_rate_limits[client_ip]) >= RATE_LIMIT_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again in a minute."}
            )
            
        _rate_limits[client_ip].append(now)

    response = await call_next(request)
    return response

# Logging & request timing middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    formatted_process_time = "{0:.2f}".format(process_time)
    print(f"Request: {request.method} {request.url.path} Completed in {formatted_process_time}ms | Status Code: {response.status_code}")
    return response

# Register routers
app.include_router(auth_routes.router)
app.include_router(chat_routes.router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "AI Chatbot Backend API",
        "docs": "/docs"
    }
