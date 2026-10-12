# Mageus API

Independent Node.js API for Mageus 2. The first vertical is public publishing. The API uses Neon PostgreSQL through the server-side Neon driver; the Angular app must never receive the database connection string.

## Local setup

1. Copy `.env.example` to `.env` and set a Neon pooled `DATABASE_URL`.
2. Install dependencies from this folder with `npm install`.
3. Run `npm run db:migrate`.
4. Run `npm run dev`.

Without `DATABASE_URL`, health checks still work and database-backed routes fail with an explicit 503 instead of silently using demo data.

## Public article contract

- `GET /api/v1/articles?limit=20&cursor=<opaque cursor>`
- `GET /api/v1/articles/:username/:slug`

Only published articles with a publication timestamp are returned. Drafts, archival content, author-only editing data, and private account fields are never returned from public article queries. These endpoints do not require login. They send public cache headers to support fast pages and crawlers; Angular SSR should render article content into the initial HTML and emit canonical, title, description, Open Graph and JSON-LD metadata from the returned public DTO.

## Article authoring\n\n- `GET /api/v1/articles/mine` lists the signed-in user's articles, including drafts.\n- `POST /api/v1/articles` creates a private draft.\n- `PATCH /api/v1/articles/:articleId` updates only an article owned by the signed-in user.\n- `POST /api/v1/articles/:articleId/publish` validates required content before making it public.\n- `DELETE /api/v1/articles/:articleId` archives the owned article, which removes it from public reads.\n\nAll writes verify the bearer access token and ownership on the server. Block payloads are validated against a discriminated schema and bounded arrays/text sizes. Product and magazine references are currently stored as typed IDs; live resource pickers and reference resolution are separate follow-up work.\n\n## Identity and engagement

Likes and comment creation are deliberately fail-closed until Mageus's new identity/session issuer is implemented. Do not revive the legacy hard-coded JWT secret, accept client-supplied user IDs, or store plaintext passwords. The authentication design should use short-lived credentials, rotation/revocation, secure HttpOnly cookies where same-site deployment permits, CSRF protection for cookie-authenticated writes, rate limits, and authorization checks against resource ownership.

## Migrations and deployment

SQL files in `migrations/` are ordered, versioned, and recorded in `schema_migrations`. Test migrations against a separate Neon development branch first, then staging, and only then production. Use Neon pooled URLs for runtime traffic and a direct connection when a migration operation specifically requires it. Never commit `.env`, database URLs, JWT keys, OAuth secrets, or storage credentials.

## Magazines and issues

Magazines are persistent channel-owned publications. Issues are numbered editions that reference the channel's existing published articles in a saved reading order; articles are not copied into a second content store.

Public routes:
- `GET /api/v1/magazines?limit=24&cursor=<opaque cursor>` lists published magazines.
- `GET /api/v1/magazines/:username/:magazineSlug` returns a public magazine and its published issues.
- `GET /api/v1/magazines/:username/:magazineSlug/issues/:issueSlug` returns one published issue and its ordered articles.
- `GET /api/v1/social/profiles/:username` includes the channel's published magazines.

Authenticated authoring routes:
- `POST /api/v1/magazines` creates a draft magazine owned by the current channel.
- `PATCH /api/v1/magazines/:magazineId/publish` publishes that magazine.
- `POST /api/v1/magazines/:magazineId/issues` creates a draft issue with a positive issue number.
- `PUT /api/v1/magazines/:magazineId/issues/:issueId/articles` saves up to 100 unique published articles from the same channel, in the submitted order.
- `PATCH /api/v1/magazines/:magazineId/issues/:issueId/publish` publishes an issue after its parent magazine is public and at least one article has been selected.

Public magazine and issue pages emit canonical URLs, Open Graph metadata, and JSON-LD. The `012_magazines_and_issues.sql` migration creates the relational publication, edition, and ordered-article tables. CI applies every migration to a clean PostgreSQL 16 database; the target Neon database still requires the normal staged migration procedure before release.
