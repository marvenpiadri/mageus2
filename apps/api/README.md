# Mageus API

Independent Node.js API for Mageus 2. The first vertical is public publishing. The API uses Neon PostgreSQL through the server-side Neon driver; the Angular app must never receive the database connection string.

## Local setup

1. Copy `.env.example` to `.env` and set a Neon pooled `DATABASE_URL`.
2. Install dependencies from this folder with `npm install`.
3. Run `npm run db:migrate`.
4. Run `npm run dev`.

Without `DATABASE_URL`, health checks still work and database-backed routes fail with an explicit 503 instead of silently using demo data.

## Public article contract

- `GET /api/v1/articles?limit=20&cursor=<ISO timestamp>`
- `GET /api/v1/articles/:username/:slug`

Only published articles with a publication timestamp are returned. Drafts, archival content, author-only editing data, and private account fields are never returned from public article queries. These endpoints do not require login. They send public cache headers to support fast pages and crawlers; Angular SSR should render article content into the initial HTML and emit canonical, title, description, Open Graph and JSON-LD metadata from the returned public DTO.

## Identity and engagement

Likes and comment creation are deliberately fail-closed until Mageus's new identity/session issuer is implemented. Do not revive the legacy hard-coded JWT secret, accept client-supplied user IDs, or store plaintext passwords. The authentication design should use short-lived credentials, rotation/revocation, secure HttpOnly cookies where same-site deployment permits, CSRF protection for cookie-authenticated writes, rate limits, and authorization checks against resource ownership.

## Migrations and deployment

SQL files in `migrations/` are ordered, versioned, and recorded in `schema_migrations`. Test migrations against a separate Neon development branch first, then staging, and only then production. Use Neon pooled URLs for runtime traffic and a direct connection when a migration operation specifically requires it. Never commit `.env`, database URLs, JWT keys, OAuth secrets, or storage credentials.
