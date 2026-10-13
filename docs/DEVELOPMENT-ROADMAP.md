# Mageus 2 development roadmap

Last reviewed: 2026-10-13  
Working branch: `main` (direct commits, as requested)  
Product rule: public article reading is anonymous; authenticated identity is required only for private authoring and protected actions.

This roadmap is the release checklist. A phase is **not complete because its code exists**: it is complete only when its acceptance criteria pass and the evidence is linked here. Keep work small enough that a failing gate identifies one class of problem.

## Status vocabulary

- **Not started** — no meaningful implementation yet.
- **In progress** — implementation or audit is underway.
- **Blocked** — a prerequisite or external configuration is missing.
- **Needs verification** — code exists, but its acceptance gate has not passed.
- **Complete** — acceptance criteria passed and evidence is recorded.

## Current status

| Phase | Status | Current evidence / gap |
| --- | --- | --- |
| 0. Audit and baseline | In progress | Legacy route inventory, backend migration notes, and the first [source-to-target UI map](./SOURCE-TO-TARGET-MAP.md) now exist. The endpoint/data-contract inventory and a consolidated baseline are still in progress. |
| 1. Application foundation | Needs verification | Commit `e9390cc` passed production build, SSR home-page and public-article-route smoke tests, API checks, and clean PostgreSQL migration checks in [CI run 38423747327](https://github.com/marvenpiadri/mageus2/actions/runs/38423747327). Fixed recursive SSR self-requests on both home and article routes when `MAGEUS_API_URL` is unset; public article SSR now loads the article from an explicit API origin and defers engagement requests to the browser. Browser hydration, mood interaction, responsive layouts, visual parity, and live-environment behavior still need manual verification. |
| 2. Article Studio core | In progress | Typed block model, registry, editor component, renderer, local recovery, server sync, and publishing exist. Article Studio now lists authenticated server drafts, lets authors reopen a selected draft with a replacement warning, and refreshes the list after sync. API schema tests exercise all 22 supported block types and reject duplicate block IDs. Full editor completeness, media selection/storage, migration/versioning, accessibility, registry/editor/renderer parity, and end-to-end acceptance tests remain. Latest build/API/migration/SSR checks pass in [CI run 38423747327](https://github.com/marvenpiadri/mageus2/actions/runs/38423747327). |
| 3. Neon and API | In progress | Article metadata and relationships remain relational; only article blocks are JSONB. CI now applies every migration, including the rating-summary and magazine/issue migrations, to a clean PostgreSQL 16 database and verifies schema creation. Live Neon migration, production connectivity, and end-to-end persistence still require the configured target database. |
| 4. Public reader and SEO | Needs verification | Article pages include canonical metadata and Article JSON-LD; magazine and issue pages now include canonical URLs, Open Graph metadata, and publication structured data. Production-domain SSR, browser navigation/scroll acceptance, sitemap generation, and search indexing still need verification. |
| 5. Identity and engagement | Needs verification | Authentication boundary and engagement routes exist. Session hardening, integration tests, moderation, and threat review remain. |
| 6. Channels and magazines | In progress | Migration `012_magazines_and_issues.sql`, public discovery, channel-profile magazine cards, magazine detail/issue readers, ordered article selection, publishing APIs, pagination, and metadata are implemented. Build/API CI and clean PostgreSQL migration checks are passing on the recent validated commit; full production-domain browser acceptance remains. |
| 7. Commerce and extensibility | Early foundation | Product and magazine reference block types exist. Real resolver adapters and asset picker are not connected. |
| 8. Release readiness | Needs verification | CI covers production Angular build, API checks, and applying every migration to a clean PostgreSQL 16 instance. Still required: run migrations on the target Neon development/staging database, verify production-domain SSR and browser behavior, confirm environment/CORS settings, test backup restoration, and record release sign-off. |

## Phase 0 — Audit and baseline

### Scope
- Compare original `mageus`, `mageus-ui-test`, and `mageus2` by route, component, stylesheet, assets, behavior, and data model.
- Inventory backend endpoints, database entities, legacy article payloads, media storage, auth/session logic, and realtime behavior.
- Identify behavior to preserve, behavior to redesign, and behavior to retire.
- Record the current CI state and all known build/runtime issues.

### Acceptance gate
- [ ] Source-to-target matrix lists the important UI surfaces and their target files.
- [ ] Legacy endpoint inventory has route, auth expectation, public/private status, target endpoint, and migration notes.
- [ ] Article payload examples are documented without copying secrets or personal data.
- [ ] Known defects are tracked; no hidden credential literals are carried into the new version.
- [x] A clean production build and API test run are linked: [CI run 38280359658](https://github.com/marvenpiadri/mageus2/actions/runs/38280359658) passed both jobs. This does not verify live Neon persistence or end-to-end browser/SSR behavior.

## Phase 1 — Stable application foundation

### Scope
- Angular 22 SSR and routing, shared design tokens, responsive shell, wallpaper layer and glass foreground.
- Reading moods (Stars, Aurora, Midnight, Moonlight, Eclipse, Nordic) and keyboard-accessible controls.
- Strict TypeScript and predictable component boundaries; no Tailwind, PrimeNG, or Quill.

### Acceptance gate
- [x] Production build passes in CI: [run 38422564184](https://github.com/marvenpiadri/mageus2/actions/runs/38422564184).
- [x] Home and public article routes pass SSR smoke checks without a configured API origin; published article content still requires `MAGEUS_API_URL` on the SSR server.
- [ ] Verify hydration and public article SSR with the actual configured API origin and published data.
- [ ] Main reader and studio layouts work at mobile and desktop widths.
- [ ] Mood switching changes visual treatment without changing article content or losing user input.
- [ ] No new console errors, inaccessible keyboard traps, or obvious contrast failures.

## Phase 2 — Article Studio core (highest product priority)

### Scope
One canonical Article Studio, not multiple competing editors. A Behance-like visual canvas with enhanced editorial and multipurpose blocks.

- Versioned document envelope and discriminated block schemas.
- Central block registry: labels, categories, icons, empty-block factories, validation, renderer, editor component, and migration version.
- Add, edit, duplicate, reorder, remove, collapse, and group blocks; stable IDs on reorder, new IDs on duplicate.
- Text, heading, divider, callout, table, code, image, gallery, slide, quote, embed, video, audio, before/after, hotspot, timeline, steps, data visualization, math, product, product collection, and magazine-reference blocks.
- Block-specific controls with clear client-facing labels; no JSON editing in the user-facing studio.
- Live preview using the same renderer as the public reader.
- Undo/redo, autosave/recovery, dirty-state feedback, keyboard operations, and draft export/import.
- Validation before publish and useful inline error navigation.
- Safe embeds via provider allowlist; no arbitrary iframe HTML.

### Acceptance gate
- [ ] Every registered block can be created, edited, reordered, duplicated, deleted, saved, reloaded, and previewed.
- [ ] Every block type has client and server schema coverage, including invalid/boundary cases.
- [ ] Unknown future block types fail gracefully and preserve recoverable source data.
- [ ] Stable IDs survive editing and reorder; duplicated blocks receive unique IDs.
- [ ] No editor action silently discards fields or resets unrelated block content.
- [ ] Autosave/recovery survives refresh and reports conflicts rather than overwriting newer server revisions.
- [ ] Public renderer and studio preview agree on block output.
- [ ] Keyboard-only authoring and narrow-screen editing pass a documented smoke test.

## Phase 3 — Neon and API foundation

### Scope
- Configure Neon using environment variables/secrets; never commit connection strings.
- Versioned SQL migrations, migration ledger, least-privilege database roles, connection pooling, and health checks.
- Repositories/services separated from Express routes and DTO validation.
- Draft create/save/fork/publish/archive flows with expected-revision checks and revision snapshots.
- Public article read endpoints return only published articles; authoring endpoints require identity and channel ownership.
- Use parameterized SQL and transaction boundaries; redact credentials from logs.

### Acceptance gate
- [ ] A fresh Neon database can be built from migrations from zero.
- [ ] A repeat migration run is safe and does not corrupt data.
- [ ] API integration tests pass against a disposable PostgreSQL/Neon-compatible database.
- [ ] Public endpoints return published articles anonymously and never return drafts.
- [ ] Draft/save/publish/archive operations enforce owner, revision, and state transitions.
- [ ] No committed credentials; configuration failure is clear and safe.
- [ ] Backup/export and restore approach is documented before production data exists.

## Phase 4 — Public reader and SEO

### Scope
- Public article routes, channel username + slug paths, server-rendered content, stable canonical URLs, metadata, Open Graph, Article JSON-LD, sitemap and robots policy.
- Image dimensions/alt text, accessible media captions, performance budgets, and graceful missing/deleted reference behavior.
- Draft/private content excluded from sitemap and public responses.

### Acceptance gate
- [ ] Anonymous browser can open a published article in a clean session.
- [ ] HTML response includes meaningful article text and metadata before client hydration.
- [ ] Canonical URL, title/description, Open Graph, and structured data match the published record.
- [ ] Draft, archived, and unauthorized content do not leak through SSR, APIs, sitemap, or caches.
- [ ] Lighthouse-like performance/accessibility/SEO checks are recorded on representative pages.

## Phase 5 — Identity and engagement

### Scope
- Replace primitive legacy JWT handling with a reviewed authentication design: strong password hashing, short-lived access credentials, revocable/rotating sessions, recovery, and rate limits.
- Likes/unlikes and comment creation require verified identity; public reading and public visible comments can remain anonymous.
- Ownership/role checks, moderation, abuse controls, and notification events.

### Acceptance gate
- [ ] Tokens/sessions are issued and verified only by the new auth module.
- [ ] Client-supplied user IDs never establish identity.
- [ ] Like and comment writes reject anonymous callers and enforce rate limits.
- [ ] Users cannot edit/delete another user's comments or manage another channel.
- [ ] Account recovery, session revocation, and moderation behavior have integration tests.
- [ ] Public reading remains available without login.

## Phase 6 — Channels and magazines

### Scope
- Public channel pages replace the old publication concept.
- Channel profile, ownership/settings, following, magazine membership, issues, and article references.
- Explicit visibility and membership rules.

### Acceptance gate
- [ ] Channel URLs are stable and username collision behavior is defined.
- [ ] Public channel pages render anonymously and expose only intended public fields.
- [ ] Following and membership writes are authenticated and authorized.
- [ ] Magazine references do not embed arbitrary copied article/product records.
- [ ] Pagination, empty states, and deleted/unavailable references are handled.

## Phase 7 — Commerce and extensibility

### Scope
- Mageus product/product-collection blocks reference external IDs and resolve through a server-side adapter.
- Media asset service/picker with file signature, type, size, dimensions, ownership, and access checks.
- Dollareus integration only after Mageus article persistence and public publishing are stable. No shared database; use an explicit API contract.

### Acceptance gate
- [ ] Product blocks can resolve current public product details without copying live commerce data into the article.
- [ ] Missing/unavailable products render a graceful fallback.
- [ ] Adapter errors cannot prevent ordinary article reading.
- [ ] Uploaded media is validated and ownership-protected.
- [ ] Integration contract is documented and tested without direct cross-database queries.

## Phase 8 — Release readiness

### Scope
Security and privacy review, operational metrics/logging, rate limiting, backups and restore rehearsal, staging, rollback plan, performance, SEO validation, and controlled migration/cutover.

### Acceptance gate
- [ ] CI is green on the exact release commit.
- [ ] Staging smoke tests pass for public read, login, draft, publish, likes, comments, and media.
- [ ] Database backup and restore have been tested, not merely configured.
- [ ] Security findings are fixed or explicitly accepted with an owner and deadline.
- [ ] Monitoring, error alerts, migration rollback/forward plan, and incident contacts are documented.
- [ ] Release/cutover checklist is signed off.

## Working rhythm

At the end of every phase, publish a short checkpoint with:

1. **Done:** exact files/features shipped.
2. **Verified:** CI runs, tests, and manual checks actually passed.
3. **Not done:** known gaps and anything still mocked.
4. **Risks/blockers:** especially external configuration such as Neon credentials.
5. **Next phase:** the smallest next deliverable.

Do not start the next phase merely to make the roadmap look complete. Fix a failed acceptance gate first. Keep direct commits to `main` as requested, but keep commits small and logically scoped so regressions are easy to identify and revert.
