use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use proto::content::{
    CurriculumCourseSummary, CurriculumLesson, CurriculumObjective, CurriculumPrerequisite,
    CurriculumUnit, EditorialCourseVersionSummary, EnrollInCourseRequest,
    GetCurriculumCourseRequest, ImportCurriculumPackageRequest, ListCurriculumCoursesRequest,
    ListEditorialVersionsRequest, ManageEditorialVersionRequest,
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
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

#[derive(Deserialize, Default)]
pub struct CurriculumCourseListQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub track_code: Option<String>,
    pub cefr_level: Option<String>,
    pub search: Option<String>,
    pub enrolled_only: Option<bool>,
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
pub struct CurriculumLessonProgressDto {
    pub state: String,
    pub mastery_score: f64,
    pub required_objectives: i32,
    pub completed_objectives: i32,
    pub prerequisites_satisfied: bool,
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
    pub progress: Option<CurriculumLessonProgressDto>,
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

#[derive(Deserialize, Default)]
pub struct EditorialVersionsQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub status: Option<String>,
    pub search: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportCurriculumPackageBody {
    pub package_json: String,
    #[serde(default)]
    pub apply: bool,
}

#[derive(Serialize)]
pub struct ImportCurriculumPackageDto {
    pub state: String,
    pub course_version_id: String,
    pub package_sha256: String,
    pub units: i32,
    pub lessons: i32,
    pub objectives: i32,
    pub vocabulary_references: i32,
    pub sentence_references: i32,
    pub applied: bool,
    pub dry_run: bool,
}

#[derive(Deserialize)]
pub struct EditorialActionBody {
    pub action: String,
    pub decision: Option<String>,
    pub comments: Option<String>,
}

#[derive(Serialize)]
pub struct EditorialVersionDto {
    pub course_version_id: String,
    pub slug: String,
    pub track_code: String,
    pub cefr_level: String,
    pub version_number: i32,
    pub status: String,
    pub title: String,
    pub description: String,
    pub imported_at: String,
    pub package_sha256: String,
    pub latest_decision: String,
    pub latest_comments: String,
    pub latest_reviewer_id: String,
    pub can_publish: bool,
}

#[derive(Serialize)]
pub struct EditorialVersionListDto {
    pub items: Vec<EditorialVersionDto>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

#[derive(Serialize)]
pub struct EditorialActionDto {
    pub course_version_id: String,
    pub action: String,
    pub previous_status: String,
    pub next_status: String,
    pub review_id: String,
    pub reviewed_at: String,
}

impl From<EditorialCourseVersionSummary> for EditorialVersionDto {
    fn from(version: EditorialCourseVersionSummary) -> Self {
        Self {
            course_version_id: version.course_version_id,
            slug: version.slug,
            track_code: version.track_code,
            cefr_level: version.cefr_level,
            version_number: version.version_number,
            status: version.status,
            title: version.title,
            description: version.description,
            imported_at: version.imported_at,
            package_sha256: version.package_sha256,
            latest_decision: version.latest_decision,
            latest_comments: version.latest_comments,
            latest_reviewer_id: version.latest_reviewer_id,
            can_publish: version.can_publish,
        }
    }
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
            progress: lesson.progress.map(|progress| CurriculumLessonProgressDto {
                state: progress.state,
                mastery_score: progress.mastery_score,
                required_objectives: progress.required_objectives,
                completed_objectives: progress.completed_objectives,
                prerequisites_satisfied: progress.prerequisites_satisfied,
            }),
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
            error.message(),
        ),
        tonic::Code::FailedPrecondition | tonic::Code::AlreadyExists => (
            StatusCode::CONFLICT,
            "CURRICULUM_STATE_CONFLICT",
            error.message(),
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

/// GET /api/v1/curriculum/courses
pub async fn list_curriculum_courses_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CurriculumCourseListQuery>,
) -> Result<Json<CurriculumCourseListDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(ListCurriculumCoursesRequest {
        user_id,
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(12),
        track_code: query.track_code.unwrap_or_default(),
        cefr_level: query.cefr_level.unwrap_or_default(),
        search_query: query.search.unwrap_or_default(),
        enrolled_only: query.enrolled_only.unwrap_or(false),
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
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages,
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

/// GET /api/v1/curriculum/editor/versions
pub async fn list_curriculum_editorial_versions_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<EditorialVersionsQuery>,
) -> Result<Json<EditorialVersionListDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(ListEditorialVersionsRequest {
        user_id,
        page: query.page.unwrap_or(1),
        page_size: query.page_size.unwrap_or(20),
        status: query.status.unwrap_or_default(),
        search_query: query.search.unwrap_or_default(),
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .list_editorial_versions(request)
        .await
        .map_err(|error| curriculum_error(error, "list_editorial_versions"))?
        .into_inner();

    Ok(Json(EditorialVersionListDto {
        items: response.items.into_iter().map(Into::into).collect(),
        total: response.total,
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages,
    }))
}

/// POST /api/v1/curriculum/editor/import
///
/// A preview uses the same transactional importer and rolls back. Persisting a
/// package requires the explicit apply=true confirmation from the editor.
pub async fn import_curriculum_package_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ImportCurriculumPackageBody>,
) -> Result<Json<ImportCurriculumPackageDto>, (StatusCode, Json<Value>)> {
    if body.package_json.trim().is_empty() || body.package_json.len() > 3_500_000 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "El paquete está vacío o supera el tamaño máximo permitido.",
                "code": "CURRICULUM_PACKAGE_SIZE_INVALID"
            })),
        ));
    }

    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(ImportCurriculumPackageRequest {
        user_id,
        package_json: body.package_json,
        apply: body.apply,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .import_curriculum_package(request)
        .await
        .map_err(|error| curriculum_error(error, "import_curriculum_package"))?
        .into_inner();

    Ok(Json(ImportCurriculumPackageDto {
        state: response.state,
        course_version_id: response.course_version_id,
        package_sha256: response.package_sha256,
        units: response.units,
        lessons: response.lessons,
        objectives: response.objectives,
        vocabulary_references: response.vocabulary_references,
        sentence_references: response.sentence_references,
        applied: response.applied,
        dry_run: response.dry_run,
    }))
}

/// POST /api/v1/curriculum/editor/versions/:course_version_id/actions
pub async fn manage_curriculum_editorial_version_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Path(course_version_id): Path<String>,
    Json(body): Json<EditorialActionBody>,
) -> Result<Json<EditorialActionDto>, (StatusCode, Json<Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut request = tonic::Request::new(ManageEditorialVersionRequest {
        user_id,
        course_version_id,
        action: body.action,
        decision: body.decision.unwrap_or_default(),
        comments: body.comments.unwrap_or_default(),
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client
        .manage_editorial_version(request)
        .await
        .map_err(|error| curriculum_error(error, "manage_editorial_version"))?
        .into_inner();

    Ok(Json(EditorialActionDto {
        course_version_id: response.course_version_id,
        action: response.action,
        previous_status: response.previous_status,
        next_status: response.next_status,
        review_id: response.review_id,
        reviewed_at: response.reviewed_at,
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
