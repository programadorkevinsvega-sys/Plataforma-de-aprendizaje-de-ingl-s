use chrono::NaiveDate;
use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::net::Ipv6Addr;
use uuid::Uuid;

const FORMAT_NAME: &str = "devfluency.curriculum-content";
const SCHEMA_VERSION: i64 = 1;
const MAX_PACKAGE_BYTES: usize = 1_500_000;

#[derive(Debug)]
enum StrictValue {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<StrictValue>),
    Object(BTreeMap<String, StrictValue>),
}

impl<'de> Deserialize<'de> for StrictValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct StrictVisitor;

        impl<'de> Visitor<'de> for StrictVisitor {
            type Value = StrictValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a JSON value without duplicate object keys")
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::Null)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::Null)
            }

            fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::Bool(value))
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::Number(Number::from(value)))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::Number(Number::from(value)))
            }

            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Number::from_f64(value)
                    .map(StrictValue::Number)
                    .ok_or_else(|| E::custom("non-finite JSON numbers are not supported"))
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::String(value.to_owned()))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(StrictValue::String(value))
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut values = Vec::new();
                while let Some(value) = sequence.next_element::<StrictValue>()? {
                    values.push(value);
                }
                Ok(StrictValue::Array(values))
            }

            fn visit_map<A>(self, mut object: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut values = BTreeMap::new();
                while let Some(key) = object.next_key::<String>()? {
                    if values.contains_key(&key) {
                        return Err(serde::de::Error::custom(format!(
                            "duplicate JSON object key: {key}"
                        )));
                    }
                    values.insert(key, object.next_value::<StrictValue>()?);
                }
                Ok(StrictValue::Object(values))
            }
        }

        deserializer.deserialize_any(StrictVisitor)
    }
}

impl StrictValue {
    fn into_json(self) -> Value {
        match self {
            StrictValue::Null => Value::Null,
            StrictValue::Bool(value) => Value::Bool(value),
            StrictValue::Number(value) => Value::Number(value),
            StrictValue::String(value) => Value::String(value),
            StrictValue::Array(values) => {
                Value::Array(values.into_iter().map(StrictValue::into_json).collect())
            }
            StrictValue::Object(values) => {
                let mut result = Map::new();
                for (key, value) in values {
                    result.insert(key, value.into_json());
                }
                Value::Object(result)
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PackageCounts {
    pub units: i32,
    pub lessons: i32,
    pub objectives: i32,
    pub vocabulary_references: i32,
    pub sentence_references: i32,
}

#[derive(Clone, Debug)]
pub struct PackageImportResult {
    pub state: String,
    pub course_version_id: String,
    pub package_sha256: String,
    pub counts: PackageCounts,
    pub applied: bool,
    pub dry_run: bool,
}

fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>, String> {
    value
        .as_object()
        .ok_or_else(|| format!("{path}: debe ser un objeto JSON"))
}

fn array<'a>(value: &'a Value, path: &str) -> Result<&'a Vec<Value>, String> {
    value
        .as_array()
        .ok_or_else(|| format!("{path}: debe ser un arreglo"))
}

fn required_string<'a>(
    value: &'a Map<String, Value>,
    key: &str,
    path: &str,
    max_chars: usize,
    allow_empty: bool,
) -> Result<&'a str, String> {
    let field = value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{path}/{key}: debe ser texto"))?;
    if !allow_empty && field.trim().is_empty() {
        return Err(format!("{path}/{key}: no puede estar vacío"));
    }
    if field.chars().count() > max_chars {
        return Err(format!("{path}/{key}: supera {max_chars} caracteres"));
    }
    Ok(field)
}

fn positive_integer(value: &Map<String, Value>, key: &str, path: &str) -> Result<i32, String> {
    let raw = value
        .get(key)
        .ok_or_else(|| format!("{path}/{key}: es obligatorio"))?;
    let number = raw
        .as_i64()
        .filter(|number| *number > 0 && *number <= i64::from(i32::MAX))
        .ok_or_else(|| {
            format!("{path}/{key}: debe ser un entero positivo dentro del rango INTEGER")
        })?;
    Ok(number as i32)
}

fn optional_positive_integer(
    value: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<i32>, String> {
    match value.get(key) {
        None => Ok(None),
        Some(raw) => raw
            .as_i64()
            .filter(|number| *number > 0 && *number <= i64::from(i32::MAX))
            .map(|number| Some(number as i32))
            .ok_or_else(|| {
                format!("{path}/{key}: debe ser un entero positivo dentro del rango INTEGER")
            }),
    }
}

fn check_keys(
    value: &Map<String, Value>,
    path: &str,
    required: &[&str],
    allowed: &[&str],
) -> Result<(), String> {
    for key in required {
        if !value.contains_key(*key) {
            return Err(format!("{path}/{key}: es obligatorio"));
        }
    }
    for key in value.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("{path}/{key}: no está permitido por el esquema v1"));
        }
    }
    Ok(())
}

fn valid_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn valid_http_url(value: &str) -> bool {
    let Some((scheme, remainder)) = value.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return false;
    }

    let authority = remainder.split(['/', '?', '#']).next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or("");
    if host_port.is_empty() || host_port.chars().any(char::is_whitespace) {
        return false;
    }

    if let Some(bracketed) = host_port.strip_prefix('[') {
        let Some(close) = bracketed.find(']') else {
            return false;
        };
        let host = &bracketed[..close];
        if host.parse::<Ipv6Addr>().is_err() {
            return false;
        }
        let suffix = &bracketed[close + 1..];
        return suffix.is_empty()
            || suffix == ":"
            || suffix
                .strip_prefix(':')
                .is_some_and(|port| port.parse::<u16>().is_ok());
    }

    let (host, port) = match host_port.rsplit_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (host_port, None),
    };
    if host.is_empty() || host.contains(':') || host.starts_with('.') || host.ends_with('.') {
        return false;
    }
    match port {
        None | Some("") => true,
        Some(port) => port.parse::<u16>().is_ok(),
    }
}

fn enum_value(value: &str, allowed: &[&str], path: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("{path}: valor no permitido"))
    }
}

fn canonicalize(value: &mut Value) {
    match value {
        Value::Array(items) => {
            for item in items {
                canonicalize(item);
            }
        }
        Value::Object(fields) => {
            for item in fields.values_mut() {
                canonicalize(item);
            }
            for (array_key, item_key) in [("skills", "code"), ("prerequisites", "lesson_code")] {
                if let Some(Value::Array(items)) = fields.get_mut(array_key) {
                    items.sort_by(|left, right| {
                        left.get(item_key)
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .cmp(right.get(item_key).and_then(Value::as_str).unwrap_or(""))
                    });
                }
            }
        }
        _ => {}
    }
}

fn canonical_sha256(data: &Value) -> Result<String, String> {
    let mut canonical = data.clone();
    canonicalize(&mut canonical);
    let bytes = serde_json::to_vec(&canonical)
        .map_err(|_| "No se pudo normalizar el paquete curricular".to_string())?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_package(data: &Value) -> Result<PackageCounts, String> {
    let root = object(data, "$")?;
    check_keys(
        root,
        "$",
        &[
            "format",
            "schema_version",
            "metadata",
            "course",
            "version",
            "units",
            "objectives",
        ],
        &[
            "format",
            "schema_version",
            "metadata",
            "course",
            "version",
            "units",
            "objectives",
        ],
    )?;
    if root.get("format").and_then(Value::as_str) != Some(FORMAT_NAME) {
        return Err("$/format: formato curricular no soportado".to_string());
    }
    if root.get("schema_version").and_then(Value::as_i64) != Some(SCHEMA_VERSION) {
        return Err("$/schema_version: solo se admite la versión 1".to_string());
    }

    let metadata = object(
        root.get("metadata").ok_or("$/metadata: es obligatorio")?,
        "$/metadata",
    )?;
    check_keys(
        metadata,
        "$/metadata",
        &["author", "authored_at", "source"],
        &["author", "authored_at", "source"],
    )?;
    required_string(metadata, "author", "$/metadata", 160, false)?;
    let authored_at = required_string(metadata, "authored_at", "$/metadata", 10, false)?;
    let authored_date = NaiveDate::parse_from_str(authored_at, "%Y-%m-%d")
        .map_err(|_| "$/metadata/authored_at: debe ser una fecha YYYY-MM-DD válida".to_string())?;
    if authored_date.format("%Y-%m-%d").to_string() != authored_at {
        return Err("$/metadata/authored_at: debe usar el formato YYYY-MM-DD".to_string());
    }
    let source = object(
        metadata
            .get("source")
            .ok_or("$/metadata/source: es obligatorio")?,
        "$/metadata/source",
    )?;
    check_keys(
        source,
        "$/metadata/source",
        &["name", "license"],
        &["name", "license", "url"],
    )?;
    required_string(source, "name", "$/metadata/source", 200, false)?;
    required_string(source, "license", "$/metadata/source", 120, false)?;
    if let Some(url) = source.get("url") {
        if !url.is_null() {
            let url = url
                .as_str()
                .ok_or("$/metadata/source/url: debe ser texto o null")?;
            if !valid_http_url(url) {
                return Err(
                    "$/metadata/source/url: debe ser una URL HTTP(S) válida o null".to_string(),
                );
            }
        }
    }

    let course = object(
        root.get("course").ok_or("$/course: es obligatorio")?,
        "$/course",
    )?;
    check_keys(
        course,
        "$/course",
        &["slug", "track_code"],
        &["slug", "track_code"],
    )?;
    let slug = required_string(course, "slug", "$/course", 120, false)?;
    if !valid_slug(slug) {
        return Err("$/course/slug: formato slug no válido".to_string());
    }
    let track = required_string(course, "track_code", "$/course", 20, false)?;
    enum_value(track, &["general", "technology"], "$/course/track_code")?;

    let version = object(
        root.get("version").ok_or("$/version: es obligatorio")?,
        "$/version",
    )?;
    check_keys(
        version,
        "$/version",
        &[
            "version_number",
            "cefr_level",
            "title",
            "description",
            "locale",
        ],
        &[
            "version_number",
            "cefr_level",
            "title",
            "description",
            "locale",
            "content_schema_version",
        ],
    )?;
    positive_integer(version, "version_number", "$/version")?;
    let level = required_string(version, "cefr_level", "$/version", 10, false)?;
    enum_value(
        level,
        &["PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2"],
        "$/version/cefr_level",
    )?;
    required_string(version, "title", "$/version", 200, false)?;
    required_string(version, "description", "$/version", 100_000, true)?;
    let locale = required_string(version, "locale", "$/version", 12, false)?;
    let mut locale_parts = locale.split('-');
    let language = locale_parts.next().unwrap_or("");
    let region = locale_parts.next();
    if !(language.len() == 2 && language.bytes().all(|b| b.is_ascii_lowercase()))
        || region
            .is_some_and(|part| part.len() != 2 || !part.bytes().all(|b| b.is_ascii_uppercase()))
        || locale_parts.next().is_some()
    {
        return Err("$/version/locale: formato de idioma no válido".to_string());
    }
    if version.contains_key("content_schema_version") {
        positive_integer(version, "content_schema_version", "$/version")?;
    }

    let units = array(
        root.get("units").ok_or("$/units: es obligatorio")?,
        "$/units",
    )?;
    let objectives = array(
        root.get("objectives")
            .ok_or("$/objectives: es obligatorio")?,
        "$/objectives",
    )?;
    if units.is_empty() {
        return Err("$/units: debe contener al menos una unidad".to_string());
    }
    if objectives.is_empty() {
        return Err("$/objectives: debe contener al menos un objetivo".to_string());
    }

    let mut unit_codes = HashSet::new();
    let mut unit_positions = HashSet::new();
    let mut lesson_codes = HashSet::new();
    let mut lesson_links: HashMap<String, Vec<String>> = HashMap::new();
    let mut lesson_prerequisites: HashMap<String, Vec<String>> = HashMap::new();
    let mut lesson_total = 0_i32;

    for (unit_index, raw_unit) in units.iter().enumerate() {
        let path = format!("$/units/{unit_index}");
        let unit = object(raw_unit, &path)?;
        check_keys(
            unit,
            &path,
            &[
                "code",
                "position",
                "title",
                "theme",
                "description",
                "lessons",
            ],
            &[
                "code",
                "position",
                "title",
                "theme",
                "description",
                "estimated_minutes",
                "lessons",
            ],
        )?;
        let unit_code = required_string(unit, "code", &path, 80, false)?;
        if !valid_code(unit_code) || !unit_codes.insert(unit_code.to_string()) {
            return Err(format!("{path}/code: código inválido o duplicado"));
        }
        let unit_position = positive_integer(unit, "position", &path)?;
        if !unit_positions.insert(unit_position) {
            return Err(format!("{path}/position: posición duplicada"));
        }
        required_string(unit, "title", &path, 200, false)?;
        required_string(unit, "theme", &path, 120, false)?;
        required_string(unit, "description", &path, 100_000, true)?;
        optional_positive_integer(unit, "estimated_minutes", &path)?;
        let lessons = array(
            unit.get("lessons")
                .ok_or_else(|| format!("{path}/lessons: es obligatorio"))?,
            &format!("{path}/lessons"),
        )?;
        if lessons.is_empty() {
            return Err(format!(
                "{path}/lessons: una unidad debe contener al menos una lección"
            ));
        }
        let mut lesson_positions = HashSet::new();
        for (lesson_index, raw_lesson) in lessons.iter().enumerate() {
            let lesson_path = format!("{path}/lessons/{lesson_index}");
            let lesson = object(raw_lesson, &lesson_path)?;
            check_keys(
                lesson,
                &lesson_path,
                &[
                    "code",
                    "position",
                    "pattern",
                    "title",
                    "description",
                    "objective_codes",
                ],
                &[
                    "code",
                    "position",
                    "pattern",
                    "title",
                    "description",
                    "estimated_minutes",
                    "objective_codes",
                    "prerequisites",
                ],
            )?;
            let lesson_code = required_string(lesson, "code", &lesson_path, 80, false)?;
            if !valid_code(lesson_code) || !lesson_codes.insert(lesson_code.to_string()) {
                return Err(format!("{lesson_path}/code: código inválido o duplicado"));
            }
            let lesson_position = positive_integer(lesson, "position", &lesson_path)?;
            if !lesson_positions.insert(lesson_position) {
                return Err(format!(
                    "{lesson_path}/position: posición duplicada dentro de la unidad"
                ));
            }
            let pattern = required_string(lesson, "pattern", &lesson_path, 16, false)?;
            enum_value(
                pattern,
                &["discover", "understand", "practice", "integrate", "custom"],
                &format!("{lesson_path}/pattern"),
            )?;
            required_string(lesson, "title", &lesson_path, 200, false)?;
            required_string(lesson, "description", &lesson_path, 100_000, true)?;
            optional_positive_integer(lesson, "estimated_minutes", &lesson_path)?;
            let objective_codes = array(
                lesson
                    .get("objective_codes")
                    .ok_or_else(|| format!("{lesson_path}/objective_codes: es obligatorio"))?,
                &format!("{lesson_path}/objective_codes"),
            )?;
            if objective_codes.is_empty() {
                return Err(format!(
                    "{lesson_path}/objective_codes: debe incluir al menos un objetivo"
                ));
            }
            let mut seen_objectives = HashSet::new();
            let mut linked = Vec::new();
            for (index, raw_code) in objective_codes.iter().enumerate() {
                let code = raw_code.as_str().ok_or_else(|| {
                    format!("{lesson_path}/objective_codes/{index}: debe ser texto")
                })?;
                if !valid_code(code) || !seen_objectives.insert(code.to_string()) {
                    return Err(format!(
                        "{lesson_path}/objective_codes/{index}: código inválido o duplicado"
                    ));
                }
                linked.push(code.to_string());
            }
            lesson_links.insert(lesson_code.to_string(), linked);
            let mut prereqs = Vec::new();
            if let Some(raw_prerequisites) = lesson.get("prerequisites") {
                let prerequisites =
                    array(raw_prerequisites, &format!("{lesson_path}/prerequisites"))?;
                let mut seen = HashSet::new();
                for (index, raw) in prerequisites.iter().enumerate() {
                    let prerequisite_path = format!("{lesson_path}/prerequisites/{index}");
                    let prerequisite = object(raw, &prerequisite_path)?;
                    check_keys(
                        prerequisite,
                        &prerequisite_path,
                        &["lesson_code", "required_state", "minimum_mastery_score"],
                        &["lesson_code", "required_state", "minimum_mastery_score"],
                    )?;
                    let prerequisite_code = required_string(
                        prerequisite,
                        "lesson_code",
                        &prerequisite_path,
                        80,
                        false,
                    )?;
                    if !valid_code(prerequisite_code)
                        || prerequisite_code == lesson_code
                        || !seen.insert(prerequisite_code.to_string())
                    {
                        return Err(format!("{prerequisite_path}/lesson_code: prerrequisito inválido, duplicado o autorreferenciado"));
                    }
                    let state = required_string(
                        prerequisite,
                        "required_state",
                        &prerequisite_path,
                        12,
                        false,
                    )?;
                    enum_value(
                        state,
                        &["completed", "mastered"],
                        &format!("{prerequisite_path}/required_state"),
                    )?;
                    let score = prerequisite
                        .get("minimum_mastery_score")
                        .and_then(Value::as_f64)
                        .filter(|score| (0.0..=1.0).contains(score))
                        .ok_or_else(|| {
                            format!(
                                "{prerequisite_path}/minimum_mastery_score: debe estar entre 0 y 1"
                            )
                        })?;
                    let _ = score;
                    prereqs.push(prerequisite_code.to_string());
                }
            }
            lesson_prerequisites.insert(lesson_code.to_string(), prereqs);
            lesson_total = lesson_total.saturating_add(1);
        }
    }

    let mut objective_codes = HashSet::new();
    let mut objective_positions = HashSet::new();
    let mut vocabulary_references = 0_i32;
    let mut sentence_references = 0_i32;
    for (objective_index, raw_objective) in objectives.iter().enumerate() {
        let path = format!("$/objectives/{objective_index}");
        let objective = object(raw_objective, &path)?;
        check_keys(
            objective,
            &path,
            &[
                "code",
                "position",
                "description",
                "success_criteria",
                "skills",
            ],
            &[
                "code",
                "position",
                "description",
                "success_criteria",
                "skills",
                "vocabulary",
                "sentences",
            ],
        )?;
        let code = required_string(objective, "code", &path, 80, false)?;
        if !valid_code(code) || !objective_codes.insert(code.to_string()) {
            return Err(format!("{path}/code: código inválido o duplicado"));
        }
        let position = positive_integer(objective, "position", &path)?;
        if !objective_positions.insert(position) {
            return Err(format!("{path}/position: posición duplicada"));
        }
        required_string(objective, "description", &path, 1000, false)?;
        required_string(objective, "success_criteria", &path, 1000, false)?;
        let skills = array(
            objective
                .get("skills")
                .ok_or_else(|| format!("{path}/skills: es obligatorio"))?,
            &format!("{path}/skills"),
        )?;
        if skills.is_empty() {
            return Err(format!(
                "{path}/skills: debe contener al menos una competencia"
            ));
        }
        let mut skill_codes = HashSet::new();
        let mut primary_count = 0;
        for (index, raw_skill) in skills.iter().enumerate() {
            let skill_path = format!("{path}/skills/{index}");
            let skill = object(raw_skill, &skill_path)?;
            check_keys(
                skill,
                &skill_path,
                &["code", "is_primary"],
                &["code", "is_primary"],
            )?;
            let skill_code = required_string(skill, "code", &skill_path, 24, false)?;
            enum_value(
                skill_code,
                &[
                    "vocabulary",
                    "grammar",
                    "listening",
                    "reading",
                    "writing",
                    "speaking",
                    "interaction",
                    "mediation",
                    "phonology",
                ],
                &format!("{skill_path}/code"),
            )?;
            if !skill_codes.insert(skill_code.to_string()) {
                return Err(format!("{skill_path}/code: competencia duplicada"));
            }
            match skill.get("is_primary") {
                Some(Value::Bool(true)) => primary_count += 1,
                Some(Value::Bool(false)) => {}
                _ => return Err(format!("{skill_path}/is_primary: debe ser booleano")),
            }
        }
        if primary_count != 1 {
            return Err(format!(
                "{path}/skills: debe definir exactamente una competencia primaria"
            ));
        }

        if let Some(raw_vocabulary) = objective.get("vocabulary") {
            let vocabulary = array(raw_vocabulary, &format!("{path}/vocabulary"))?;
            let mut seen = HashSet::new();
            let mut positions = HashSet::new();
            for (index, raw_ref) in vocabulary.iter().enumerate() {
                let ref_path = format!("{path}/vocabulary/{index}");
                let reference = object(raw_ref, &ref_path)?;
                check_keys(
                    reference,
                    &ref_path,
                    &["word", "category", "usage_mode", "position"],
                    &["word", "category", "usage_mode", "position"],
                )?;
                let word = required_string(reference, "word", &ref_path, 100, false)?;
                let category = required_string(reference, "category", &ref_path, 50, false)?;
                if !category
                    .bytes()
                    .next()
                    .is_some_and(|b| b.is_ascii_lowercase())
                    || !category
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
                    || !seen.insert((word.to_lowercase(), category.to_string()))
                {
                    return Err(format!(
                        "{ref_path}: referencia de vocabulario inválida o duplicada"
                    ));
                }
                let mode = required_string(reference, "usage_mode", &ref_path, 12, false)?;
                enum_value(
                    mode,
                    &["receptive", "productive", "both"],
                    &format!("{ref_path}/usage_mode"),
                )?;
                let position = positive_integer(reference, "position", &ref_path)?;
                if !positions.insert(position) {
                    return Err(format!("{ref_path}/position: posición duplicada"));
                }
                vocabulary_references = vocabulary_references.saturating_add(1);
            }
        }

        if let Some(raw_sentences) = objective.get("sentences") {
            let sentences = array(raw_sentences, &format!("{path}/sentences"))?;
            let mut seen = HashSet::new();
            let mut positions = HashSet::new();
            for (index, raw_ref) in sentences.iter().enumerate() {
                let ref_path = format!("{path}/sentences/{index}");
                let reference = object(raw_ref, &ref_path)?;
                check_keys(
                    reference,
                    &ref_path,
                    &["word", "english_text", "usage_mode", "position"],
                    &["word", "english_text", "usage_mode", "position"],
                )?;
                let word = required_string(reference, "word", &ref_path, 100, false)?;
                let english_text =
                    required_string(reference, "english_text", &ref_path, 500, false)?;
                if !seen.insert((word.to_lowercase(), english_text.to_lowercase())) {
                    return Err(format!("{ref_path}: referencia de frase duplicada"));
                }
                let mode = required_string(reference, "usage_mode", &ref_path, 12, false)?;
                enum_value(
                    mode,
                    &["listening", "reading", "speaking", "writing", "example"],
                    &format!("{ref_path}/usage_mode"),
                )?;
                let position = positive_integer(reference, "position", &ref_path)?;
                if !positions.insert(position) {
                    return Err(format!("{ref_path}/position: posición duplicada"));
                }
                sentence_references = sentence_references.saturating_add(1);
            }
        }
    }

    for (lesson_code, linked) in &lesson_links {
        for objective_code in linked {
            if !objective_codes.contains(objective_code) {
                return Err(format!(
                    "Lección {lesson_code} referencia un objetivo desconocido: {objective_code}"
                ));
            }
        }
    }
    let linked_objectives: HashSet<String> = lesson_links
        .values()
        .flat_map(|codes| codes.iter().cloned())
        .collect();
    if let Some(orphan) = objective_codes.difference(&linked_objectives).next() {
        return Err(format!(
            "El objetivo {orphan} no está asociado a ninguna lección"
        ));
    }

    for (lesson_code, prerequisites) in &lesson_prerequisites {
        for prerequisite in prerequisites {
            if !lesson_codes.contains(prerequisite) {
                return Err(format!(
                    "Lección {lesson_code} referencia un prerrequisito desconocido: {prerequisite}"
                ));
            }
        }
    }

    fn visit(
        code: &str,
        edges: &HashMap<String, Vec<String>>,
        visiting: &mut HashSet<String>,
        visited: &mut HashSet<String>,
    ) -> Result<(), String> {
        if visited.contains(code) {
            return Ok(());
        }
        if !visiting.insert(code.to_string()) {
            return Err(format!(
                "El grafo de prerrequisitos contiene un ciclo en {code}"
            ));
        }
        if let Some(prerequisites) = edges.get(code) {
            for prerequisite in prerequisites {
                visit(prerequisite, edges, visiting, visited)?;
            }
        }
        visiting.remove(code);
        visited.insert(code.to_string());
        Ok(())
    }
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    for code in lesson_prerequisites.keys() {
        visit(code, &lesson_prerequisites, &mut visiting, &mut visited)?;
    }

    Ok(PackageCounts {
        units: units.len() as i32,
        lessons: lesson_total,
        objectives: objectives.len() as i32,
        vocabulary_references,
        sentence_references,
    })
}

fn resolve_single_reference(ids: Vec<Uuid>, description: &str) -> Result<Uuid, String> {
    match ids.as_slice() {
        [id] => Ok(*id),
        [] => Err(format!(
            "Referencia curricular externa no encontrada: {description}"
        )),
        _ => Err(format!(
            "Referencia curricular externa ambigua: {description}"
        )),
    }
}

pub fn validate_package_json(raw: &str) -> Result<(Value, String, PackageCounts), String> {
    if raw.len() > MAX_PACKAGE_BYTES {
        return Err("El paquete curricular supera el límite de 1.5 MB".to_string());
    }
    let mut deserializer = serde_json::Deserializer::from_str(raw);
    let strict = StrictValue::deserialize(&mut deserializer)
        .map_err(|error| format!("JSON curricular inválido: {error}"))?;
    deserializer
        .end()
        .map_err(|error| format!("JSON curricular inválido: {error}"))?;
    let data = strict.into_json();
    let counts = validate_package(&data)?;
    let sha = canonical_sha256(&data)?;
    Ok((data, sha, counts))
}

pub async fn import_package(
    pool: &PgPool,
    actor_user_id: Uuid,
    data: &Value,
    package_sha256: &str,
    counts: PackageCounts,
    apply: bool,
) -> Result<PackageImportResult, String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| "No se pudo iniciar la importación curricular".to_string())?;
    sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
        .bind(actor_user_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|_| "No se pudo establecer la identidad editorial".to_string())?;
    let is_editor: bool = sqlx::query_scalar("SELECT app_is_content_editor()")
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "No se pudo verificar la capacidad editorial".to_string())?;
    if !is_editor {
        return Err("La cuenta no está registrada en content_editors".to_string());
    }

    let units = data["units"]
        .as_array()
        .ok_or("units debe ser un arreglo")?;
    let objectives = data["objectives"]
        .as_array()
        .ok_or("objectives debe ser un arreglo")?;

    let slug = data["course"]["slug"]
        .as_str()
        .ok_or("El paquete no incluye course.slug")?;
    let track = data["course"]["track_code"]
        .as_str()
        .ok_or("El paquete no incluye course.track_code")?;
    let cefr_level = data["version"]["cefr_level"]
        .as_str()
        .ok_or("El paquete no incluye version.cefr_level")?;
    let version_number = positive_integer(
        object(&data["version"], "$/version")?,
        "version_number",
        "$/version",
    )
    .map_err(|error| error.to_string())?;
    let lock_key = format!("course:{slug}");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(&lock_key)
        .execute(&mut *tx)
        .await
        .map_err(|_| "No se pudo bloquear la identidad del curso".to_string())?;

    let course_row: Option<(Uuid, String)> =
        sqlx::query_as("SELECT id, track_code FROM courses WHERE slug = $1 FOR UPDATE")
            .bind(slug)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| "No se pudo consultar el curso".to_string())?;
    let course_id = if let Some((id, existing_track)) = course_row {
        if existing_track != track {
            return Err(format!(
                "El curso {slug} ya existe en la ruta {existing_track}, no {track}"
            ));
        }
        id
    } else {
        sqlx::query_scalar("INSERT INTO courses (slug, track_code) VALUES ($1, $2) RETURNING id")
            .bind(slug)
            .bind(track)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| "No se pudo crear la identidad del curso".to_string())?
    };

    let existing: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        r#"SELECT version.id, version.status, imported.package_sha256
             FROM course_versions version
             LEFT JOIN curriculum_content_package_imports imported
               ON imported.course_version_id = version.id
            WHERE version.course_id = $1
              AND version.cefr_level = $2
              AND version.version_number = $3
            FOR UPDATE OF version"#,
    )
    .bind(course_id)
    .bind(cefr_level)
    .bind(version_number)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| "No se pudo comprobar la versión existente".to_string())?;

    if let Some((version_id, status, existing_sha)) = existing {
        if existing_sha.as_deref() == Some(package_sha256) {
            tx.rollback().await.ok();
            return Ok(PackageImportResult {
                state: "already_imported".to_string(),
                course_version_id: version_id.to_string(),
                package_sha256: package_sha256.to_string(),
                counts: PackageCounts {
                    units: 0,
                    lessons: 0,
                    objectives: 0,
                    vocabulary_references: 0,
                    sentence_references: 0,
                },
                applied: false,
                dry_run: false,
            });
        }
        if existing_sha.is_none() {
            return Err(format!(
                "La versión {slug}/{cefr_level}/v{version_number} existe sin huella de importación; no se sobrescribirá"
            ));
        }
        return Err(format!(
            "La versión {slug}/{cefr_level}/v{version_number} ya existe con contenido distinto (estado {status}); incrementa version_number"
        ));
    }

    let version = &data["version"];
    let description = version["description"].as_str().unwrap_or("");
    let locale = version["locale"].as_str().unwrap_or("en");
    let content_schema_version = version
        .get("content_schema_version")
        .and_then(Value::as_i64)
        .map(|value| value as i32)
        .unwrap_or(SCHEMA_VERSION as i32);
    let created_by = actor_user_id;
    let course_version_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO course_versions (
               course_id, version_number, status, cefr_level, title, description,
               locale, content_schema_version, created_by
           )
           VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
           RETURNING id"#,
    )
    .bind(course_id)
    .bind(version_number)
    .bind(cefr_level)
    .bind(version["title"].as_str().unwrap_or(""))
    .bind(description)
    .bind(locale)
    .bind(content_schema_version)
    .bind(created_by)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| "No se pudo crear la versión curricular draft".to_string())?;

    let mut unit_ids: HashMap<String, Uuid> = HashMap::new();
    let mut lesson_ids: HashMap<String, Uuid> = HashMap::new();
    let mut objective_ids: HashMap<String, Uuid> = HashMap::new();

    for unit in units {
        let code = unit["code"].as_str().unwrap_or("");
        let unit_id: Uuid = sqlx::query_scalar(
            r#"INSERT INTO course_units (
                   course_version_id, unit_code, position, title, theme, description, estimated_minutes
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id"#,
        )
        .bind(course_version_id)
        .bind(code)
        .bind(unit["position"].as_i64().unwrap_or(1) as i32)
        .bind(unit["title"].as_str().unwrap_or(""))
        .bind(unit["theme"].as_str().unwrap_or(""))
        .bind(unit["description"].as_str().unwrap_or(""))
        .bind(unit["estimated_minutes"].as_i64().map(|value| value as i32))
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| format!("No se pudo insertar la unidad {code}"))?;
        unit_ids.insert(code.to_string(), unit_id);
    }

    for objective in objectives {
        let code = objective["code"].as_str().unwrap_or("");
        let objective_id: Uuid = sqlx::query_scalar(
            r#"INSERT INTO learning_objectives (
                   course_version_id, objective_code, description, success_criteria, position
               )
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id"#,
        )
        .bind(course_version_id)
        .bind(code)
        .bind(objective["description"].as_str().unwrap_or(""))
        .bind(objective["success_criteria"].as_str().unwrap_or(""))
        .bind(objective["position"].as_i64().unwrap_or(1) as i32)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| format!("No se pudo insertar el objetivo {code}"))?;
        objective_ids.insert(code.to_string(), objective_id);

        if let Some(skills) = objective["skills"].as_array() {
            for skill in skills {
                sqlx::query(
                    r#"INSERT INTO learning_objective_skills (
                           course_version_id, learning_objective_id, skill_code, is_primary
                       )
                       VALUES ($1, $2, $3, $4)"#,
                )
                .bind(course_version_id)
                .bind(objective_id)
                .bind(skill["code"].as_str().unwrap_or(""))
                .bind(skill["is_primary"].as_bool().unwrap_or(false))
                .execute(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo asociar una competencia al objetivo {code}"))?;
            }
        }
    }

    for unit in units {
        let unit_code = unit["code"].as_str().unwrap_or("");
        let unit_id = *unit_ids
            .get(unit_code)
            .ok_or("No se encontró la unidad importada")?;
        for lesson in unit["lessons"]
            .as_array()
            .ok_or("lessons debe ser un arreglo")?
        {
            let code = lesson["code"].as_str().unwrap_or("");
            let lesson_id: Uuid = sqlx::query_scalar(
                r#"INSERT INTO course_lessons (
                       course_version_id, unit_id, lesson_code, position, lesson_pattern,
                       title, description, estimated_minutes
                   )
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING id"#,
            )
            .bind(course_version_id)
            .bind(unit_id)
            .bind(code)
            .bind(lesson["position"].as_i64().unwrap_or(1) as i32)
            .bind(lesson["pattern"].as_str().unwrap_or("custom"))
            .bind(lesson["title"].as_str().unwrap_or(""))
            .bind(lesson["description"].as_str().unwrap_or(""))
            .bind(
                lesson["estimated_minutes"]
                    .as_i64()
                    .map(|value| value as i32),
            )
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| format!("No se pudo insertar la lección {code}"))?;
            lesson_ids.insert(code.to_string(), lesson_id);
            for (index, objective_code) in lesson["objective_codes"]
                .as_array()
                .ok_or("objective_codes debe ser un arreglo")?
                .iter()
                .enumerate()
            {
                let objective_code = objective_code.as_str().ok_or("objective_code inválido")?;
                let objective_id = *objective_ids
                    .get(objective_code)
                    .ok_or("Referencia a objetivo inexistente")?;
                sqlx::query(
                    r#"INSERT INTO lesson_learning_objectives (
                           course_version_id, lesson_id, learning_objective_id, position, is_required
                       )
                       VALUES ($1, $2, $3, $4, TRUE)"#,
                )
                .bind(course_version_id)
                .bind(lesson_id)
                .bind(objective_id)
                .bind((index + 1) as i32)
                .execute(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo asociar el objetivo {objective_code} a {code}"))?;
            }
        }
    }

    for objective in objectives {
        let objective_code = objective["code"].as_str().unwrap_or("");
        let objective_id = *objective_ids
            .get(objective_code)
            .ok_or("Objetivo importado no encontrado")?;

        if let Some(references) = objective["vocabulary"].as_array() {
            for reference in references {
                let word = reference["word"].as_str().unwrap_or("");
                let category = reference["category"].as_str().unwrap_or("");
                let ids: Vec<Uuid> = sqlx::query_scalar(
                    r#"SELECT id FROM vocabulary_words
                        WHERE lower(btrim(word)) = lower(btrim($1))
                          AND lower(btrim(category)) = lower(btrim($2))
                        ORDER BY id LIMIT 2"#,
                )
                .bind(word)
                .bind(category)
                .fetch_all(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo resolver la palabra {word}"))?;
                let vocabulary_id = resolve_single_reference(
                    ids,
                    &format!("palabra {word} en categoría {category}"),
                )?;
                sqlx::query(
                    r#"INSERT INTO learning_objective_vocabulary (
                           course_version_id, learning_objective_id, vocabulary_word_id, usage_mode, position
                       )
                       VALUES ($1, $2, $3, $4, $5)"#,
                )
                .bind(course_version_id)
                .bind(objective_id)
                .bind(vocabulary_id)
                .bind(reference["usage_mode"].as_str().unwrap_or(""))
                .bind(reference["position"].as_i64().unwrap_or(1) as i32)
                .execute(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo asociar la palabra {word}"))?;
            }
        }

        if let Some(references) = objective["sentences"].as_array() {
            for reference in references {
                let word = reference["word"].as_str().unwrap_or("");
                let english = reference["english_text"].as_str().unwrap_or("");
                let ids: Vec<Uuid> = sqlx::query_scalar(
                    r#"SELECT sentence.id
                         FROM context_sentences sentence
                         JOIN vocabulary_words word ON word.id = sentence.word_id
                        WHERE lower(btrim(word.word)) = lower(btrim($1))
                          AND lower(btrim(sentence.english_text)) = lower(btrim($2))
                        ORDER BY sentence.id LIMIT 2"#,
                )
                .bind(word)
                .bind(english)
                .fetch_all(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo resolver la frase {english}"))?;
                let sentence_id =
                    resolve_single_reference(ids, &format!("frase de {word}: {english}"))?;
                sqlx::query(
                    r#"INSERT INTO learning_objective_sentences (
                           course_version_id, learning_objective_id, context_sentence_id, usage_mode, position
                       )
                       VALUES ($1, $2, $3, $4, $5)"#,
                )
                .bind(course_version_id)
                .bind(objective_id)
                .bind(sentence_id)
                .bind(reference["usage_mode"].as_str().unwrap_or(""))
                .bind(reference["position"].as_i64().unwrap_or(1) as i32)
                .execute(&mut *tx)
                .await
                .map_err(|_| format!("No se pudo asociar la frase {english}"))?;
            }
        }
    }

    for unit in units {
        for lesson in unit["lessons"]
            .as_array()
            .ok_or("lessons debe ser un arreglo")?
        {
            let lesson_code = lesson["code"].as_str().unwrap_or("");
            let lesson_id = *lesson_ids
                .get(lesson_code)
                .ok_or("Lección importada no encontrada")?;
            if let Some(prerequisites) = lesson["prerequisites"].as_array() {
                for prerequisite in prerequisites {
                    let prerequisite_code = prerequisite["lesson_code"].as_str().unwrap_or("");
                    let prerequisite_id = *lesson_ids
                        .get(prerequisite_code)
                        .ok_or("Prerequisito importado no encontrado")?;
                    sqlx::query(
                        r#"INSERT INTO lesson_prerequisites (
                               course_version_id, lesson_id, prerequisite_lesson_id,
                               required_state, minimum_mastery_score
                           )
                           VALUES ($1, $2, $3, $4, $5)"#,
                    )
                    .bind(course_version_id)
                    .bind(lesson_id)
                    .bind(prerequisite_id)
                    .bind(
                        prerequisite["required_state"]
                            .as_str()
                            .unwrap_or("completed"),
                    )
                    .bind(
                        prerequisite["minimum_mastery_score"]
                            .as_f64()
                            .unwrap_or(0.8),
                    )
                    .execute(&mut *tx)
                    .await
                    .map_err(|_| format!("No se pudo guardar el prerrequisito de {lesson_code}"))?;
                }
            }
        }
    }

    let metadata = serde_json::to_string(&data["metadata"])
        .map_err(|_| "No se pudo serializar metadata curricular".to_string())?;
    sqlx::query(
        r#"INSERT INTO curriculum_content_package_imports (
               course_version_id, format, schema_version, package_sha256, metadata,
               content_schema_version_explicit
           )
           VALUES ($1, $2, $3, $4, $5::JSONB, $6)"#,
    )
    .bind(course_version_id)
    .bind(FORMAT_NAME)
    .bind(SCHEMA_VERSION as i32)
    .bind(package_sha256)
    .bind(metadata)
    .bind(data["version"].get("content_schema_version").is_some())
    .execute(&mut *tx)
    .await
    .map_err(|_| "No se pudo registrar la procedencia del paquete curricular".to_string())?;

    if apply {
        tx.commit()
            .await
            .map_err(|_| "No se pudo confirmar la importación curricular".to_string())?;
    } else {
        tx.rollback()
            .await
            .map_err(|_| "No se pudo revertir la previsualización curricular".to_string())?;
    }

    Ok(PackageImportResult {
        state: "imported".to_string(),
        course_version_id: course_version_id.to_string(),
        package_sha256: package_sha256.to_string(),
        counts,
        applied: apply,
        dry_run: !apply,
    })
}

#[cfg(test)]
mod tests {
    use super::{valid_http_url, validate_package_json};
    use serde_json::Value;

    const VALID_PACKAGE: &str =
        include_str!("../../../tests/fixtures/curriculum/phase1_3_content_package_v1.json");

    #[test]
    fn validates_the_versioned_ci_package_and_returns_counts() {
        let (_, sha, counts) =
            validate_package_json(VALID_PACKAGE).expect("fixture is canonical v1");
        assert_eq!(sha.len(), 64);
        assert!(sha.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert!(counts.units > 0);
        assert!(counts.lessons > 0);
        assert!(counts.objectives > 0);
    }

    #[test]
    fn rejects_duplicate_json_object_keys() {
        let raw = r#"{"format":"devfluency.curriculum-content","format":"duplicate"}"#;
        let error = validate_package_json(raw).expect_err("duplicate keys must be rejected");
        assert!(error.contains("duplicate JSON object key"));
    }

    #[test]
    fn rejects_a_cycle_in_prerequisites() {
        let raw = r#"{
          "format":"devfluency.curriculum-content",
          "schema_version":1,
          "metadata":{"author":"Test","authored_at":"2026-11-18","source":{"name":"Original material","license":"CC BY 4.0"}},
          "course":{"slug":"cycle-course","track_code":"general"},
          "version":{"version_number":1,"cefr_level":"A1","title":"Cycle test","description":"","locale":"en"},
          "units":[{"code":"unit-1","position":1,"title":"Unit","theme":"Theme","description":"","lessons":[
            {"code":"lesson-1","position":1,"pattern":"discover","title":"One","description":"","objective_codes":["objective-1"],"prerequisites":[{"lesson_code":"lesson-2","required_state":"completed","minimum_mastery_score":0.8}]},
            {"code":"lesson-2","position":2,"pattern":"practice","title":"Two","description":"","objective_codes":["objective-2"],"prerequisites":[{"lesson_code":"lesson-1","required_state":"completed","minimum_mastery_score":0.8}]}
          ]}],
          "objectives":[
            {"code":"objective-1","position":1,"description":"One","success_criteria":"One","skills":[{"code":"vocabulary","is_primary":true}]},
            {"code":"objective-2","position":2,"description":"Two","success_criteria":"Two","skills":[{"code":"grammar","is_primary":true}]}
          ]
        }"#;
        let error = validate_package_json(raw).expect_err("cycles must be rejected");
        assert!(error.contains("ciclo"));
    }

    #[test]
    fn rejects_explicit_null_and_out_of_range_integer_fields() {
        let mut data: Value =
            serde_json::from_str(VALID_PACKAGE).expect("fixture should be valid JSON");
        data["units"][0]["estimated_minutes"] = Value::Null;
        let raw = serde_json::to_string(&data).expect("serialize mutated package");
        let error = validate_package_json(&raw).expect_err("explicit null must be rejected");
        assert!(error.contains("entero positivo"));

        let mut data: Value =
            serde_json::from_str(VALID_PACKAGE).expect("fixture should be valid JSON");
        data["version"]["version_number"] = Value::from(i64::from(i32::MAX) + 1);
        let raw = serde_json::to_string(&data).expect("serialize mutated package");
        let error =
            validate_package_json(&raw).expect_err("PostgreSQL INTEGER overflow must be rejected");
        assert!(error.contains("rango INTEGER"));
    }

    #[test]
    fn validates_http_urls_with_hosts_and_valid_ports() {
        assert!(valid_http_url("https://example.com/source"));
        assert!(valid_http_url("http://localhost:8080/package.json"));
        assert!(valid_http_url("https://[::1]:8443/package"));
        assert!(!valid_http_url("https://"));
        assert!(!valid_http_url("https://example.com:99999"));
        assert!(!valid_http_url("file:///tmp/package.json"));
    }
}
