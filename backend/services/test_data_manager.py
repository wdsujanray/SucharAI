from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from data_manager import DataManager


class DataManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.manager = DataManager(Path(self.temp_dir.name) / "db.json")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_user_and_conversation_crud(self) -> None:
        self.manager.create_record("users", {"id": "u1", "email": "user@example.com"})
        self.manager.create_record("conversations", {"id": "c1", "userId": "u1", "title": "First chat"})
        updated = self.manager.update_record("conversations", "c1", {"title": "Renamed chat"})

        self.assertEqual(updated["title"], "Renamed chat")
        self.assertEqual(self.manager.get_record("users", "u1")["email"], "user@example.com")
        self.assertTrue(self.manager.delete_record("conversations", "c1"))
        self.assertIsNone(self.manager.get_record("conversations", "c1"))

    def test_conversation_bundle_groups_related_data(self) -> None:
        self.manager.create_record("conversations", {"id": "c1", "userId": "u1", "title": "Chat"})
        self.manager.create_record("messages", {"id": "m1", "conversationId": "c1", "role": "user", "content": "Hello"})
        self.manager.create_record("documents", {"id": "d1", "conversationId": "c1", "filename": "notes.txt"})

        bundle = self.manager.conversation_bundle("c1")
        self.assertEqual(len(bundle["messages"]), 1)
        self.assertEqual(len(bundle["documents"]), 1)


if __name__ == "__main__":
    unittest.main()
