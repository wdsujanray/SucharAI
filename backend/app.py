from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ai_engine.processor import AIProcessor

app = FastAPI(title="SucharAI Python AI Service", version="1.0.0")
processor = AIProcessor()


class ChatRequest(BaseModel):
    content: str = Field(min_length=1)
    history: list[dict] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"status": "ok", "service": "sucharai-python-ai", "live_ai_configured": bool(processor.api_key)}


@app.post("/api/ai/chat")
def chat(request: ChatRequest) -> dict:
    try:
        return processor.chat(request.content, request.history)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc


@app.post("/api/ai/object-detection")
async def object_detection(image: UploadFile = File(...)) -> dict:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        return processor.detect_objects(await image.read(), image.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc
