# Neon setup for Mageus 2

Mageus 2 owns its own Neon database. It does not share a database with Dollareus. Dollareus product references are resolved through an API adapter when that contract is stable.

## Create the Neon database

1. Create a Neon project in the region closest to the application runtime.
2. Create a separate development branch for local work and a staging branch for pre-production migration tests.
3. Copy the **pooled** connection string for the API runtime. Keep the direct connection string available for operations that require it.
4. Store the connection string only in the server environment as `DATABASE_URL`; never add it to Angular environment files or browser code.
5. Set `AUTH_JWT_SECRET` to a generated random secret of at least 32 characters. Example generation command: `openssl rand -base64 48`. The example value in `.env.example` is not safe to use.
6. Set `CORS_ORIGINS` to the exact frontend origin(s), comma-separated. In production use HTTPS.
7. Set `AUTH_ISSUER` to the stable issuer identifier for the deployment and keep `AUTH_AUDIENCE=mageus`.

## Apply schema migrations

From `apps/api`, first create a local `.env` file from `.env.example` and set `DATABASE_URL` to the Neon connection string. The `.env` file is ignored by Git and must remain server-side.

```sh
npm install
npm run db:check
npm run db:migrate
npm test
```

`db:check` makes a read-only connection and prints the database name, role, PostgreSQL version, and read-only status. It deliberately never prints the connection string or password. A successful check proves connectivity only; `db:migrate` and the migration tests are still required to establish the schema.

Migrations run in lexical order and are recorded in `schema_migrations`:
- `001_initial_publishing.sql`: users, channels, articles, public metadata, blocks, likes, comments, and media metadata.
- `002_auth_sessions.sql`: hashed refresh-session records with expiry and revocation.
- `003_article_revisions.sql`: draft revision counters, article history snapshots, and public-slug uniqueness that permits a draft to coexist with its published version.
- `004_article_jsonb_document.sql` is superseded by corrective migration `005_keep_article_metadata_relational.sql`, which removes the mistakenly introduced whole-article JSONB column and trigger. Migration `006_revision_blocks_jsonb_only.sql` keeps revision metadata relational and stores only Studio blocks as JSONB. Migration `007_article_schema_guardrails.sql` checks that block payloads remain JSON arrays and adds indexes for common ownership, tag, comment-thread, revision, and media queries. Article metadata and relationships remain relational.

Run these against a disposable Neon branch first. Do not manually edit an applied migration; add a new numbered migration instead. Take a backup or verify Neon restore capability before production changes.

## Runtime contract

- API: `npm run dev` (default port 3333).
- Angular dev server: `npm start`; `proxy.conf.json` forwards `/api` requests to port 3333.
- SSR: set `MAGEUS_API_URL` to the API base ending in `/api/v1` if the SSR process cannot reach the API through same-origin routing.
- `GET /health` checks process liveness; `GET /ready` checks the database connection.
- Public article endpoints return published content only and require no login.
- Draft endpoints, publishing, likes, and comment creation verify a short-lived bearer JWT and enforce resource ownership. Refresh credentials are opaque random values in HttpOnly cookies and only their SHA-256 hashes are stored in Neon.
- The Angular client keeps access tokens in memory; it does not write them to localStorage. The local article draft is a separate recovery copy and may contain unpublished text, so do not use a shared/public browser profile for sensitive drafts.

## Before production

- Configure TLS, a trusted reverse proxy, exact CORS origins, secret rotation, backups, alerting, and rate-limit storage appropriate for multiple API instances.
- Add email verification, password reset, account recovery, anti-bot protection, moderation workflows, and session management UI.
- Validate migrations on a fresh database and an upgrade database.
- Run API integration tests against a disposable Neon branch, including registration/login/refresh/logout, owner-only draft reads and writes, revision conflicts, publish validation, public reads while signed out, and comment/like authorization.
- Verify SSR HTML, canonical URLs, Article JSON-LD, sitemap generation, and actual crawler behavior after deployment.

No Neon project or credentials are provisioned by this repository change. The API is configured to connect once you supply its server-side environment variables.
