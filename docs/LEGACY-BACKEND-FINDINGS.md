# Legacy backend and UI reference findings

Audited on 2026-10-12 from the current `mageus` and `mageus-ui-test` main branches. This is a code inspection, not a production penetration test or a live-database audit.

## Legacy API: concrete findings

- The API is a single Express entry point of roughly 75 KB that starts Socket.IO, opens a local PostgreSQL connection, exposes a local photo directory, and mixes account, publishing, social, settings, notifications, magazine, and upload logic.
- The JWT signing secret and local PostgreSQL credentials are committed in source. Treat both as compromised. Rotate database credentials and invalidate old tokens before any deployment. Do not copy these values into Mageus 2.
- The account creation flow hashes passwords, but `/user/setPassword` writes the supplied password into a `password_s` column in plaintext and returns the generated password hash in its response. Do not reuse this flow or migrate `password_s` as an authentication source. Review the database for plaintext credential exposure and plan a forced reset where necessary.
- Tokens live for 300 days or 8,000 days depending on the endpoint. There is no practical revocation model in the observed flow. The new identity system must not accept these tokens.
- Multiple handlers call `jwt.verify` but do not consistently stop execution on verification failure before reading `decoded.userID`. Some routes accept a user ID in the request body as well as a token-derived identity. Every write must derive the actor from a verified server-side identity and independently authorize the target resource.
- CORS is permissive, request bodies allow extreme sizes, and upload filename selection trusts MIME labels without a complete content/size policy. The new API uses explicit origins, small JSON limits, Helmet, validated inputs, and separate media-upload controls.
- Local static photo serving and uploads are coupled to the server filesystem. Use a media-storage adapter and private upload flow; validate file signatures, size, dimensions, ownership, and transformations before making assets public.
- The current frontend service seeds articles/magazines/profiles in memory and localStorage. Several API methods fall back to fabricated local results when HTTP requests fail; the delete path can report success even on request failure. Treat those as prototype fallbacks, not evidence that data was persisted to PostgreSQL.
- Legacy article DTOs duplicate content in `parts` and `article`, and individual blocks use a large optional-property interface. The migration boundary must normalize old `ArticlePart` objects into a versioned block document and keep a rollback/export path.

## UI test: article studio findings

Reference files inspected:
- `src/app/components/articles/create-article.ts` (~95 KB / ~1,900 lines)
- `src/app/components/articles/block-editor-modal.ts`
- `src/app/components/articles/article-block-renderer.ts`
- `src/app/core/models/article.model.ts`
- `src/app/core/services/gimiapp.service.ts`

The UI-test creator already has useful product behavior worth preserving: a block catalogue, ordered `parts`, insert-at-index and append operations, draft recovery in localStorage, save/publish actions, media and visual blocks, data visualisation, product IDs, product collections, and magazine references. Its separate block editor and block renderer are useful references.

The creator itself is too large to become the canonical architecture unchanged. The new implementation should separate document state, block definitions, per-type editors, reader renderers, validation, media selection, commerce resolution, and persistence. The existing editor's data shape should be imported through a versioned adapter, not made the permanent schema.

## SEO and access boundary

- `GET` published article and public channel endpoints must not require login.
- SSR should render the article body and metadata into the initial HTML, with canonical URL, title/description, Open Graph, Article JSON-LD, and sitemap support.
- Drafts, revision history, editing, publishing, media management, and channel administration require identity plus ownership checks.
- Likes and comment creation require identity. Public comment reading may be public, subject to moderation and spam rules.
- Client-side route guards are not authorization. All protected writes must be enforced in the API.
- Public article DTOs must omit author email, private settings, moderation state, internal storage keys, and any draft content.

## Neon database plan

The initial schema in `apps/api/migrations/001_initial_publishing.sql` defines users, channels, articles, likes, comments, and media assets. The first article queries return only `status = 'published'` records with `published_at` set. Migrations are explicit SQL and recorded in `schema_migrations`.

This is a starting schema, not a claim that the existing PostgreSQL database has been migrated. Before production:
1. Inspect and map the complete old schema, constraints, triggers, indexes, ID formats, and foreign keys.
2. Create a separate Neon development branch and validate the schema/migrations there.
3. Build a one-time import/normalization job for users, channels, articles, block payloads, magazines, and media metadata.
4. Add uniqueness/conflict handling, migration checksums, backups and restore drills.
5. Implement the new auth/session issuer and ownership policy before enabling writes.
6. Connect Angular services only after DTOs and error contracts are stable.

## Not yet verified

No Neon project has been provisioned or connected in this change. No credentials were supplied, no live database connection was attempted, and no data import or production cutover was performed. The API is a scaffold ready for a Neon URL, not a claim of a deployed or populated backend.
