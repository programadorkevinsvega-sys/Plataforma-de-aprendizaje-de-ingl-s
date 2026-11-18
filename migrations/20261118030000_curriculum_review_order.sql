-- Fase 1.3: make editorial decision ordering deterministic under timestamp ties.
-- Review history remains append-only; the identity is assigned once at insertion.

ALTER TABLE course_version_reviews
    ADD COLUMN IF NOT EXISTS review_order BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_version_reviews_order
    ON course_version_reviews(course_version_id, review_order);

CREATE OR REPLACE FUNCTION guard_course_version_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'A curriculum version must be created as draft'
                USING ERRCODE = '55000';
        END IF;
        -- Serialize version creation with changes to the stable course slug/track.
        PERFORM id
        FROM courses
        WHERE id = NEW.course_id
        FOR UPDATE;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('published', 'archived') THEN
            RAISE EXCEPTION 'Published curriculum versions cannot be deleted'
                USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status IN ('published', 'archived') THEN
        IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'archived') THEN
            RAISE EXCEPTION 'A published curriculum version can only be archived'
                USING ERRCODE = '55000';
        END IF;
        IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
            RAISE EXCEPTION 'Archived curriculum versions are immutable'
                USING ERRCODE = '55000';
        END IF;
        IF (to_jsonb(NEW) - 'status' - 'archived_at' - 'updated_at' - 'created_by' - 'reviewed_by')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'status' - 'archived_at' - 'updated_at' - 'created_by' - 'reviewed_by')
           OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by)
           OR (NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)
           OR (OLD.status = 'archived' AND NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
            RAISE EXCEPTION 'Published curriculum content is immutable; create a new version'
                USING ERRCODE = '55000';
        END IF;
    ELSIF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'review') THEN
        RAISE EXCEPTION 'A draft must enter review before publication'
            USING ERRCODE = '55000';
    ELSIF OLD.status = 'review' AND NEW.status = 'review' THEN
        IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
           (to_jsonb(OLD) - 'updated_at') THEN
            RAISE EXCEPTION 'A version under editorial review is frozen; return it to draft before editing'
                USING ERRCODE = '55000';
        END IF;
    ELSIF OLD.status = 'review' AND NEW.status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'Invalid curriculum review transition'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
        IF (to_jsonb(NEW) - 'status' - 'published_at' - 'updated_at' - 'reviewed_by')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'status' - 'published_at' - 'updated_at' - 'reviewed_by') THEN
            RAISE EXCEPTION 'Submitted curriculum metadata cannot change during publication'
                USING ERRCODE = '55000';
        END IF;

        IF NEW.reviewed_by IS NULL OR NEW.published_at IS NULL OR NOT EXISTS (
            SELECT 1
            FROM (
                SELECT reviewer_id, decision
                FROM course_version_reviews
                WHERE course_version_id = NEW.id
                ORDER BY review_order DESC
                LIMIT 1
            ) latest_review
            WHERE latest_review.reviewer_id = NEW.reviewed_by
              AND latest_review.decision = 'approved'
        ) THEN
            RAISE EXCEPTION 'Publication requires an approved review by the recorded reviewer'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END
$$;

COMMENT ON COLUMN course_version_reviews.review_order IS
    'Monotonic order of editorial decisions for this course version; used to identify the latest decision.';
