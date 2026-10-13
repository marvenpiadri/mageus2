# Mageus development phases

Updated: 2026-10-13

This plan tracks delivery for `mageus2`. The original `mageus` repository remains the source of established product behavior and visual identity; `mageus-ui-test` remains a reference for improved authoring, block, and mood concepts. Neither reference repository should be destructively rewritten.

## Product constraints

- Angular 22 with SSR and hydration; use standalone features and strict TypeScript.
- Keep the custom CSS design system. Do not add Tailwind, PrimeNG, Quill, or `ngx-quill`.
- Preserve the Mageus wallpaper, translucent glass reading surface, and first-class reading Moods.
- Articles are the only standalone publishing format in the first release. Social interactions and magazines are not alternate post types.
- Keep article metadata and relationships relational in PostgreSQL. Only ordered article blocks belong in JSONB.
- Public published articles must be readable without signing in; authentication is required for account-bound interactions such as saving a vote or creating a comment.
- Keep Mageus independent of Dollareus at the database and application layer. Define narrow API integration contracts only after Mageus's own domain is stable.
- Do not make the first release depend on video hosting or processing.

## Phase 1 — Stabilize the foundation (active)

Scope:
- Review Angular SSR and hydration behavior, authentication restoration, and critical public routes.
- Persist reading mood preferences with server-safe defaults and browser-storage failure handling.
- Verify production build, API checks, migrations on clean PostgreSQL, and key article/authentication journeys.
- Identify blockers with reproducible evidence instead of repeated speculative test loops.

Acceptance:
- Production Angular build and API checks pass.
- SSR does not access browser globals during server rendering.
- User mood preferences survive reload when browser storage is available; the app remains usable if storage is blocked.
- Public article routes remain accessible without authentication.
- CI results and live-environment verification are clearly distinguished.

## Phase 2 — Article studio and reader

Scope:
- Complete block registry/editor workflows, media selection, block-specific controls, validation, ordering, duplicate/delete, local recovery, server draft sync, preview, and publishing.
- Preserve a flat ordered block list. Tutorial steps are a presentation on ordinary text blocks; numbering derives from order.
- Improve the reader's scrolling experience and return-to-list behavior without destroying the reader's position in discovery.
- Verify mood, wallpaper/glass independence, reading progress, responsive behavior, and SEO metadata/structured data.

Acceptance:
- An author can create, edit, save, preview, publish, and reopen an article without editing JSON.
- A public reader can open a published article without signing in, scroll naturally, and return to the previous discovery context.
- Unknown or invalid persisted blocks do not silently erase article content.
- Article metadata stays relational; only blocks use JSONB.

## Phase 3 — Social network

Scope:
- Verify profiles/channels, feed, follow/unfollow, notifications, public comments, 0–100 article ratings, view tracking, privacy controls, and discovery/search.
- Check authorization, ownership boundaries, empty/loading/error states, and pagination.

Acceptance:
- Critical social journeys work end-to-end with correct signed-in and signed-out behavior.
- Private profile rules are enforced by the API, not only by UI hiding.
- Repeated requests and pagination do not duplicate or expose restricted content.

## Phase 4 — Magazines and issues

Scope:
- Complete magazine creation/editing and publication, issue management, article curation/order, public issue reading, discovery, and channel profile integration.

Acceptance:
- Owners can manage magazines and issues without JSON editing.
- Public visitors can navigate magazines and published issues.
- Draft content remains private and article links resolve to public article URLs.

## Phase 5 — Mageus commerce

Scope:
- Finish owner-facing storefront, product/service, business-location, and location-specific menu workflows.
- Support article references to Mageus products/services/menu items and public rendering of published items.
- Preserve Mageus's existing shops and keep commerce modular.

Acceptance:
- Owner-only management APIs enforce channel ownership.
- Public pages expose only published and available items.
- Commerce references do not duplicate article persistence or introduce a parallel generic post type.

## Phase 6 — Production readiness

Scope:
- Verify real configured database migrations, deployed SSR/SEO behavior, browser journeys against the deployed app, environment configuration, security, accessibility, performance, backup/rollback, and deployment steps.
- Audit the legacy backend separately before reusing routes or persistence patterns.

Acceptance:
- A real target database migration has been verified, with a documented rollback path.
- Production/staging browser checks cover article publishing/reading, auth, social, magazines, and commerce.
- SSR HTML includes meaningful public article content and correct canonical/metadata for crawlers.
- Release notes state which checks ran locally, in CI, and against live infrastructure.

## Current recorded baseline (2026-10-13)

Implemented in the repository: Angular 22 SSR foundation; custom visual shell and mood selector; typed/versioned article blocks; article studio and public reader; channel/profile and social APIs; magazine/issue APIs and profile surfaces; business location, storefront, product/service, and location-menu surfaces; PostgreSQL migrations and API tests.

Still requiring focused verification/completion: real target-database migration; deployed SSR and crawler output; browser acceptance against the deployed environment; persistent reading preferences; media selection and block-specific editor polish; complete magazine/issue management journeys; moderation/search/discovery improvements; end-to-end social and commerce workflows; security, accessibility, performance, backup, and rollback checks.

A green build or clean-database migration test is not evidence that the deployed database or live application has been verified.
