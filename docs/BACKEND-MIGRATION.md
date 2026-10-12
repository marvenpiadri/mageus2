# Legacy Mageus backend migration notes

Reference: [`mageus-backend/demistars.js`](https://github.com/marvenpiadri/mageus/blob/main/mageus-backend/demistars.js) and [backend package manifest](https://github.com/marvenpiadri/mageus/blob/main/mageus-backend/package.json).

This is an inventory and risk register, not a claim that the old backend is ready to reuse. The legacy server should remain unchanged while Mageus 2 receives explicit API contracts.

## Current shape observed

The legacy entry point is a roughly 75 KB Express file that starts an HTTP server and Socket.IO, connects directly to PostgreSQL, serves local photo files, and includes upload/image processing. Its dependency list combines multiple generations of database, GraphQL, cloud-storage, messaging, OCR, and image-processing packages. The route layer is largely POST-based and the application logic is concentrated in the entry point.

## Endpoint groups found

- **Account and session:** `/username/check`, `/email/check`, `/create/account`, `/token/loguser`, `/social/signup`, `/user/setPassword`, `/user/exists`
- **Articles and feeds:** `/articles`, `/articles/more`, `/posts/feeds`, `/posts/feeds/more`, `/articles/:articleID`, `/article/get`, `/article/read`, `/article/read`-adjacent edit/delete endpoints, `/user/articles`, `/user/articles/scroll`
- **Article editing and lifecycle:** `/edit/post/get`, `/article/edit/get`, `/article/edit`, `/article/delete`, `/delete/article`
- **Reactions and discussion:** `/article/vote`, `/send/comment`, `/article/comments`, `/article/comments/scroll`, `/send/comment/reply`, `/comment/replies/getmore`, `/post/delete/comment`, `/send/comment/edit`, `/send/comment/rate`
- **Profiles and social graph:** `/profile/cover`, `/profile/header`, `/profile/unfollow`, `/profile/follow`, `/users/search`
- **Notifications:** `/user/getNotifs`, `/notif/view`, `/notifs/count`, `/notifs/followers`, `/read/notifs`
- **Account and appearance settings:** `/settings/change_fullname`, `/username/change`, `/settings/emailChange`, `/settings/passwordChange`, `/settings/wallpapers`, `/settings/deleteWallpaper`, `/settings/info`, `/settings/change_gander`, `/settings/change_date`
- **Magazines:** `/magazines/lobby`, `/magazines/lobby/more`, `/magazines/mine`, `/magazines/mine/more`, `/magazine/articles/scroll`, `/add/magazine`, `/magazines/exists`, `/magazine/intro`, `/magazine/articles`
- **Utility:** `/api/ipinfo`

This list is a route inventory only. Before replacing any endpoint, capture its request shape, response shape, authorization rules, database tables, upload behavior, pagination semantics, and side effects.

## Security and reliability work required before reuse

1. **Rotate exposed credentials.** The legacy entry point contains a hard-coded JWT signing secret and hard-coded local PostgreSQL connection credentials. Treat committed credentials as compromised: rotate them outside Git, remove secrets from code/history where practical, and move all runtime configuration to environment/secret management.
2. **Audit authorization per route.** Confirm ownership checks for article edit/delete, comments, profile settings, follows, magazine management, and uploads. A valid token must not imply permission to act on every user or resource.
3. **Audit SQL construction.** Direct PostgreSQL access and `pg-format` usage require a query-by-query review. Use parameterized queries for values and strict allowlists for dynamic identifiers/sort clauses.
4. **Replace permissive/oversized request configuration.** The legacy server uses permissive CORS and extremely large JSON/urlencoded body limits. Establish explicit allowed origins, per-route size limits, upload limits, MIME/content validation, timeouts, and rate limits.
5. **Harden media handling.** Review local static file exposure, path handling, upload authorization, image decompression/resource exhaustion, file cleanup, and the current S3/local-storage assumptions.
6. **Separate responsibilities.** Move route handlers, validation schemas, authentication/authorization, services, repositories, media processing, notifications, and realtime events into explicit modules.
7. **Rationalize dependencies.** Confirm each dependency is used, replace obsolete packages deliberately, and avoid adding a second database or ORM layer without a clear reason.
8. **Preserve behavior through contracts.** Capture response DTOs and compatibility adapters before migrating stored article payloads. Old `parts`/ `article` shapes and legacy IDs must be normalized at a defined boundary.

## Target direction

- Keep the Angular SSR application and the API independently deployable.
- Build typed, documented API DTOs and explicit error shapes before frontend services depend on them.
- Use configuration validation at server startup and fail closed when required secrets/configuration are missing.
- Keep articles, article blocks, channels/profiles, magazines, media, and Mageus shops as explicit domain areas.
- Keep commerce integrations out of the legacy-backend rewrite until Mageus's own publishing/domain model is stable. Do not share an application database with Dollareus.

## Not yet verified

No live legacy database schema, production credentials, upload storage, deployed API behavior, or backup/restore process has been validated as part of this repository scaffold. These need a separate controlled audit before any data migration or production cutover.
