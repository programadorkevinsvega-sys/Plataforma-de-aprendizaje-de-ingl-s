use sqlx::PgConnection;
use uuid::Uuid;

/// Inyecta la variable de sesión `app.current_user_id` en la conexión PostgreSQL
/// para activar las políticas nativas de Row Level Security (RLS).
pub async fn set_current_user_id(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    let sql = format!("SET LOCAL app.current_user_id = '{}'", user_id);
    sqlx::query(&sql).execute(conn).await?;
    Ok(())
}
