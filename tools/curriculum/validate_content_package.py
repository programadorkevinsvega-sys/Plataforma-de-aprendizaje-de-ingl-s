#!/usr/bin/env python3
"""Validate a versioned DevFluency curriculum content package without DB writes."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

FORMAT_NAME = "devfluency.curriculum-content"
SCHEMA_VERSION = 1
CEFR_LEVELS = {"PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"}
TRACK_CODES = {"general", "technology"}
LESSON_PATTERNS = {"discover", "understand", "practice", "integrate", "custom"}
SKILL_CODES = {
    "vocabulary", "grammar", "listening", "reading", "writing",
    "speaking", "interaction", "mediation", "phonology",
}
VOCABULARY_USAGE = {"receptive", "productive", "both"}
SENTENCE_USAGE = {"listening", "reading", "speaking", "writing", "example"}
PREREQUISITE_STATES = {"completed", "mastered"}
CODE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SLUG_RE = CODE_RE
CATEGORY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
LOCALE_RE = re.compile(r"^[a-z]{2}(?:-[A-Z]{2})?$")


class DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateJsonKeyError(f"duplicate JSON object key: {key}")
        result[key] = value
    return result


def _error(errors: list[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def _object(value: Any, path: str, errors: list[str]) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        _error(errors, path, "must be an object")
        return None
    return value


def _array(value: Any, path: str, errors: list[str], *, required: bool = True) -> list[Any]:
    if value is None and not required:
        return []
    if not isinstance(value, list):
        _error(errors, path, "must be an array")
        return []
    return value


def _check_keys(
    obj: dict[str, Any],
    path: str,
    errors: list[str],
    *,
    required: set[str],
    allowed: set[str] | None = None,
) -> None:
    allowed = allowed or required
    for key in sorted(required - obj.keys()):
        _error(errors, f"{path}/{key}", "is required")
    for key in sorted(obj.keys() - allowed):
        _error(errors, f"{path}/{key}", "is not allowed by this schema version")


def _string(
    obj: dict[str, Any],
    key: str,
    path: str,
    errors: list[str],
    *,
    required: bool = True,
    allow_empty: bool = False,
    max_length: int | None = None,
    pattern: re.Pattern[str] | None = None,
) -> str | None:
    if key not in obj and not required:
        return None
    value = obj.get(key)
    if not isinstance(value, str):
        _error(errors, f"{path}/{key}", "must be a string")
        return None
    if not allow_empty and not value.strip():
        _error(errors, f"{path}/{key}", "must not be empty")
    if max_length is not None and len(value) > max_length:
        _error(errors, f"{path}/{key}", f"must be at most {max_length} characters")
    if pattern is not None and not pattern.fullmatch(value):
        _error(errors, f"{path}/{key}", "has an invalid format")
    return value


def _positive_int(obj: dict[str, Any], key: str, path: str, errors: list[str], *, required: bool = True) -> int | None:
    if key not in obj and not required:
        return None
    value = obj.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        _error(errors, f"{path}/{key}", "must be a positive integer")
        return None
    return value


def _enum(
    value: Any,
    allowed: set[str],
    path: str,
    errors: list[str],
) -> str | None:
    if not isinstance(value, str) or value not in allowed:
        _error(errors, path, "must be one of: " + ", ".join(sorted(allowed)))
        return None
    return value


def validate_package(data: Any) -> list[str]:
    """Return deterministic, path-qualified validation errors."""
    errors: list[str] = []
    root = _object(data, "$", errors)
    if root is None:
        return errors

    root_keys = {"format", "schema_version", "metadata", "course", "version", "units", "objectives"}
    _check_keys(root, "$", errors, required=root_keys)
    if root.get("format") != FORMAT_NAME:
        _error(errors, "$/format", f'must equal "{FORMAT_NAME}"')
    if isinstance(root.get("schema_version"), bool) or root.get("schema_version") != SCHEMA_VERSION:
        _error(errors, "$/schema_version", f"unsupported schema version; expected {SCHEMA_VERSION}")

    metadata = _object(root.get("metadata"), "$/metadata", errors)
    if metadata is not None:
        _check_keys(
            metadata, "$/metadata", errors,
            required={"author", "authored_at", "source"},
            allowed={"author", "authored_at", "source"},
        )
        _string(metadata, "author", "$/metadata", errors, max_length=160)
        authored_at = _string(metadata, "authored_at", "$/metadata", errors)
        if authored_at:
            try:
                if dt.date.fromisoformat(authored_at).isoformat() != authored_at:
                    raise ValueError
            except ValueError:
                _error(errors, "$/metadata/authored_at", "must be a valid ISO 8601 date (YYYY-MM-DD)")
        source = _object(metadata.get("source"), "$/metadata/source", errors)
        if source is not None:
            _check_keys(
                source, "$/metadata/source", errors,
                required={"name", "license"},
                allowed={"name", "license", "url"},
            )
            _string(source, "name", "$/metadata/source", errors, max_length=200)
            _string(source, "license", "$/metadata/source", errors, max_length=120)
            source_url = source.get("url")
            if source_url is not None:
                if not isinstance(source_url, str) or not source_url.startswith(("https://", "http://")):
                    _error(errors, "$/metadata/source/url", "must be an HTTP(S) URL or null")

    course = _object(root.get("course"), "$/course", errors)
    if course is not None:
        _check_keys(
            course, "$/course", errors,
            required={"slug", "track_code"},
        )
        _string(course, "slug", "$/course", errors, max_length=120, pattern=SLUG_RE)
        _enum(course.get("track_code"), TRACK_CODES, "$/course/track_code", errors)

    version = _object(root.get("version"), "$/version", errors)
    if version is not None:
        _check_keys(
            version, "$/version", errors,
            required={"version_number", "cefr_level", "title", "description", "locale"},
            allowed={"version_number", "cefr_level", "title", "description", "locale", "content_schema_version"},
        )
        _positive_int(version, "version_number", "$/version", errors)
        _enum(version.get("cefr_level"), CEFR_LEVELS, "$/version/cefr_level", errors)
        _string(version, "title", "$/version", errors, max_length=200)
        _string(version, "description", "$/version", errors, allow_empty=True)
        locale = _string(version, "locale", "$/version", errors, pattern=LOCALE_RE)
        if locale and not LOCALE_RE.fullmatch(locale):
            _error(errors, "$/version/locale", "must be a BCP 47 language tag in the supported short form")
        if "content_schema_version" in version:
            _positive_int(version, "content_schema_version", "$/version", errors)

    units = _array(root.get("units"), "$/units", errors)
    objectives = _array(root.get("objectives"), "$/objectives", errors)
    if not units:
        _error(errors, "$/units", "must contain at least one unit")
    if not objectives:
        _error(errors, "$/objectives", "must contain at least one learning objective")

    unit_codes: set[str] = set()
    unit_positions: set[int] = set()
    lesson_codes: set[str] = set()
    lesson_positions_by_unit: dict[str, set[int]] = {}
    lesson_links: dict[str, list[str]] = {}
    prerequisite_edges: dict[str, list[str]] = {}

    for unit_index, raw_unit in enumerate(units):
        path = f"$/units/{unit_index}"
        unit = _object(raw_unit, path, errors)
        if unit is None:
            continue
        _check_keys(
            unit, path, errors,
            required={"code", "position", "title", "theme", "description", "lessons"},
            allowed={"code", "position", "title", "theme", "description", "estimated_minutes", "lessons"},
        )
        code = _string(unit, "code", path, errors, max_length=80, pattern=CODE_RE)
        position = _positive_int(unit, "position", path, errors)
        _string(unit, "title", path, errors, max_length=200)
        _string(unit, "theme", path, errors, max_length=120)
        _string(unit, "description", path, errors, allow_empty=True)
        _positive_int(unit, "estimated_minutes", path, errors, required=False)
        if code:
            if code in unit_codes:
                _error(errors, f"{path}/code", "duplicates another unit code")
            unit_codes.add(code)
        if position is not None:
            if position in unit_positions:
                _error(errors, f"{path}/position", "duplicates another unit position")
            unit_positions.add(position)

        lessons = _array(unit.get("lessons"), f"{path}/lessons", errors)
        for lesson_index, raw_lesson in enumerate(lessons):
            lesson_path = f"{path}/lessons/{lesson_index}"
            lesson = _object(raw_lesson, lesson_path, errors)
            if lesson is None:
                continue
            _check_keys(
                lesson, lesson_path, errors,
                required={"code", "position", "pattern", "title", "description", "objective_codes"},
                allowed={"code", "position", "pattern", "title", "description", "estimated_minutes", "objective_codes", "prerequisites"},
            )
            lesson_code = _string(lesson, "code", lesson_path, errors, max_length=80, pattern=CODE_RE)
            lesson_position = _positive_int(lesson, "position", lesson_path, errors)
            _enum(lesson.get("pattern"), LESSON_PATTERNS, f"{lesson_path}/pattern", errors)
            _string(lesson, "title", lesson_path, errors, max_length=200)
            _string(lesson, "description", lesson_path, errors, allow_empty=True)
            _positive_int(lesson, "estimated_minutes", lesson_path, errors, required=False)

            if lesson_code:
                if lesson_code in lesson_codes:
                    _error(errors, f"{lesson_path}/code", "duplicates another lesson code in this course version")
                lesson_codes.add(lesson_code)
                lesson_links[lesson_code] = []
                prerequisite_edges[lesson_code] = []
                lesson_positions_by_unit.setdefault(code or path, set())
            if lesson_position is not None:
                position_set = lesson_positions_by_unit.setdefault(code or path, set())
                if lesson_position in position_set:
                    _error(errors, f"{lesson_path}/position", "duplicates another lesson position in this unit")
                position_set.add(lesson_position)

            objective_codes = _array(lesson.get("objective_codes"), f"{lesson_path}/objective_codes", errors)
            if not objective_codes:
                _error(errors, f"{lesson_path}/objective_codes", "must reference at least one learning objective")
            seen_objective_codes: set[str] = set()
            for objective_index, objective_code in enumerate(objective_codes):
                if not isinstance(objective_code, str) or not CODE_RE.fullmatch(objective_code):
                    _error(errors, f"{lesson_path}/objective_codes/{objective_index}", "must be a valid objective code")
                    continue
                if objective_code in seen_objective_codes:
                    _error(errors, f"{lesson_path}/objective_codes/{objective_index}", "duplicates an objective reference")
                seen_objective_codes.add(objective_code)
                if lesson_code:
                    lesson_links[lesson_code].append(objective_code)

            prerequisites = _array(lesson.get("prerequisites"), f"{lesson_path}/prerequisites", errors, required=False)
            seen_prerequisites: set[str] = set()
            for prerequisite_index, raw_prerequisite in enumerate(prerequisites):
                prerequisite_path = f"{lesson_path}/prerequisites/{prerequisite_index}"
                prerequisite = _object(raw_prerequisite, prerequisite_path, errors)
                if prerequisite is None:
                    continue
                _check_keys(
                    prerequisite, prerequisite_path, errors,
                    required={"lesson_code", "required_state", "minimum_mastery_score"},
                )
                prerequisite_code = _string(prerequisite, "lesson_code", prerequisite_path, errors, max_length=80, pattern=CODE_RE)
                _enum(prerequisite.get("required_state"), PREREQUISITE_STATES, f"{prerequisite_path}/required_state", errors)
                score = prerequisite.get("minimum_mastery_score")
                if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 1:
                    _error(errors, f"{prerequisite_path}/minimum_mastery_score", "must be a number between 0 and 1")
                if prerequisite_code:
                    if prerequisite_code == lesson_code:
                        _error(errors, f"{prerequisite_path}/lesson_code", "a lesson cannot depend on itself")
                    if prerequisite_code in seen_prerequisites:
                        _error(errors, f"{prerequisite_path}/lesson_code", "duplicates another prerequisite")
                    seen_prerequisites.add(prerequisite_code)
                    if lesson_code:
                        prerequisite_edges[lesson_code].append(prerequisite_code)

    objective_codes_seen: set[str] = set()
    objective_positions: set[int] = set()
    for objective_index, raw_objective in enumerate(objectives):
        path = f"$/objectives/{objective_index}"
        objective = _object(raw_objective, path, errors)
        if objective is None:
            continue
        _check_keys(
            objective, path, errors,
            required={"code", "position", "description", "success_criteria", "skills"},
            allowed={"code", "position", "description", "success_criteria", "skills", "vocabulary", "sentences"},
        )
        objective_code = _string(objective, "code", path, errors, max_length=80, pattern=CODE_RE)
        position = _positive_int(objective, "position", path, errors)
        _string(objective, "description", path, errors, max_length=1000)
        _string(objective, "success_criteria", path, errors, max_length=1000)
        if objective_code:
            if objective_code in objective_codes_seen:
                _error(errors, f"{path}/code", "duplicates another objective code")
            objective_codes_seen.add(objective_code)
        if position is not None:
            if position in objective_positions:
                _error(errors, f"{path}/position", "duplicates another objective position in this course version")
            objective_positions.add(position)

        skills = _array(objective.get("skills"), f"{path}/skills", errors)
        if not skills:
            _error(errors, f"{path}/skills", "must contain at least one skill")
        skill_codes_seen: set[str] = set()
        primary_count = 0
        for skill_index, raw_skill in enumerate(skills):
            skill_path = f"{path}/skills/{skill_index}"
            skill = _object(raw_skill, skill_path, errors)
            if skill is None:
                continue
            _check_keys(skill, skill_path, errors, required={"code", "is_primary"})
            skill_code = _enum(skill.get("code"), SKILL_CODES, f"{skill_path}/code", errors)
            if not isinstance(skill.get("is_primary"), bool):
                _error(errors, f"{skill_path}/is_primary", "must be a boolean")
            elif skill.get("is_primary"):
                primary_count += 1
            if skill_code:
                if skill_code in skill_codes_seen:
                    _error(errors, f"{skill_path}/code", "duplicates another skill for this objective")
                skill_codes_seen.add(skill_code)
        if skills and primary_count != 1:
            _error(errors, f"{path}/skills", "must define exactly one primary skill")

        vocabulary = _array(objective.get("vocabulary"), f"{path}/vocabulary", errors, required=False)
        vocabulary_seen: set[tuple[str, str]] = set()
        vocabulary_positions: set[int] = set()
        for ref_index, raw_ref in enumerate(vocabulary):
            ref_path = f"{path}/vocabulary/{ref_index}"
            ref = _object(raw_ref, ref_path, errors)
            if ref is None:
                continue
            _check_keys(ref, ref_path, errors, required={"word", "category", "usage_mode", "position"})
            word = _string(ref, "word", ref_path, errors, max_length=120)
            category = _string(ref, "category", ref_path, errors, max_length=80, pattern=CATEGORY_RE)
            _enum(ref.get("usage_mode"), VOCABULARY_USAGE, f"{ref_path}/usage_mode", errors)
            ref_position = _positive_int(ref, "position", ref_path, errors)
            if word and category:
                ref_key = (word.casefold(), category)
                if ref_key in vocabulary_seen:
                    _error(errors, ref_path, "duplicates a vocabulary reference in this objective")
                vocabulary_seen.add(ref_key)
            if ref_position is not None:
                if ref_position in vocabulary_positions:
                    _error(errors, f"{ref_path}/position", "duplicates another vocabulary position")
                vocabulary_positions.add(ref_position)

        sentences = _array(objective.get("sentences"), f"{path}/sentences", errors, required=False)
        sentence_seen: set[tuple[str, str]] = set()
        sentence_positions: set[int] = set()
        for ref_index, raw_ref in enumerate(sentences):
            ref_path = f"{path}/sentences/{ref_index}"
            ref = _object(raw_ref, ref_path, errors)
            if ref is None:
                continue
            _check_keys(ref, ref_path, errors, required={"word", "english_text", "usage_mode", "position"})
            word = _string(ref, "word", ref_path, errors, max_length=120)
            english_text = _string(ref, "english_text", ref_path, errors, max_length=500)
            _enum(ref.get("usage_mode"), SENTENCE_USAGE, f"{ref_path}/usage_mode", errors)
            ref_position = _positive_int(ref, "position", ref_path, errors)
            if word and english_text:
                ref_key = (word.casefold(), english_text.casefold())
                if ref_key in sentence_seen:
                    _error(errors, ref_path, "duplicates a sentence reference in this objective")
                sentence_seen.add(ref_key)
            if ref_position is not None:
                if ref_position in sentence_positions:
                    _error(errors, f"{ref_path}/position", "duplicates another sentence position")
                sentence_positions.add(ref_position)

    for lesson_code, linked_objectives in lesson_links.items():
        for linked_code in linked_objectives:
            if linked_code not in objective_codes_seen:
                _error(errors, f"$/units", f'lesson "{lesson_code}" references unknown objective "{linked_code}"')
    linked_objectives = {code for links in lesson_links.values() for code in links}
    for objective_code in sorted(objective_codes_seen - linked_objectives):
        _error(errors, "$/objectives", f'objective "{objective_code}" is not linked to any lesson')
    for lesson_code, prerequisite_codes in prerequisite_edges.items():
        for prerequisite_code in prerequisite_codes:
            if prerequisite_code not in lesson_codes:
                _error(errors, "$/units", f'lesson "{lesson_code}" references unknown prerequisite "{prerequisite_code}"')

    # Acyclic prerequisite graph. Each edge points from a lesson to its prerequisite.
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(code: str) -> None:
        if code in visited:
            return
        if code in visiting:
            _error(errors, "$/units", f"prerequisite graph contains a cycle at lesson {code}")
            return
        visiting.add(code)
        for prerequisite_code in prerequisite_edges.get(code, []):
            if prerequisite_code in prerequisite_edges:
                visit(prerequisite_code)
        visiting.remove(code)
        visited.add(code)

    for lesson_code in sorted(prerequisite_edges):
        visit(lesson_code)

    return errors


def canonical_sha256(data: Any) -> str:
    """Hash semantic JSON content, ignoring insignificant object-key/whitespace changes."""
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a DevFluency curriculum content package (offline; no database writes).")
    parser.add_argument("package", type=Path, help="Path to a JSON content package")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable validation output")
    args = parser.parse_args()

    try:
        with args.package.open("r", encoding="utf-8") as handle:
            data = json.load(handle, object_pairs_hook=_reject_duplicate_keys)
    except (OSError, UnicodeError, json.JSONDecodeError, DuplicateJsonKeyError) as exc:
        result = {"valid": False, "errors": [f"$: cannot read valid UTF-8 JSON: {exc}"]}
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(result["errors"][0], file=sys.stderr)
        return 2

    errors = validate_package(data)
    if errors:
        result = {"valid": False, "errors": errors}
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            for message in errors:
                print(f"ERROR {message}", file=sys.stderr)
        return 1

    result = {
        "valid": True,
        "format": FORMAT_NAME,
        "schema_version": SCHEMA_VERSION,
        "sha256": canonical_sha256(data),
        "units": len(data["units"]),
        "lessons": sum(len(unit["lessons"]) for unit in data["units"]),
        "objectives": len(data["objectives"]),
        "status_on_future_import": "draft",
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            "Valid curriculum package "
            f"(units={result['units']}, lessons={result['lessons']}, "
            f"objectives={result['objectives']}, sha256={result['sha256']})."
        )
        print("Validation is offline only; this command did not connect to PostgreSQL or import content.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
