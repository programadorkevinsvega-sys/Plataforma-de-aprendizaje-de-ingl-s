use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use proto::content::{
    CurriculumCourseSummary, CurriculumLesson, CurriculumObjective, CurriculumPrerequisite,
    CurriculumUnit, EnrollInCourseRequest, GetCurriculumCourseRequest,
    ListCurriculumCoursesRequest,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};
use crate::AppState;

#[derive(Serialize)]
pub struct CurriculumCourseDto {
    pub course_version_id: String,
    pub slug: String,
    pub track_code: String,
    pub cefr_level: String,
    pub version_number: i32,
    pub title: String,
    pub description: String,
    pub unit_count: i32,
    pub lesson_count: i32,
    pub estimated_minutes: i32,
    pub enrolled: bool,
    pub status: String,
}

#[derive(Serialize)]
pub struct CurriculumCourseListDto {
    pub items: Vec<CurriculumCourseDto>,
    pub total: i32,
    pub limit: i32,
    pub offset: i32,
}

#[derive(Serialize)]
pub struct CurriculumObjectiveDto {
    pub id: String,
    pub objective_code: String,
    pub description: String,
    pub success_criteria: String,
    pub position: i32,
    pub required: bool,
    pub skills: Vec<String>,
}

#[derive(Serialize)]
pub struct CurriculumPrerequisiteDto {
    pub prerequisite_lesson_id: String,
    pub required_state: String,
    pub minimum_mastery_score: f64,
}

#[derive(Serialize)]
pub struct CurriculumLessonDto {
    pub id: String,
    pub lesson_code: String,
    pub position: i32,
    pub lesson_pattern: String,
    pub title: String,
    pub description: String,
    pub estimated_minutes: i32,
    pub objectives: Vec<CurriculumObjectiveDto>,
    pub prerequisites: Vec<CurriculumPrerequisiteDto>,
}

#[derive(Serialize)]
pub struct CurriculumUnitDto {
    pub id: String,
    pub position: i32,
    pub title: String,
    pub theme: String,
    pub description: String,
    pub estimated_minutes: i32,
    pub lessons: Vec<CurriculumLessonDto>,
}

#[derive(Serialize)]
pub struct CurriculumCourseDetailDto {
    pub course: CurriculumCourseDto,
    pub units: Vec<CurriculumUnitDto>,
}

#[derive(Deserialize)]
pub struct EnrollCourseBody {
    pub course_version_id: String,
}

#[derive(Serialize)]
pub struct EnrollmentDto {
    pub enrollment_id: String,
    pub course_version_id: String,
    pub status: String,
    pub started_at: String,
}

impl From<CurriculumCourseSummary> for CurriculumCourseDto {
    fn from(course: CurriculumCourseSummary) -> Self {
        Self {
            course_version_id: course.course_version_id,
            slug: course.slug,
            track_code: course.track_code,
            cefr_level: course.cefr_level,
            version_number: course.version_number,
            title: course.title,
            description: course.description,
            unit_count: course.unit_count,
            lesson_count: course.lesson_count,
            estimated_minutes: course.estimated_minutes,
            enrolled: course.enrolled,
            status: course.status,
        }
    }
}

impl From<CurriculumObjective> for CurriculumObjectiveDto {
    fn from(objective: CurriculumObjective) -> Self {
        Self {
            id: objective.id,
            objective_code: objective.objective_code,
            description: objective.description,
            success_criteria: objective.success_criteria,
            position: objective.position,
            required: objective.required,
            skills: objective.skills,
        }
    }
}

impl From<CurriculumPrerequisite> for CurriculumPrerequisiteDto {
    fn from(prerequisite: CurriculumPrerequisite) -> Self {
        Self {
            prerequisite_lesson_id: prerequisite.prerequisite_lesson_id,
            required_state: prerequisite.required_state,
            minimum_mastery_score: prerequisite.minimum_mastery_score,
        }
    }
}

impl From<CurriculumLesson> for CurriculumLessonDto {
    fn from(lesson: CurriculumLesson) -> Self {
        Self {
            id: lesson.id,
            lesson_code: lesson.lesson_code,
            position: lesson.position,
            lesson_pattern: lesson.lesson_pattern,
            title: lesson.title,
            description: lesson.description,
            estimated_minutes: lesson.estimated_minutes,
            objectives: lesson.objectives.into_iter().map(Into::into).collect(),
            prerequisites: lesson.prerequisites.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<CurriculumUnit> for CurriculumUnitDto {
    fn from(unit: CurriculumUnit) -> Self {
        Self {
            id: unit.id,
            position: unit.position,
            title: unit.title,
            theme: unit.theme,
            description: unit.description,
            estimated_minutes: unit.estimated_minutes,
            lessons: unit.lessons.into_iter().map(Into::into).collect(),
        }
    }
}

fn curriculum_error(error: tonic::Status, operation: &'static str) -> (StatusCode, Json<Value>) {
    let (status, code, message) = match error.code() {
        tonic::Code::Unauthenticated => (
            StatusCode::UNAUTHORIZED,
            "CURRICULUM_UNAUTHENTICATED",
            "Se requiere una sesión válida.",
        ),
        tonic::Code::PermissionDenied => (
            StatusCode::FORBIDDEN,
            "CURRICULUM_FORBIDDEN",
            "No tienes permiso para consultar este recurso curricular.",
        ),
        tonic::Code::InvalidArgument => (
            StatusCode::BAD_REQUEST,
            "CURRICULUM_INVALID_REQUEST",
            "La ruta o los datos de la solicitud no son válidos.",
        ),
        tonic::Code::NotFound => (
            StatusCode::NOT_FOUND,
            "CURRICULUM_NOT_FOUND",
            "No se encontró una versión curricular disponible para esta ruta.",
        ),
        tonic::Code::ResourceExhausted => (
            StatusCode::TOO_MANY_REQUESTS,
            "CURRICULUM_RATE_LIMITED",
            "Se alcanzó el límite temporal de solicitudes.",
        ),
        tonic::Code::DeadlineExceeded | tonic::Code::Unavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            "CURRICULUM_UNAVAILABLE",
            "El servicio curricular no está disponible temporalmente.",
        ),
        _ => (
            StatusCode::BAD_GATEWAY,
            "CURRICULUM_UPSTREAM_ERROR",
            "No se pudo completar la operación curricular.",
        ),
    };
    tracing::warn!(operation, grpc_code = ?error.code(), "Curriculum request failed");
    (
        status,
        Json(serde_json::json!({ "message": message, "code": code })),
    )
}

#[derive(Deserialize)]
pub struct CurriculumCourseQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub track: Option<String>,
    pub level: Option<String>,
    pub search: Option<String>,
}

/// GET /api/v1/curriculum/courses?limit=20&offset=0&track=general&level=A1&search=...
pub async fn list_curriculum_courses_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CurriculumCourseQuery>,
) -> Result<Json<CurriculumCourseListDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(ListCurriculumCoursesRequest {
        user_id,
        limit: query.limit.unwrap_or(20),
        offset: query.offset.unwrap_or(0),
        track_code: query.track.unwrap_or_default(),
        cefr_level: query.level.unwrap_or_default(),
        search: query.search.unwrap_or_default(),
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .list_curriculum_courses(request)
        .await
        .map_err(|error| curriculum_error(error, "list_courses"))?
        .into_inner();

    Ok(Json(CurriculumCourseListDto {
        items: response.items.into_iter().map(Into::into).collect(),
        total: response.total,
        limit: response.limit,
        offset: response.offset,
    }))
}

/// GET /api/v1/curriculum/courses/:course_version_id
pub async fn get_curriculum_course_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Path(course_version_id): Path<String>,
) -> Result<Json<CurriculumCourseDetailDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(GetCurriculumCourseRequest {
        user_id,
        course_version_id,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .get_curriculum_course(request)
        .await
        .map_err(|error| curriculum_error(error, "get_course"))?
        .into_inner();
    let course = response.course.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "message": "El servicio curricular devolvió un curso incompleto.",
                "code": "CURRICULUM_INVALID_RESPONSE"
            })),
        )
    })?;

    Ok(Json(CurriculumCourseDetailDto {
        course: course.into(),
        units: response.units.into_iter().map(Into::into).collect(),
    }))
}

/// POST /api/v1/curriculum/enrollments
pub async fn enroll_course_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<EnrollCourseBody>,
) -> Result<Json<EnrollmentDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(EnrollInCourseRequest {
        user_id,
        course_version_id: body.course_version_id,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .enroll_in_course(request)
        .await
        .map_err(|error| curriculum_error(error, "enroll_course"))?
        .into_inner();

    Ok(Json(EnrollmentDto {
        enrollment_id: response.enrollment_id,
        course_version_id: response.course_version_id,
        status: response.status,
        started_at: response.started_at,
    }))
}
