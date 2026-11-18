#!/usr/bin/env python3
"""Generate deterministic, non-production DevFluency load-test identities."""

from __future__ import annotations

import argparse
import json
import random
import uuid
from pathlib import Path
from typing import Any, Iterable

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_ROOT = REPOSITORY_ROOT / "tests" / "fixtures" / "phase0"
PERSONAS_FILE = FIXTURE_ROOT / "personas.json"
CONTENT_FILE = FIXTURE_ROOT / "content.json"

FIRST_NAMES = ("Alex", "Casey", "Jordan", "Morgan", "Riley", "Sam", "Taylor", "Jamie")
LAST_NAMES = ("Example", "Fixture", "Sample", "Synthetic", "Tester", "Learner")


def load_fixture_file(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"{path.name} must contain a JSON array of objects")
    return value


def load_fixtures() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    personas = load_fixture_file(PERSONAS_FILE)
    content = load_fixture_file(CONTENT_FILE)
    if not personas:
        raise ValueError("At least one synthetic persona is required")
    if not content:
        raise ValueError("At least one synthetic content item is required")
    return personas, content


def validate_range(value: Any, field: str) -> tuple[int, int]:
    if (
        not isinstance(value, list)
        or len(value) != 2
        or not all(isinstance(item, int) for item in value)
        or value[0] < 0
        or value[1] < value[0]
    ):
        raise ValueError(f"{field} must be a two-item non-negative integer range")
    return value[0], value[1]


def generate_records(
    count: int,
    seed: int,
    personas: list[dict[str, Any]],
    content: list[dict[str, Any]],
) -> Iterable[dict[str, Any]]:
    if count < 1 or count > 100_000:
        raise ValueError("count must be between 1 and 100000")

    rng = random.Random(seed)
    for index in range(count):
        persona = personas[rng.randrange(len(personas))]
        word = content[rng.randrange(len(content))]
        words_min, words_max = validate_range(
            persona.get("words_mastered_range"), "words_mastered_range"
        )
        due_min, due_max = validate_range(
            persona.get("due_reviews_range"), "due_reviews_range"
        )

        user_id = str(
            uuid.uuid5(uuid.NAMESPACE_URL, f"devfluency-phase0:{seed}:{index + 1}")
        )
        yield {
            "fixture_version": 1,
            "sequence": index + 1,
            "user_id": user_id,
            "tenant_id": user_id,
            "email": f"load-{seed}-{index + 1:06d}@fixtures.invalid",
            "full_name": (
                f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)} "
                f"{index + 1:06d}"
            ),
            "current_level": persona["current_level"],
            "target_role": persona["target_role"],
            "persona": persona["key"],
            "words_mastered": rng.randint(words_min, words_max),
            "due_reviews": rng.randint(due_min, due_max),
            "sample_content_id": word["id"],
        }


def write_jsonl(records: Iterable[dict[str, Any]], output: Path) -> int:
    output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output.open("w", encoding="utf-8", newline="\n") as destination:
        for record in records:
            destination.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            destination.write("\n")
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=250, help="number of synthetic users")
    parser.add_argument("--seed", type=int, default=20261102, help="deterministic RNG seed")
    parser.add_argument(
        "--output",
        type=Path,
        default=REPOSITORY_ROOT / "artifacts" / "phase0" / "synthetic-users.jsonl",
    )
    args = parser.parse_args()

    personas, content = load_fixtures()
    created = write_jsonl(generate_records(args.count, args.seed, personas, content), args.output)
    print(f"Generated {created} synthetic users (seed={args.seed}) at {args.output}")
    print("All generated email addresses use the reserved .invalid domain.")
    print("No password, access token, refresh token or real user data is generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
