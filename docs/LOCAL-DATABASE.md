# Mageus local PostgreSQL database

This is a bootstrap SQL file for a **new, empty PostgreSQL database**. It includes the current publishing, social, business, and identity/settings schema.

## Create a local database

```bash
createdb mageus
psql "postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/mageus" -v ON_ERROR_STOP=1 -f docs/mageus-local-postgres.sql
```

For the API, set `DATABASE_URL`, `AUTH_JWT_SECRET` (at least 32 characters), `ANALYTICS_HASH_SECRET` (at least 32 characters), and `CORS_ORIGINS` in `apps/api/.env`. Never commit real secrets.

For an existing database, use the ordered migration runner instead of this bootstrap:

```bash
cd apps/api
npm run db:migrate
```

## Identity design

- `users.username` is globally unique and is the canonical public handle.
- Password, Google, Facebook, and Dollareus identities should resolve to one Mageus user only after verified linking.
- Mageus↔Dollareus sign-in should use OAuth 2.1 / OpenID Connect authorization-code flow with PKCE and strict redirect-URI allowlists. Do not share passwords or raw access/refresh tokens between apps.
- `connected_applications` records a user-visible connection that can be revoked from settings. The OAuth client registration and one-time authorization-code tables are foundations, not a claim that the complete cross-app SSO flow is already implemented.
- External account linking must require a signed-in session plus re-authentication/verified provider callback. Never auto-link accounts solely because email strings match.
