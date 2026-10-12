import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = async (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

test('publishing schema keeps public article state explicit', async () => {
  const sql = await migration('001_initial_publishing.sql');
  for (const token of ['CREATE TABLE IF NOT EXISTS users', 'CREATE TABLE IF NOT EXISTS channels', 'CREATE TABLE IF NOT EXISTS articles', "status IN ('draft', 'published', 'archival')", 'published_at']) {
    assert.ok(sql.includes(token), `Missing publishing schema contract: ${token}`);
  }
});

test('auth sessions store only refresh token hashes and support revocation', async () => {
  const sql = await migration('002_auth_sessions.sql');
  assert.ok(sql.includes('refresh_token_hash text NOT NULL UNIQUE'));
  assert.ok(sql.includes('revoked_at timestamptz'));
  assert.ok(sql.includes('expires_at timestamptz'));
});

test('article revision migration provides optimistic concurrency and history', async () => {
  const sql = await migration('003_article_revisions.sql');
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS revision integer'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS article_revisions'));
  assert.ok(sql.includes('UNIQUE (article_id, revision)'));
});

test('article blocks remain JSONB and article metadata remains relational', async () => {
  const sql = await migration('001_initial_publishing.sql');
  assert.match(sql, /blocks\s+jsonb/i);
  assert.match(sql, /title\s+text/i);
  assert.match(sql, /channel_id\s+uuid/i);
  assert.doesNotMatch(sql, /document\s+jsonb/i);
});

test('corrective migration removes the accidental whole-document JSONB column', async () => {
  const sql = await migration('005_keep_article_metadata_relational.sql');
  assert.ok(sql.includes('DROP TRIGGER IF EXISTS articles_sync_document ON articles'));
  assert.ok(sql.includes('DROP FUNCTION IF EXISTS sync_article_document()'));
  assert.ok(sql.includes('DROP COLUMN IF EXISTS document'));
  assert.ok(sql.includes('blocks'));
});

test('revision history keeps metadata relational and only revision blocks JSONB', async () => {
  const sql = await migration('006_revision_blocks_jsonb_only.sql');
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS title text'));
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS blocks jsonb'));
  assert.ok(sql.includes('DROP COLUMN IF EXISTS snapshot'));
});


test('article schema guardrails keep blocks as arrays and index relational queries', async () => {
  const sql = await migration('007_article_schema_guardrails.sql');
  assert.ok(sql.includes('articles_blocks_must_be_array'));
  assert.ok(sql.includes('article_revisions_blocks_must_be_array'));
  assert.ok(sql.includes('article_revisions_schema_version_positive'));
  assert.ok(sql.includes('articles_tags_gin_idx'));
  assert.ok(sql.includes('article_comments_parent_thread_idx'));
});
