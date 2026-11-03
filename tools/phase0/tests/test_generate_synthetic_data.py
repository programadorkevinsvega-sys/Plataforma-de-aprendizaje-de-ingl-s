from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import generate_synthetic_data as generator  # noqa: E402


class SyntheticFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.personas, cls.content = generator.load_fixtures()

    def test_fixture_catalog_has_unique_keys_and_valid_levels(self) -> None:
        persona_keys = [item["key"] for item in self.personas]
        content_ids = [item["id"] for item in self.content]
        self.assertEqual(len(persona_keys), len(set(persona_keys)))
        self.assertEqual(len(content_ids), len(set(content_ids)))
        self.assertTrue(all(item["current_level"] in {"A0", "A1", "A2", "B1", "B2", "C1"} for item in self.personas))
        self.assertTrue(all(item["level"] in {"A0", "A1", "A2", "B1", "B2", "C1"} for item in self.content))

    def test_generation_is_reproducible_for_same_seed(self) -> None:
        first = list(generator.generate_records(25, 12345, self.personas, self.content))
        second = list(generator.generate_records(25, 12345, self.personas, self.content))
        self.assertEqual(first, second)

    def test_generation_changes_with_seed_and_has_isolated_synthetic_identity(self) -> None:
        first = list(generator.generate_records(25, 12345, self.personas, self.content))
        second = list(generator.generate_records(25, 54321, self.personas, self.content))
        self.assertNotEqual(first, second)

        user_ids = [record["user_id"] for record in first]
        emails = [record["email"] for record in first]
        self.assertEqual(len(user_ids), len(set(user_ids)))
        self.assertEqual(len(emails), len(set(emails)))
        self.assertTrue(all(email.endswith("@fixtures.invalid") for email in emails))
        self.assertTrue(all(record["tenant_id"] == record["user_id"] for record in first))

        forbidden = {"password", "password_hash", "access_token", "refresh_token", "jwt"}
        for record in first:
            self.assertTrue(forbidden.isdisjoint(record))

    def test_jsonl_writer_emits_requested_record_count(self) -> None:
        records = generator.generate_records(3, 99, self.personas, self.content)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "users.jsonl"
            written = generator.write_jsonl(records, output)
            self.assertEqual(written, 3)
            self.assertEqual(len(output.read_text(encoding="utf-8").splitlines()), 3)

    def test_generation_rejects_unbounded_counts_and_invalid_ranges(self) -> None:
        with self.assertRaises(ValueError):
            list(generator.generate_records(0, 1, self.personas, self.content))
        with self.assertRaises(ValueError):
            generator.validate_range([5, 2], "sample")


if __name__ == "__main__":
    unittest.main()
