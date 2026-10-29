use sqlx::{Connection, PgConnection};
use uuid::Uuid;

/// Requires TEST_DATABASE_URL to point to a disposable PostgreSQL database
/// initialized by the CI migration step. Exercises the actual user_stats policies
/// using a non-owner, NOBYPASSRLS role.
#[tokio::test]
async fn rls_context_is_transaction_local_and_scopes_user_stats(
) -> Result<(), Box<dyn std::error::Error>> {
    let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("TEST_DATABASE_URL is not configured; skipping PostgreSQL RLS integration test");
        return Ok(());
    };

    let mut conn = PgConnection::connect(&database_url).await?;
    let schema_ready: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.user_stats') IS NOT NULL AND to_regclass('public.user_srs_progress') IS NOT NULL AND to_regclass('public.ai_exam_sessions') IS NOT NULL"
    )
    .fetch_one(&mut conn)
    .await?;
    assert!(
        schema_ready,
        "apply repository migrations before running RLS integration tests"
    );

    let suffix = Uuid::new_v4().simple().to_string();
    let role = format!("rls_test_role_{suffix}");
    let user_a = Uuid::new_v4();
    let user_b = Uuid::new_v4();
    let email_a = format!("rls-a-{suffix}@example.invalid");
    let email_b = format!("rls-b-{suffix}@example.invalid");

    sqlx::query(&format!("CREATE ROLE {role} NOLOGIN NOBYPASSRLS"))
        .execute(&mut conn)
        .await?;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, 'test-hash-a', 'RLS Test A'), ($3, $4, 'test-hash-b', 'RLS Test B')",
    )
    .bind(user_a)
    .bind(&email_a)
    .bind(user_b)
    .bind(&email_b)
    .execute(&mut conn)
    .await?;
    sqlx::query(
        "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned) VALUES ($1, 10, 1, 50, 1), ($2, 200, 3, 90, 20)",
    )
    .bind(user_a)
    .bind(user_b)
    .execute(&mut conn)
    .await?;
    sqlx::query(&format!(
        "GRANT SELECT, UPDATE ON TABLE user_stats TO {role}"
    ))
    .execute(&mut conn)
    .await?;
    sqlx::query(&format!("GRANT SELECT ON TABLE users TO {role}"))
        .execute(&mut conn)
        .await?;

    let mut tx = conn.begin().await?;
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *tx)
        .await?;
    common::set_current_user_id(&mut *tx, user_a).await?;

    let visible: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM user_stats ORDER BY user_id")
        .fetch_all(&mut *tx)
        .await?;
    assert_eq!(
        visible,
        vec![user_a],
        "RLS must expose only the authenticated user's statistics"
    );

    let other_update = sqlx::query("UPDATE user_stats SET xp = 999 WHERE user_id = $1")
        .bind(user_b)
        .execute(&mut *tx)
        .await?;
    assert_eq!(
        other_update.rows_affected(),
        0,
        "RLS must prevent updating another user's statistics"
    );

    // The leaderboard is an explicit authenticated read scope. Its SELECT
    // policy expands visibility only for this transaction; UPDATE remains scoped.
    common::set_leaderboard_read_scope(&mut *tx).await?;
    let leaderboard: Vec<Uuid> =
        sqlx::query_scalar("SELECT user_id FROM user_stats ORDER BY user_id")
            .fetch_all(&mut *tx)
            .await?;
    assert_eq!(
        leaderboard.len(),
        2,
        "authenticated leaderboard can read ranking rows"
    );
    assert!(leaderboard.contains(&user_a));
    assert!(leaderboard.contains(&user_b));

    let other_update_after_leaderboard =
        sqlx::query("UPDATE user_stats SET xp = 1234 WHERE user_id = $1")
            .bind(user_b)
            .execute(&mut *tx)
            .await?;
    assert_eq!(
        other_update_after_leaderboard.rows_affected(),
        0,
        "leaderboard scope must not expand write permissions"
    );
    tx.commit().await?;

    let mut next_tx = conn.begin().await?;
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *next_tx)
        .await?;
    let visible_after_reset: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM user_stats")
        .fetch_one(&mut *next_tx)
        .await?;
    assert_eq!(
        visible_after_reset.0, 0,
        "user and leaderboard settings must not leak into the next transaction"
    );
    next_tx.rollback().await?;

    sqlx::query("DELETE FROM users WHERE id = $1 OR id = $2")
        .bind(user_a)
        .bind(user_b)
        .execute(&mut conn)
        .await?;
    sqlx::query(&format!("DROP OWNED BY {role}"))
        .execute(&mut conn)
        .await?;
    sqlx::query(&format!("DROP ROLE {role}"))
        .execute(&mut conn)
        .await?;

    Ok(())
}
