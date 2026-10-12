-- Retire binary article-like notifications now that article reactions are exclusively 0–100 votes.
-- Preserve existing inbox entries by converting old like notifications into generic system history.
UPDATE notifications SET type = 'system'
 WHERE type = 'like';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'comment', 'vote', 'mention', 'publication', 'system'));
