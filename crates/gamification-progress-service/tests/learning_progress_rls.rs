use sqlx::{Connection, PgConnection};
use uuid::Uuid;

/// Exercises the ledger policy with a real NOBYPASSRLS role. CI must apply all
/// repository migrations to a disposable PostgreSQL database first.
#[tokio::test]
async fn learning_progress_ledger_is_isolated_by_transaction_local_user_context(
) -> Result<(), Box<dyn std::error::Error>> {
    let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!(
            "TEST_DATABASE_URL is not configured; skipping learning-progress RLS integration test"
        );
        return Ok(());
    };

    let mut conn = PgConnection::connect(&database_url).await?;
    let schema_ready: bool =
        sqlx::query_scalar("SELECT to_regclass('public.learning_progress_events') IS NOT NULL")
            .fetch_one(&mut conn)
            .await?;
    assert!(
        schema_ready,
        "apply all repository migrations before running this integration test"
    );

    let suffix = Uuid::new_v4().simple().to_string();
    let role = format!("learning_rls_role_{suffix}");
    let user_a = Uuid::new_v4();
    let user_b = Uuid::new_v4();
    let word_id = Uuid::new_v4();
    let other_word_id = Uuid::new_v4();

    sqlx::query(&format!("CREATE ROLE {role} NOLOGIN NOBYPASSRLS"))
        .execute(&mut conn)
        .await?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, 'test-hash', 'RLS A'), ($3, $4, 'test-hash', 'RLS B')"
    )
    .bind(user_a)
    .bind(format!("ledger-a-{suffix}@example.invalid"))
    .bind(user_b)
    .bind(format!("ledger-b-{suffix}@example.invalid"))
    .execute(&mut conn)
    .await?;

    sqlx::query(
        "INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level) VALUES ($1, 'rls-word', 'phonetic', 'translation', 'test', 'A1'), ($2, 'rls-other-word', 'phonetic', 'translation', 'test', 'A1')"
    )
    .bind(word_id)
    .bind(other_word_id)
    .execute(&mut conn)
    .await?;

    sqlx::query(
        "INSERT INTO learning_progress_events (user_id, word_id, xp_amount, coins_amount, words_learned_delta) VALUES ($1, $3, 10, 2, 1), ($2, $3, 10, 2, 1)"
    )
    .bind(user_a)
    .bind(user_b)
    .bind(word_id)
    .execute(&mut conn)
    .await?;

    sqlx::query(&format!(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE learning_progress_events TO {role}"
    ))
    .execute(&mut conn)
    .await?;

    let mut tx = conn.begin().await?;
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *tx)
        .await?;
    common::set_current_user_id(&mut tx, user_a).await?;

    let visible: Vec<Uuid> =
        sqlx::query_scalar("SELECT word_id FROM learning_progress_events ORDER BY word_id")
            .fetch_all(&mut *tx)
            .await?;
    assert_eq!(
        visible,
        vec![word_id],
        "user A must not see user B's reward event"
    );

    let cross_user_update = sqlx::query(
        "UPDATE learning_progress_events SET xp_amount = 0 WHERE user_id = $1 AND word_id = $2",
    )
    .bind(user_b)
    .bind(word_id)
    .execute(&mut *tx)
    .await?;
    assert_eq!(
        cross_user_update.rows_affected(),
        0,
        "RLS must prevent updating another user's ledger row"
    );
    tx.commit().await?;

    // WITH CHECK must also prevent a user from inserting an event for a different
    // subject. Run it in a new transaction because a denied INSERT aborts its tx.
    let mut write_tx = conn.begin().await?;
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *write_tx)
        .await?;
    common::set_current_user_id(&mut write_tx, user_a).await?;
    let cross_user_insert = sqlx::query(
        "INSERT INTO learning_progress_events (user_id, word_id, xp_amount, coins_amount, words_learned_delta) VALUES ($1, $2, 10, 2, 1)"
    )
    .bind(user_b)
    .bind(other_word_id)
    .execute(&mut *write_tx)
    .await;
    assert!(
        cross_user_insert.is_err(),
        "RLS WITH CHECK must block cross-user ledger writes"
    );
    write_tx.rollback().await?;

    // The transaction-local identity must not leak to the next transaction.
    let mut next_tx = conn.begin().await?;
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *next_tx)
        .await?;
    let visible_without_context: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM learning_progress_events")
            .fetch_one(&mut *next_tx)
            .await?;
    assert_eq!(
        visible_without_context, 0,
        "RLS context must reset at transaction end"
    );
    next_tx.rollback().await?;

    sqlx::query("DELETE FROM users WHERE id = $1 OR id = $2")
        .bind(user_a)
        .bind(user_b)
        .execute(&mut conn)
        .await?;
    sqlx::query("DELETE FROM vocabulary_words WHERE id = $1 OR id = $2")
        .bind(word_id)
        .bind(other_word_id)
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
