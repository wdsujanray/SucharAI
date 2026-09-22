from __future__ import annotations

import argparse
import json
from pathlib import Path

from training import LocalIntentModel, evaluate, load_examples, save_artifact, train


DEFAULT_DATASET = Path(__file__).resolve().parents[2] / "ai_training_data.jsonl"
DEFAULT_ARTIFACT = Path(__file__).resolve().parent / "artifacts" / "intent_model.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the SucharAI local intent model.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()

    examples = load_examples(args.dataset)
    artifact = train(examples)
    save_artifact(artifact, args.artifact)
    metrics = evaluate(LocalIntentModel(artifact), examples)
    print(json.dumps({"artifact": str(args.artifact), "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
