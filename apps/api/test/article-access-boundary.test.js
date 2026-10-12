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


test('public article view tracking uses privacy-preserving identifiers and repeat-view deduplication', async () => {
  const routes = await source('../src/modules/engagement/engagement.routes.js');
  assert.match(routes, /post\('\/articles\/:articleId\/views', async \(req, res, next\) => \{/);
  assert.match(routes, /createHmac\('sha256', hashSecret\)\.update\(ip\)\.digest\('hex'\)/);
  assert.match(routes, /viewer_user_id, anonymous_visitor_hash, referrer_host/);
  assert.match(routes, /interval '30 minutes'/);
  assert.doesNotMatch(routes, /anonymous_visitor_hash,\s*req\.ip/);
});


test('profile editing requires identity and scopes changes to the authenticated channel owner', async () => {
  const routes = await source('../src/modules/social/social.routes.js');
  assert.match(routes, /patch\('\/me\/profile', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /WHERE owner_user_id = \$1/);
  assert.match(routes, /WHERE id = \$1 AND owner_user_id = \$5/);
  assert.match(routes, /await client\.query\('BEGIN'\)/);
  assert.match(routes, /await client\.query\('COMMIT'\)/);
});
