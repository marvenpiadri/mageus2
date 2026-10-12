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
  assert.doesNotMatch(routes, /\/likes/);
  assert.match(routes, /put\('\/articles\/:articleId\/votes', engagementWriteLimit, requireVerifiedIdentity/);
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


test('account settings APIs are authenticated and validate sensitive account changes', async () => {
  const routes = await source('../src/modules/account/account.routes.js');
  assert.match(routes, /accountRoutes\.use\(requireDatabase, requireVerifiedIdentity\)/);
  assert.match(routes, /patch\('\/profile'/);
  assert.match(routes, /put\('\/settings'/);
  assert.match(routes, /post\('\/password'/);
  assert.match(routes, /verifyPassword\(rows\[0\]\.password_hash, parsed\.data\.currentPassword\)/);
  assert.match(routes, /UPDATE auth_sessions SET revoked_at = now\(\)/);
  assert.match(routes, /delete\('\/connections\/:application'/);
});


test('business location management is authenticated and scoped to the caller-owned channel', async () => {
  const routes = await source('../src/modules/social/social.routes.js');
  assert.match(routes, /get\('\/me\/business\/locations', requireVerifiedIdentity/);
  assert.match(routes, /post\('\/me\/business\/locations', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /patch\('\/me\/business\/locations\/:locationId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /delete\('\/me\/business\/locations\/:locationId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /c\.owner_user_id = \$2/);
  assert.match(routes, /LOCATION_HAS_MENUS/);
});


test('storefront management requires identity and validates locations against the owner channel', async () => {
  const routes = await source('../src/modules/social/social.routes.js');
  assert.match(routes, /get\('\/me\/business\/storefronts', requireVerifiedIdentity/);
  assert.match(routes, /post\('\/me\/business\/storefronts', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /patch\('\/me\/business\/storefronts\/:storefrontId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /INVALID_LOCATION/);
  assert.match(routes, /fulfillment_type/);
  assert.match(routes, /status = COALESCE\(\$9, status\)/);
});


test('catalog product and service writes are scoped through the owning storefront channel', async () => {
  const routes = await source('../src/modules/social/social.routes.js');
  assert.match(routes, /get\('\/me\/business\/storefronts\/:storefrontId\/catalog', requireVerifiedIdentity/);
  assert.match(routes, /post\('\/me\/business\/storefronts\/:storefrontId\/products', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /patch\('\/me\/business\/products\/:productId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /post\('\/me\/business\/storefronts\/:storefrontId\/services', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /patch\('\/me\/business\/services\/:serviceId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /c\.owner_user_id = \$2/);
  assert.match(routes, /Image URLs must use HTTPS/);
});


test('business menu CRUD is authenticated and validates location ownership', async () => {
  const routes = await source('../src/modules/social/social.routes.js');
  assert.match(routes, /get\('\/me\/business\/menus', requireVerifiedIdentity/);
  assert.match(routes, /post\('\/me\/business\/menus', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /patch\('\/me\/business\/menus\/:menuId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /delete\('\/me\/business\/menus\/:menuId', socialWriteLimit, requireVerifiedIdentity/);
  assert.match(routes, /Choose one of your own locations/);
  assert.match(routes, /location_menu_items/);
});
