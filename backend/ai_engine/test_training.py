from __future__ import annotations

import unittest

from training import LocalIntentModel, evaluate, train


class TrainingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.examples = [
            {"text": "hello assistant", "label": "greeting"},
            {"text": "good morning", "label": "greeting"},
            {"text": "summarize my document", "label": "document_analysis"},
            {"text": "analyze this file", "label": "document_analysis"},
        ]
        self.model = LocalIntentModel(train(self.examples))

    def test_predicts_known_intent(self) -> None:
        result = self.model.predict("please summarize this document")
        self.assertEqual(result["label"], "document_analysis")
        self.assertGreaterEqual(result["confidence"], 0.5)

    def test_evaluation_reports_accuracy(self) -> None:
        metrics = evaluate(self.model, self.examples)
        self.assertEqual(metrics["total"], 4)
        self.assertEqual(metrics["correct"], 4)
        self.assertEqual(metrics["accuracy"], 1.0)


if __name__ == "__main__":
    unittest.main()