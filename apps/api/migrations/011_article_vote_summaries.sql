-- Persist rating aggregates so public article reads do not scan every vote.
-- Triggers update the summary in the same transaction as each vote write.
CREATE TABLE IF NOT EXISTS article_vote_summaries (
  article_id uuid PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  total_score bigint NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  vote_count bigint NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_vote_summary_count_score_consistent
    CHECK ((vote_count = 0 AND total_score = 0) OR (vote_count > 0 AND total_score <= vote_count * 100))
);

INSERT INTO article_vote_summaries (article_id, total_score, vote_count)
SELECT article_id, SUM(value)::bigint, COUNT(*)::bigint
  FROM article_votes
 GROUP BY article_id
ON CONFLICT (article_id) DO UPDATE
  SET total_score = EXCLUDED.total_score,
      vote_count = EXCLUDED.vote_count,
      updated_at = now();

CREATE OR REPLACE FUNCTION maintain_article_vote_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO article_vote_summaries (article_id, total_score, vote_count)
    VALUES (NEW.article_id, NEW.value, 1)
    ON CONFLICT (article_id) DO UPDATE
      SET total_score = article_vote_summaries.total_score + EXCLUDED.total_score,
          vote_count = article_vote_summaries.vote_count + 1,
          updated_at = now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE article_vote_summaries
       SET total_score = total_score - OLD.value,
           vote_count = vote_count - 1,
           updated_at = now()
     WHERE article_id = OLD.article_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.article_id = OLD.article_id THEN
      UPDATE article_vote_summaries
         SET total_score = total_score - OLD.value + NEW.value,
             updated_at = now()
       WHERE article_id = NEW.article_id;
    ELSE
      UPDATE article_vote_summaries
         SET total_score = total_score - OLD.value,
             vote_count = vote_count - 1,
             updated_at = now()
       WHERE article_id = OLD.article_id;
      INSERT INTO article_vote_summaries (article_id, total_score, vote_count)
      VALUES (NEW.article_id, NEW.value, 1)
      ON CONFLICT (article_id) DO UPDATE
        SET total_score = article_vote_summaries.total_score + EXCLUDED.total_score,
            vote_count = article_vote_summaries.vote_count + 1,
            updated_at = now();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS article_votes_maintain_summary ON article_votes;
CREATE TRIGGER article_votes_maintain_summary
AFTER INSERT OR UPDATE OR DELETE ON article_votes
FOR EACH ROW EXECUTE FUNCTION maintain_article_vote_summary();
