import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "tests/fixtures/curriculum/phase1_3_content_package_v1.json"
VALIDATOR = ROOT / "tools/curriculum/validate_content_package.py"

sys.path.insert(0, str(VALIDATOR.parent))
from validate_content_package import canonical_sha256, validate_package  # noqa: E402


class CurriculumContentPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def errors(self, mutate=None):
        data = copy.deepcopy(self.fixture)
        if mutate:
            mutate(data)
        return validate_package(data)

    def assert_error_contains(self, errors, fragment):
        self.assertTrue(
            any(fragment in error for error in errors),
            f"Expected error containing {fragment!r}; got: {errors}",
        )

    def test_reference_package_is_valid_and_hash_is_stable(self):
        self.assertEqual(validate_package(self.fixture), [])
        self.assertEqual(canonical_sha256(self.fixture), canonical_sha256(copy.deepcopy(self.fixture)))

    def test_object_key_order_does_not_change_semantic_hash(self):
        reordered = json.loads(json.dumps(self.fixture))
        reordered["course"] = {
            "track_code": reordered["course"]["track_code"],
            "slug": reordered["course"]["slug"],
        }
        self.assertEqual(canonical_sha256(self.fixture), canonical_sha256(reordered))

    def test_unordered_skill_and_prerequisite_relations_do_not_change_semantic_hash(self):
        reordered = copy.deepcopy(self.fixture)
        reordered["objectives"][0]["skills"].reverse()
        reordered["units"][0]["lessons"][1]["prerequisites"].reverse()
        self.assertEqual(canonical_sha256(self.fixture), canonical_sha256(reordered))

    def test_explicit_positions_remain_part_of_semantic_hash(self):
        reordered = copy.deepcopy(self.fixture)
        reordered["units"][0]["lessons"].reverse()
        self.assertNotEqual(canonical_sha256(self.fixture), canonical_sha256(reordered))

    def test_a0_alias_is_not_accepted_as_canonical_cefr_level(self):
        errors = self.errors(lambda data: data["version"].update(cefr_level="A0"))
        self.assert_error_contains(errors, "$/version/cefr_level")

    def test_unknown_properties_fail_closed(self):
        errors = self.errors(lambda data: data["version"].update(status="published"))
        self.assert_error_contains(errors, "$/version/status")

    def test_duplicate_unit_and_lesson_positions_are_rejected(self):
        def mutate(data):
            unit = data["units"][0]
            unit["lessons"][1]["position"] = unit["lessons"][0]["position"]
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "duplicates another lesson position")

    def test_unknown_objective_reference_is_rejected(self):
        errors = self.errors(lambda data: data["units"][0]["lessons"][0].update(objective_codes=["missing-objective"]))
        self.assert_error_contains(errors, 'references unknown objective "missing-objective"')

    def test_orphan_objectives_are_rejected(self):
        def mutate(data):
            data["objectives"].append({
                "code": "never-used",
                "position": 3,
                "description": "An objective not attached to any lesson.",
                "success_criteria": "This must be linked.",
                "skills": [{"code": "reading", "is_primary": True}],
            })
        errors = self.errors(mutate)
        self.assert_error_contains(errors, 'objective "never-used" is not linked')

    def test_unknown_prerequisite_is_rejected(self):
        errors = self.errors(lambda data: data["units"][0]["lessons"][1]["prerequisites"][0].update(lesson_code="unknown-lesson"))
        self.assert_error_contains(errors, 'references unknown prerequisite "unknown-lesson"')

    def test_prerequisite_cycles_are_rejected(self):
        def mutate(data):
            data["units"][0]["lessons"][0]["prerequisites"] = [{
                "lesson_code": "introduce-yourself",
                "required_state": "completed",
                "minimum_mastery_score": 0.8,
            }]
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "prerequisite graph contains a cycle")

    def test_each_objective_has_exactly_one_primary_skill(self):
        def mutate(data):
            data["objectives"][0]["skills"][1]["is_primary"] = True
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "exactly one primary skill")

    def test_unknown_skill_codes_are_rejected(self):
        errors = self.errors(lambda data: data["objectives"][0]["skills"][0].update(code="pronunciation_score"))
        self.assert_error_contains(errors, "must be one of")

    def test_vocabulary_and_sentence_reference_lengths_match_database_limits(self):
        def mutate(data):
            data["objectives"][0]["vocabulary"][0]["word"] = "w" * 101
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "$/objectives/0/vocabulary/0/word")

        def mutate_category(data):
            data["objectives"][0]["vocabulary"][0]["category"] = "c" * 51
        errors = self.errors(mutate_category)
        self.assert_error_contains(errors, "$/objectives/0/vocabulary/0/category")

        def mutate_sentence(data):
            data["objectives"][0]["sentences"][0]["word"] = "w" * 101
        errors = self.errors(mutate_sentence)
        self.assert_error_contains(errors, "$/objectives/0/sentences/0/word")

    def test_duplicate_vocabulary_references_are_rejected(self):
        def mutate(data):
            data["objectives"][0]["vocabulary"].append(copy.deepcopy(data["objectives"][0]["vocabulary"][0]))
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "duplicates a vocabulary reference")

    def test_invalid_date_and_mastery_range_are_rejected(self):
        def mutate(data):
            data["metadata"]["authored_at"] = "2026-02-30"
            data["units"][0]["lessons"][1]["prerequisites"][0]["minimum_mastery_score"] = 1.5
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "valid ISO 8601 date")
        self.assert_error_contains(errors, "between 0 and 1")

    def test_duplicate_json_object_keys_fail_in_cli(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "duplicate.json"
            path.write_text('{"format":"devfluency.curriculum-content","format":"bad"}', encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(VALIDATOR), str(path), "--json"],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("duplicate JSON object key", completed.stdout)

    def test_cli_reports_valid_package_without_database_side_effects(self):
        completed = subprocess.run(
            [sys.executable, str(VALIDATOR), str(FIXTURE), "--json"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["valid"])
        self.assertEqual(result["status_on_future_import"], "draft")
        self.assertEqual(result["lessons"], 2)
        self.assertIn("sha256", result)

    def test_optional_arrays_reject_explicit_null(self):
        def mutate(data):
            data["objectives"][0]["vocabulary"] = None
            data["units"][0]["lessons"][0]["prerequisites"] = None
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "$/objectives/0/vocabulary: must be an array")
        self.assert_error_contains(errors, "$/units/0/lessons/0/prerequisites: must be an array")

    def test_source_url_requires_a_host_and_valid_port(self):
        def mutate(data):
            data["metadata"]["source"]["url"] = "https://"
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "must be a valid HTTP(S) URL or null")

    def test_duplicate_lesson_codes_are_rejected(self):
        def mutate(data):
            data["units"][0]["lessons"][1]["code"] = data["units"][0]["lessons"][0]["code"]
        errors = self.errors(mutate)
        self.assert_error_contains(errors, "duplicates another lesson code")

    def test_json_schema_and_fixture_are_valid_json(self):
        schema_path = ROOT / "tools/curriculum/content-package.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(schema["$id"], "urn:devfluency:curriculum-content:1")
        self.assertEqual(schema["properties"]["schema_version"]["const"], 1)


if __name__ == "__main__":
    unittest.main()
