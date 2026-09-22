from __future__ import annotations

import json
import os
from typing import Any


class AIProcessor:
    """Small provider boundary for chat and multimodal image processing."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model_name = os.getenv("CHAT_MODEL", "gemini-3.5-flash")
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key:
            return None
        try:
            from google import genai
        except ImportError as exc:
            raise RuntimeError("Install google-genai to enable live AI processing.") from exc
        self._client = genai.Client(api_key=self.api_key)
        return self._client

    def chat(self, content: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        prompt = content.strip()
        if not prompt:
            raise ValueError("content must not be empty")

        client = self._get_client()
        if client is None:
            return {
                "text": "Python AI fallback: the request was received, but GEMINI_API_KEY is not configured.",
                "provider": "offline-fallback",
            }

        history_text = "\n".join(
            f"{item.get('role', 'user')}: {item.get('content', '')}"
            for item in (history or [])[-12:]
        )
        context = f"Conversation history:\n{history_text}\n\n" if history_text else ""
        response = client.models.generate_content(
            model=self.model_name,
            contents=f"{context}User: {prompt}",
        )
        return {"text": response.text or "", "provider": "gemini", "model": self.model_name}

    def detect_objects(self, image_bytes: bytes, mime_type: str) -> dict[str, Any]:
        if not image_bytes:
            raise ValueError("image must not be empty")
        client = self._get_client()
        if client is None:
            return {"objects": [], "provider": "offline-fallback"}

        prompt = (
            "Detect major distinct objects. Return only a JSON array with objects using "
            'the schema [{"box_2d":[ymin,xmin,ymax,xmax],"label":"string","confidence":0.0}]. '
            "Coordinates must be integers from 0 to 1000."
        )
        from google.genai import types

        response = client.models.generate_content(
            model=self.model_name,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        try:
            parsed = json.loads(response.text or "[]")
        except json.JSONDecodeError:
            parsed = []
        return {"objects": parsed if isinstance(parsed, list) else [], "provider": "gemini", "model": self.model_name}
