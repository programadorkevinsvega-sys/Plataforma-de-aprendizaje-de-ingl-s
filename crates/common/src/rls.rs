use sqlx::PgConnection;
use uuid::Uuid;

/// Sets the request-scoped identity used by PostgreSQL Row Level Security.
///
/// Call this only after opening a transaction and use the same transaction
/// connection for every protected query. The third argument to set_config is
/// true, so PostgreSQL resets the setting automatically at transaction end,
/// including rollback. The user ID is bound as a parameter rather than
/// interpolated into SQL.
pub async fn set_current_user_id(
    conn: &mut PgConnection,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
        .bind(user_id.to_string())
        .execute(conn)
        .await?;
    Ok(())
}

/// Enables the explicit leaderboard read policy for the current transaction.
/// Call only after verifying a valid user identity and setting that user's
/// RLS context; PostgreSQL resets this flag at transaction end.
pub async fn set_leaderboard_read_scope(conn: &mut PgConnection) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT set_config('app.allow_leaderboard', 'true', true)")
        .execute(conn)
        .await?;
    Ok(())
}
