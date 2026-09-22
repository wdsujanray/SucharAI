from __future__ import annotations

import json
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


COLLECTIONS = ("users", "conversations", "messages", "documents", "feedbacks")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DataManager:
    """Thread-safe JSON persistence for local chat and user data."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.RLock()
        self._ensure_database()

    def _empty_database(self) -> dict[str, list[dict[str, Any]]]:
        return {collection: [] for collection in COLLECTIONS}

    def _ensure_database(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write(self._empty_database())

    def _read(self) -> dict[str, list[dict[str, Any]]]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid data file: {self.path}") from exc
        if not isinstance(raw, dict):
            raise ValueError("Database root must be an object")
        return {collection: list(raw.get(collection, [])) for collection in COLLECTIONS}

    def _write(self, database: dict[str, list[dict[str, Any]]]) -> None:
        temporary_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary_path.write_text(json.dumps(database, indent=2), encoding="utf-8")
        temporary_path.replace(self.path)

    def list_records(self, collection: str, *, field: str | None = None, value: Any = None) -> list[dict[str, Any]]:
        if collection not in COLLECTIONS:
            raise ValueError(f"Unknown collection: {collection}")
        with self._lock:
            records = self._read()[collection]
            if field is not None:
                records = [record for record in records if record.get(field) == value]
            return deepcopy(records)

    def get_record(self, collection: str, record_id: str | int) -> dict[str, Any] | None:
        records = self.list_records(collection)
        return next((record for record in records if str(record.get("id")) == str(record_id)), None)

    def create_record(self, collection: str, record: dict[str, Any]) -> dict[str, Any]:
        if collection not in COLLECTIONS:
            raise ValueError(f"Unknown collection: {collection}")
        if not record.get("id"):
            raise ValueError("record id is required")
        with self._lock:
            database = self._read()
            if any(str(item.get("id")) == str(record["id"]) for item in database[collection]):
                raise ValueError(f"Record already exists: {record['id']}")
            created = {**record, "createdAt": record.get("createdAt", utc_now())}
            database[collection].append(created)
            self._write(database)
            return deepcopy(created)

    def update_record(self, collection: str, record_id: str | int, updates: dict[str, Any]) -> dict[str, Any]:
        if collection not in COLLECTIONS:
            raise ValueError(f"Unknown collection: {collection}")
        with self._lock:
            database = self._read()
            for index, record in enumerate(database[collection]):
                if str(record.get("id")) == str(record_id):
                    updated = {**record, **updates, "updatedAt": utc_now()}
                    database[collection][index] = updated
                    self._write(database)
                    return deepcopy(updated)
        raise KeyError(f"Record not found: {collection}/{record_id}")

    def delete_record(self, collection: str, record_id: str | int) -> bool:
        if collection not in COLLECTIONS:
            raise ValueError(f"Unknown collection: {collection}")
        with self._lock:
            database = self._read()
            before = len(database[collection])
            database[collection] = [item for item in database[collection] if str(item.get("id")) != str(record_id)]
            if len(database[collection]) == before:
                return False
            self._write(database)
            return True

    def conversation_bundle(self, conversation_id: str | int) -> dict[str, list[dict[str, Any]]]:
        conversation = self.get_record("conversations", conversation_id)
        if conversation is None:
            raise KeyError(f"Conversation not found: {conversation_id}")
        return {
            "conversation": [conversation],
            "messages": self.list_records("messages", field="conversationId", value=conversation_id),
            "documents": self.list_records("documents", field="conversationId", value=conversation_id),
        }
