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

test('article revision history keeps metadata relational and only blocks JSONB', async () => {
  const sql = await migration('006_revision_blocks_jsonb_only.sql');
  for (const column of ['slug text', 'title text', 'tags text[]', 'cover_image_url text', 'blocks jsonb', 'schema_version integer', 'status text', 'seo_title text', 'published_at timestamptz']) {
    assert.ok(sql.includes(column), `Missing revision field: ${column}`);
  }
  assert.ok(sql.includes('DROP COLUMN IF EXISTS snapshot'));
});

test('database guardrails constrain block JSON and index relational query paths', async () => {
  const sql = await migration('007_article_schema_guardrails.sql');
  assert.ok(sql.includes('CHECK (jsonb_typeof(blocks) = \'array\')'));
  assert.ok(sql.includes('articles_tags_gin_idx'));
  assert.ok(sql.includes('article_comments_parent_thread_idx'));
});

test('article voting uses one relational 0–100 value per user and article', async () => {
  const sql = await migration('008_article_votes.sql');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS article_votes'));
  assert.ok(sql.includes('PRIMARY KEY (article_id, user_id)'));
  assert.ok(sql.includes('CHECK (value BETWEEN 0 AND 100)'));
  assert.ok(sql.includes('updated_at timestamptz'));
});

test('social and business foundations support follows, notifications, views, stores, and location-specific menus', async () => {
  const sql = await migration('009_social_business_foundation.sql');
  for (const token of [
    'CREATE TABLE IF NOT EXISTS channel_follows',
    'PRIMARY KEY (follower_user_id, followed_channel_id)',
    'CREATE TABLE IF NOT EXISTS notifications',
    'CREATE TABLE IF NOT EXISTS content_views',
    'anonymous_visitor_hash text',
    'CREATE TABLE IF NOT EXISTS business_locations',
    'google_place_id text',
    'CREATE TABLE IF NOT EXISTS storefronts',
    'CREATE TABLE IF NOT EXISTS store_products',
    'CREATE TABLE IF NOT EXISTS store_services',
    'CREATE TABLE IF NOT EXISTS location_menus',
    'location_menus_same_channel',
    'CREATE TABLE IF NOT EXISTS location_menu_items'
  ]) assert.ok(sql.includes(token), `Missing social/business schema contract: ${token}`);
  assert.match(sql, /latitude IS NOT NULL AND longitude IS NOT NULL/);
});
