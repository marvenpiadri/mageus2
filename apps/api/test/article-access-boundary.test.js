import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('public article read routes remain independent from authentication middleware', async () => {
  const routes = await source('../src/modules/articles/article.routes.js');
  assert.doesNotMatch(routes, /requireVerifiedIdentity/);
  const repository = await source('../src/modules/articles/article.repository.js');
  assert.match(repository, /status = 'published'/);
  assert.match(repository, /published_at/);
});

test('authoring operations require identity, channel ownership, and revision checks', async () => {
  const routes = await source('../src/modules/articles/article-authoring.routes.js');
  assert.match(routes, /requireVerifiedIdentity/);
  assert.match(routes, /owner_user_id/);
  assert.match(routes, /expectedRevision/);
  assert.match(routes, /articleId\/fork/);
  assert.match(routes, /articleId\/publish/);
});

test('public comment reading is distinct from authenticated comment creation', async () => {
  const routes = await source('../src/modules/engagement/engagement.routes.js');
  assert.match(routes, /get\('\/articles\/:articleId\/comments'/);
  assert.match(routes, /post\('\/articles\/:articleId\/comments', engagementWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /post\('\/articles\/:articleId\/likes', engagementWriteLimit, requireVerifiedIdentity/);
});
