# Legacy Mageus API route map

This inventory was generated from `mageus/mageus-backend/demistars.js` on 2026-10-12. It found 61 literal route registrations: 59 POST handlers, one GET handler, and one mounted router. This is a source inventory, not a claim that each route is currently healthy or reachable in production.

## What the old entry point does

The single file mixes HTTP endpoints, JWT/password handling, PostgreSQL queries, Socket.IO initialization, IP geolocation, user-agent parsing, uploads, local photo serving, notifications, profile/social behavior, articles, comments, magazines, and account settings. Several distinct concepts are represented as POST-only APIs, including reads. There are duplicate registrations for `/article/get`, no dedicated PUT/PATCH/DELETE REST shape for most resources, and a local file directory is exposed by the API process.

## Legacy route groups

### Identity and account

- `POST /username/check`, `POST /email/check`, `POST /user/exists`
- `POST /create/account`, `POST /token/loguser`, `POST /social/signup`
- `POST /user/setPassword`
- `POST /settings/change_fullname`, `POST /username/change`, `POST /settings/emailChange`, `POST /settings/passwordChange`
- `POST /settings/change_gander`, `POST /settings/change_date`, `POST /settings/info`

The replacement should normalize accounts around a single identity/session issuer, Argon2id password hashes, short-lived access tokens, opaque rotating refresh sessions, account recovery, and server-side authorization. Do not accept legacy JWTs or plaintext password columns as authentication sources.

### Articles, feeds, and authoring

- `POST /articles`, `POST /articles/more`
- `POST /posts/feeds`, `POST /posts/feeds/more`
- `POST /articles/:articleID`, `POST /edit/post/get`
- `POST /user/articles`, `POST /user/articles/scroll`
- `POST /article/get` (registered twice), `POST /article/read`
- `POST /article/edit/get`, `POST /article/edit`
- `POST /article/delete`, `POST /delete/article`

The new target is split by responsibility: public article retrieval by channel username and slug; authenticated authoring routes for draft creation, revision-checked saves, forking, publishing, and archival; a versioned block-document schema; and public SSR output containing canonical, Open Graph, and Article structured data. Drafts and edits must never leak through public read queries.

### Engagement and moderation

- `POST /article/vote`
- `POST /send/comment`, `POST /article/comments`, `POST /article/comments/scroll`
- `POST /send/comment/reply`, `POST /comment/replies/getmore`
- `POST /post/delete/comment`, `POST /send/comment/edit`, `POST /send/comment/rate`

The new boundary is: public reading and public visible-comment retrieval may be unauthenticated; like/unlike and comment creation require a verified identity; moderation and editing require explicit authorization. A client-supplied user ID is never proof of identity.

### Profiles, channels, search, and following

- `POST /profile/cover`, `POST /profile/header`
- `POST /profile/follow`, `POST /profile/unfollow`
- `POST /users/search`

Mageus 2 should use **channels** as the public identity/publishing surface rather than restoring the old publication concept. Profile media and following should become dedicated modules with ownership checks and stable public DTOs.

### Notifications

- `POST /user/getNotifs`, `POST /notif/view`, `POST /notifs/count`, `POST /notifs/followers`, `POST /read/notifs`

Notifications should be a separate domain module with explicit recipient identity, pagination, read state, and idempotent event creation. Realtime delivery should be added only after the underlying event and authorization model is reliable.

### Magazines

- `POST /magazines/lobby`, `POST /magazines/lobby/more`
- `POST /magazines/mine`, `POST /magazines/mine/more`
- `POST /magazine/articles/scroll`, `POST /add/magazine`
- `POST /magazines/exists`, `POST /magazine/intro`, `POST /magazine/articles`

Magazines and issues need their own schemas, visibility rules, membership/ownership rules, and article-reference contracts. Article blocks should reference a magazine ID through an adapter, not embed arbitrary magazine records in the document.

### Settings, wallpaper, and IP utilities

- `POST /settings/wallpapers`, `POST /settings/deleteWallpaper`
- `GET /api/ipinfo`

Wallpaper/mood preferences belong to a settings API and should be stored as user/channel preferences. IP information should be based on the actual request and a deliberate privacy policy; the old handler's hard-coded fallback IP must not be carried over.

## Refactor order

1. Identity/session and channel ownership.
2. Public publishing read model and revision-safe article authoring.
3. Media storage adapter with signature, size, dimension, and ownership checks.
4. Comments, likes, moderation, notifications.
5. Magazines and references from article blocks.
6. Profile/channel settings, wallpapers, and search.
7. Realtime delivery only after the REST contracts and event authorization are stable.

## Security actions

The legacy source contained a committed JWT signing secret and local PostgreSQL credentials. They are intentionally not reproduced here. Treat both as compromised, rotate them, and invalidate tokens signed with the old secret before any deployment. The old password-setting route also exposed plaintext-password behavior; do not migrate plaintext credential columns into the new auth system.
