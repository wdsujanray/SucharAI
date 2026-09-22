from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

TOKEN_PATTERN = re.compile(r"[a-z0-9']+")


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def load_examples(path: Path) -> list[dict[str, str]]:
    examples: list[dict[str, str]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        item = json.loads(line)
        if not isinstance(item, dict) or not item.get("text") or not item.get("label"):
            raise ValueError(f"Invalid training example on line {line_number}")
        examples.append({"text": str(item["text"]), "label": str(item["label"])})
    if not examples:
        raise ValueError(f"No training examples found in {path}")
    return examples


def train(examples: Iterable[dict[str, str]]) -> dict[str, Any]:
    rows = list(examples)
    labels = sorted({row["label"] for row in rows})
    document_frequency = Counter()
    label_counts = Counter(row["label"] for row in rows)
    term_counts: dict[str, Counter[str]] = defaultdict(Counter)

    for row in rows:
        tokens = set(tokenize(row["text"]))
        document_frequency.update(tokens)
        term_counts[row["label"]].update(tokenize(row["text"]))

    vocabulary = sorted(document_frequency)
    total_documents = len(rows)
    weights: dict[str, dict[str, float]] = {}
    for label in labels:
        total_terms = sum(term_counts[label].values())
        weights[label] = {
            token: (term_counts[label][token] + 1) / (total_terms + len(vocabulary))
            for token in vocabulary
        }

    return {
        "version": 1,
        "labels": labels,
        "documents": total_documents,
        "priors": {label: label_counts[label] / total_documents for label in labels},
        "weights": weights,
    }


class LocalIntentModel:
    def __init__(self, artifact: dict[str, Any]) -> None:
        self.artifact = artifact

    def predict(self, text: str) -> dict[str, Any]:
        tokens = tokenize(text)
        if not tokens:
            raise ValueError("text must not be empty")
        scores: dict[str, float] = {}
        for label in self.artifact["labels"]:
            score = math.log(self.artifact["priors"][label])
            weights = self.artifact["weights"][label]
            unknown_weight = 1 / (sum(weights.values()) + len(weights))
            for token in tokens:
                score += math.log(weights.get(token, unknown_weight))
            scores[label] = score
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        best_label, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else best_score
        confidence = 1 / (1 + math.exp(min(0, second_score - best_score)))
        return {"label": best_label, "confidence": round(confidence, 4), "scores": scores}


def save_artifact(artifact: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")


def load_artifact(path: Path) -> LocalIntentModel:
    return LocalIntentModel(json.loads(path.read_text(encoding="utf-8")))


def evaluate(model: LocalIntentModel, examples: Iterable[dict[str, str]]) -> dict[str, Any]:
    rows = list(examples)
    correct = sum(model.predict(row["text"])["label"] == row["label"] for row in rows)
    return {"total": len(rows), "correct": correct, "accuracy": round(correct / len(rows), 4) if rows else 0.0}
