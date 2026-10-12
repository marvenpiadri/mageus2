# Mageus implementation roadmap

This roadmap describes the **first release**, while preserving the later media and publishing direction. The first release is an article-first social network; it does not require a video-hosting or transcoding bill.

## Phase 1 — Core publishing and public reading
**Status: substantially implemented; continue verification**

- Public SEO-friendly article pages and channel profiles.
- Flat, independently reorderable article blocks with unique per-instance IDs.
- Local draft recovery, server draft sync, revision history, publishing validation.
- Public article metadata, canonical URL, Open Graph fields, and Article JSON-LD.
- Article reader constrained to a 600px maximum reading width.
- Optional step presentation on ordinary text blocks; consecutive steps are numbered by their position.
- Article views, 0–100 ratings, and comments are backed by API/database tables.

## Phase 2 — Social network basics
**Status: implemented; needs end-to-end verification**

- Unique usernames, public profiles, follow/unfollow, personalized feed, notifications.
- Public article reading without login; authenticated actions require an account.
- Anonymous view analytics use a server-secret HMAC rather than storing raw IP addresses.
- Private profile visibility is checked by the public profile API; published articles remain independently public.

## Phase 3 — Article commerce references and account settings
**Status: foundation and first UI/API slice implemented**

- A commerce slider block can reference ordered IDs for published products, services, or location-specific menu items.
- The public article API resolves those IDs into published items; the reader renders a plain horizontal, draggable/swipeable strip with no carousel effects.
- Profile settings support username, display name, bio, avatar URL, theme, language, timezone, privacy, and notification preferences.
- Password change revokes refresh sessions.
- Shop/menu management forms and an in-editor item picker are still required; the first block editor currently accepts item IDs.

## Phase 4 — Authentication providers and cross-app identity
**Status: partially implemented**

- Email/username + password authentication, hashed passwords, rotating refresh sessions, and session revocation exist.
- Google and Facebook OAuth authorization-code callbacks are implemented and can be enabled using environment credentials. Live provider sign-in still needs configured callback URLs and manual verification.
- SQL foundations exist for external identities, registered OAuth clients, PKCE authorization codes, and revocable Mageus↔Dollareus connection records.
- **Not finished:** account-linking flows for existing accounts, email verification/recovery, Mageus acting as an OpenID Connect provider, Dollareus consuming Mageus identity, and the reverse Dollareus-to-Mageus SSO connection. Do not treat cross-app SSO as live yet.

## Phase 5 — Business ownership and management
**Status: partial**

- Public data model/API supports business locations, storefronts, products, services, and menus tied to a specific location.
- Remaining work: client-friendly authenticated create/edit/archive forms and complete ownership/authorization checks for business CRUD, plus the editor item picker.

## Phase 6 — Production readiness
**Status: in progress**

- CI runs frontend production build and API syntax/schema tests.
- Local PostgreSQL bootstrap schema is provided at `docs/mageus-local-postgres.sql`; ordered migrations remain the path for an existing database.
- Remaining work: verify the latest CI on the newest commit, apply migrations to a local database, test registration/login/OAuth/CRUD against PostgreSQL, and resolve any integration failures before deployment.

## Later, not required for version one

- Magazines already exist in the earlier Mageus product direction. Expand them later so they can group future posts/media and attach articles to posts or episodes.
- Long-form videos and short videos/Reels are future content formats. Do not reintroduce a temporary Posts type merely to imitate Reels.
- Video storage, processing, and delivery services can be chosen when usage and budget justify them.
