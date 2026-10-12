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

test('article JSONB document is complete and synchronized by PostgreSQL', async () => {
  const sql = await migration('004_article_jsonb_document.sql');
  for (const token of [
    'ADD COLUMN IF NOT EXISTS document jsonb',
    'CREATE OR REPLACE FUNCTION sync_article_document()',
    "'article_id', NEW.id",
    "'title', NEW.title",
    "'sub_title', NEW.subtitle",
    "'blocks', NEW.blocks",
    "'seo_description', NEW.seo_description",
    'CREATE TRIGGER articles_sync_document',
    'BEFORE INSERT OR UPDATE ON articles',
    'UPDATE articles SET updated_at = updated_at'
  ]) {
    assert.ok(sql.includes(token), `Missing article JSONB document contract: ${token}`);
  }
});
