# Mageus 2 source-to-target map

Reviewed: 2026-10-12  
Repositories reviewed: `marvenpiadri/mageus`, `marvenpiadri/mageus-ui-test`, `marvenpiadri/mageus2`  
Target branch: `main` (direct commits)  
Purpose: preserve real Mageus behavior and useful UI-test improvements while rebuilding the app with Angular 22 SSR, typed documents, secure API boundaries, and no Tailwind, PrimeNG, or Quill.

This is an implementation map, not a claim that the listed target features are complete. “Present” means source files exist; it does not mean the feature has passed browser, SSR, database, or accessibility verification.

## 1. Route and product-surface map

| Surface / behavior | Original Mageus source | UI-test reference | Mageus 2 target | Status / migration rule |
| --- | --- | --- | --- | --- |
| App shell and primary navigation | `src/app/app_parts/app_parts.component.*`, `src/app/app_parts/undercover/undercover.component.*`, `src/app/app_parts/undercover/main_nav/main_nav.component.*` | `src/app/components/main-nav/main-nav.*`, `src/app/app.ts` | `src/app/app.component.*`, `src/app/app.routes.ts` | Target shell exists; compare actual spacing, wallpaper layering, nav behavior, and responsive states before calling visual parity complete. |
| Home / feed | `src/app/app_parts/feed/feed.component.*`, `src/app/app_parts/posts/posts.component.*` | `src/app/components/articles/article-list.*` | `src/app/features/home/home-page.component.*` | Target home currently contains sample article data in its component. Replace with real public API data after public query/SSR behavior is verified; preserve the intentional reading-first visual hierarchy. |
| Sign-in / registration | `src/app/app_parts/session_login/session_login.component.*`, `src/app/app_parts/session_signup/session_signup.component.*`, `src/app/auth/*` | `src/app/components/auth/*` if present; auth services at `src/app/core/services/auth.service.ts` and `src/app/core/auth/auth.service.ts` | `src/app/features/auth/auth-page.component.*`, `src/app/core/auth/auth.service.ts` | Target sign-in surface exists. Must not require login for published article reads; secure session design and recovery remain verification work. |
| Article authoring / editing | `src/app/app_parts/create_article/create_article.component.*`, `add_text/*`, `add_image/*`, `add_embed/*`, `add_slider/*` | `src/app/components/articles/create-article.ts`, `block-editor-modal.ts` | `src/app/features/article-studio/article-studio-page.component.*`, `article-block-editor.component.*`, `article-block-registry.ts`, `article-document.ts` | One canonical Studio is the target. Do not port the legacy Quill/PrimeNG implementation or copy the UI-test's oversized creator wholesale. Preserve authoring capabilities as modular typed controls. |
| Article block rendering | `src/app/app_parts/articles/newspaper/newspaper.component.*`, `src/app/app_parts/posts/article/article.component.*`, `src/app/app_parts/articles/newspaper/article-text/*`, `article-image/*`, `article-slides/*`, `article-embed/*` | `src/app/components/articles/article-block-renderer.ts`, `src/app/components/articles/blocks/*` | `src/app/features/article-studio/article-block-renderer.component.*` | A shared typed renderer exists. Every registered type still needs parity across model, editor, renderer, API schema, publication validation, and safe fallback behavior. |
| Public article reader | Legacy nested routes under `:userID/articles/:slug/:artID`; reader in `src/app/app_parts/articles/newspaper/*` and `src/app/app_parts/singlepost/*` | `src/app/components/articles/article-reader.*`; route `:username/articles/:slug/:artID` or `article/:artID` | `src/app/features/reader/public-article-page.component.*`, `reader-page.component.*`; route `/:username/:slug` | Public route is deliberately unguarded. Confirm SSR returns published content and SEO metadata from the server; do not rely only on client-side metadata changes. |
| Reading moods / atmospheric background | Legacy visual source to verify in shell, reader and wallpaper settings | `src/app/components/articles/article-reader.ts`, `src/app/components/shared/celestial-starfield.ts`, atmosphere/glass state in `src/app/core/services/gimiapp.service.ts` | `src/app/domain/reading-mood.model.ts`, `src/app/core/reading-mood.service.ts`, `src/app/app.component.*`, reader components | Preserve Stars, Aurora, Midnight, Moonlight, Eclipse, Nordic; mood is reader presentation only and must not change article data or lose editor input. Target service exists; persistence, keyboard behavior, and visual parity need verification. |
| User profile → channel | `src/app/app_parts/profile/profile.component.*`, `profileHeader/*`, `profile-bar/*`, nested profile routes | `src/app/components/profile/profile-page.*`, `profile-header.*`, `profile-nav.*` | Planned channel feature; not yet represented by a dedicated target feature module | Rebuild as a public channel, not the old “publication” concept. Profile page tabs in UI-test include articles, magazines, store, about. Target route/data model still needs explicit channel contract and implementation. |
| Magazines / issues | `src/app/app_parts/magazines_lobby/*`, `src/app/app_parts/profile/magazines/*`, `src/app/app_parts/posts/addToMagazine/*`, `src/app/app_parts/undercover/main_nav/createmagazine/*` | `src/app/components/magazines/magazines-list.*`, `magazine-view.ts`, `magazine-create-modal.ts` | Target type `magazine_ref` exists; channel/magazine pages not yet implemented | Retain curated issues and article membership, but redesign the concept as a meaningful editorial collection rather than a collection of decorative apps. |
| Shop / products | Legacy tree includes article-to-magazine tools; legacy store behavior requires separate route/service inventory | `src/app/components/profile/profile-store.*`, `src/app/components/store/*`, `src/app/core/services/store.service.ts` | `product` and `product_collection` block types exist in `src/app/domain/article.model.ts`; commerce adapter not connected | Preserve product-as-content possibility and in-article product references. Resolve product data through an API adapter; no shared Mageus/Dollareus database. |
| Account settings / wallpaper | `src/app/app_parts/settings/settings.component.*`, `settings/wallpapers/*`, `settings/infos/*` | Atmosphere/glass state in `src/app/core/services/gimiapp.service.ts` | Mood model/service and app shell; dedicated settings surface not yet implemented | Map wallpaper, profile settings, and reading preferences separately; don't silently drop existing customization. |
| Comments / reactions | `src/app/app_parts/posts/comments/*`, article component, and legacy API handlers | Reader contains comments/rating state in `src/app/components/articles/article-reader.ts` | API engagement boundary tests and API routes exist; reader UI wiring needs end-to-end verification | Public article/comment reading may be anonymous. Like/reaction and comment creation require verified identity; ownership/moderation must be enforced server-side. |
| Search / notifications / follows | `src/app/app_parts/undercover/main_nav/search/*`, `notifs/*`, profile follow behavior | Legacy service references in `src/app/core/services/gimiapp.service.ts` | Not yet a complete target feature set | Keep in the migration inventory; do not invent behavior before mapping old payloads/endpoints and target product requirements. |

## 2. Article block model compatibility

The UI-test model is a legacy-shaped `ArticlePart` object with many optional properties (for example `image`, `embedUrl`, `galleryImages`, `hotspots`, `timelineEvents`, `productId`). Mageus 2 uses a discriminated union with stable `id`, `type`, `version`, and type-specific required fields. These shapes are not wire-compatible by default.

| Capability | UI-test legacy shape | Mageus 2 typed shape | Required migration behavior |
| --- | --- | --- | --- |
| Text | `type: 'text'`, `html` | `TextBlock.html` | Sanitize/render safely; avoid accepting executable content as a trusted document. Long-term rich text should be structured and schema-validated. |
| Image | `image`, `caption`, `credit`, `alt`, `imageWidth` | `imageUrl`, `caption`, `credit`, `alt`, `width` | Normalize URLs and width names, require useful alt text for informative images, and preserve captions/credits. |
| Embed | `embed`, `embedUrl`, `embedType`, `embedCategory`, `embedHeight` | `url`, optional `provider` / `title` | Resolve provider on the server or via a strict allowlist; never blindly iframe arbitrary URLs. |
| Slides | `slides[].pic/link`, `slideRatio` | `slides[].imageUrl/href`, `ratio` | Convert field names, preserve labels/links/ratio, and validate outbound URLs. |
| Quote | `quoteAuthor`, `quoteCitation`, optional quote image/link | `author`, `citation` | Decide explicit migration behavior for quote image/link; do not silently discard unsupported fields. |
| Gallery | `galleryImages`, `galleryLayout` | `images[]`, `layout` | Convert string arrays into typed image records and map layout aliases such as horizontal-scroll/slider deliberately. |
| Before/after | `beforeImage`, `afterImage`, labels | `beforeImage`, `afterImage`, labels | Field mapping is direct; renderer and keyboard-accessible comparison behavior still need tests. |
| Hotspots | `hotspotImage`, `hotspots[]` | `imageUrl`, `points[]` | Convert field names, validate coordinates in 0–100, and provide a non-interactive accessible description. |
| Timeline | `timelineTitle`, `timelineEvents[].yearOrDate` | `title`, `events[].date` | Map event date names and preserve ordering/content. |
| Steps | `stepsTitle`, numbered `steps[]` | `title`, `steps[]` | Preserve sequence and labels; derive visual numbering rather than relying on author-supplied numbering unless explicitly supported. |
| Data visualization | `chartTitle`, `chartData`, KPI fields | `title`, `values[]`, `chartType` | Explicitly map supported chart modes and handle legacy KPI data; include a readable data-table/summary fallback. |
| Math | `mathFormula`, `mathExplanation` | `formula`, `explanation` | Field mapping is direct; rendering must treat formulas as data and degrade gracefully if a renderer is unavailable. |
| Product / collection | `productId`, `productDisplayMode`, `productIds`, collection options | `productId`, `displayMode`, `productIds`, `layout` | Keep IDs as references only. Fetch display data through an authorized provider adapter; do not store a copied product catalog in the article. |
| Magazine reference | `magazineId` | `magazineId` | Keep as a typed reference and validate visibility before public rendering. |
| New editorial/media types | Not in the UI-test union | `heading`, `divider`, `callout`, `table`, `code`, `video`, `audio` | Maintain exact parity between registry defaults, editor fields, renderer, API schemas, and publish validation. |

## 3. Architecture and security constraints

- Public read routes must return only published, public articles. A route being unguarded is necessary but not sufficient: repository queries, API responses, SSR HTML, metadata, caches, and sitemap entries must also exclude drafts and archived/private content.
- Authoring, draft access, publish/archive, reactions, comment creation, follows, channel management, and moderation require verified identity plus resource-level authorization.
- Keep Mageus's database and API independent from Dollareus. Commerce blocks store provider/resource references and use a server-side adapter; they do not share a database.
- Neon credentials and all session/signing secrets belong in deployment environment variables. Never copy hard-coded credentials from the legacy backend. Rotate any legacy secrets that were committed.
- The old backend is a monolithic Express/Socket.IO/PostgreSQL entry point that also mixes uploads, local media serving, notifications, user/account settings, article/comment/reaction, magazine and profile endpoints. Use `docs/LEGACY-API-ROUTE-MAP.md` and `docs/LEGACY-BACKEND-FINDINGS.md` as the detailed API/security inventory.
- No Tailwind CSS, PrimeNG, or Quill in the new implementation. UI-test behavior can be used as a reference, but its Tailwind utility styling is not a dependency to copy.
- Article documents are versioned portable data. Each new block type requires model/schema, editor, renderer, publish validation, safe fallback, and migration coverage.

## 4. Verified baseline as of this review

- Latest CI run on `main`: [38279645976](https://github.com/marvenpiadri/mageus2/actions/runs/38279645976) — success.
- The earlier production build run [38279510822](https://github.com/marvenpiadri/mageus2/actions/runs/38279510822) also passed after the heading-level type fix.
- These CI results prove the configured workflow passed for those commits. They do **not** prove a live Neon connection, deployed API, full browser interaction, visual parity, or end-to-end public SSR/SEO.
- No live Neon database credentials were available/verified during this review.

## 5. Next work ordered by dependency

1. Finish the route/data-contract inventory for channels, magazines, products, comments/reactions, search, notifications, settings, uploads, and follows. Record each legacy endpoint's auth expectation, public/private status, old payload, and target endpoint.
2. Close the Article Studio consistency gap: one registry-driven definition of block metadata and explicit tests for registry ↔ editor ↔ renderer ↔ API schema ↔ publication validation parity.
3. Implement reliable block lifecycle operations (stable IDs, add, reorder, duplicate, delete, keyboard controls), then draft recovery/autosave with revision conflict handling.
4. Verify the public article SSR contract end to end before adding more product surfaces.
5. Configure Neon only through environment variables, run migrations from an empty database, and record a real connection/migration test before marking Phase 3 complete.
