# Mageus 2 reconstruction plan

## 1. Source-of-truth rules

| Concern | Primary reference | Rule |
|---|---|---|
| Existing Mageus identity and behavior | `marvenpiadri/mageus` | Preserve its visual character and core interaction patterns; do not redesign it from scratch. |
| Article creation and richer reading concepts | `marvenpiadri/mageus-ui-test` | Reuse the ideas and improve their implementation rather than blindly porting prototype code. |
| New application structure | `marvenpiadri/mageus2` | All rewritten code belongs here. Keep the old repositories intact as references. |
| Old Node.js server | `mageus/mageus-backend` | Audit its routes, data model, upload behavior, auth, and dependencies before replacing or reusing anything. Never copy secrets or local credentials. |

When the two UIs disagree, retain the established Mageus visual identity and bring over the prototype's capabilities through matching styling and interactions.

## 2. Experience and visual invariants

### Reader surface

- The wallpaper is a fixed, independent background layer.
- A foreground glass/page layer sits above it. Its blur, translucency, border, shadows, and accent treatment are controlled independently from the wallpaper.
- The article is the readable focal point. The surrounding visual effects must remain subtle and must not reduce contrast or interfere with text selection, keyboard navigation, links, or controls.
- The reader remains a real article page, not a fullscreen decorative demo. Keep useful navigation, author/article metadata, magazine context, reading progress, and contextual actions.

### Moods

Moods are a core feature for reading and exploration, not merely a generic atmosphere toggle. Initial mood references include **Stars, Midnight, Moonlight, Eclipse, Aurora, and Nordic**. The prototype also contains distinct glass treatments such as clean/original, blue midnight, black pitch, stars, midnight, moonlight, eclipse, aurora, and nordic.

Model these concepts deliberately:
- A mood is a user-facing preset that can coordinate multiple visual settings.
- Glass treatment and animated atmosphere/effect are implementation dimensions that a mood may configure.
- Wallpaper selection remains independent; choosing a mood must not unexpectedly replace a user's wallpaper.
- Mood changes should transition smoothly, be keyboard-accessible, expose their selected state, and respect `prefers-reduced-motion`.
- Canvas, animation, storage, and DOM access must be guarded so SSR never requires browser globals.

### Article studio

Carry forward the visual language of the existing studio while adopting the prototype's stronger authoring capabilities:
- Structured article metadata, cover/thumbnail, title and subtitle.
- An ordered list of typed content blocks with add, edit, select, duplicate, delete, and reorder operations.
- Inline editing where appropriate, with contextual controls that do not obstruct reading or keyboard use.
- Preview/publish workflow and explicit draft/published states.
- Useful validation and recoverable errors; never require authors to edit JSON to create an article.
- Block-specific configuration forms and safe, explicit handling of embeds and rich text.
- A registry-driven block renderer/editor so adding a block does not require scattering type checks across the whole application.

Prototype block families to preserve as a starting catalogue:
- Text / rich text
- Image
- Gallery
- Slide/deck
- Quote
- Embed
- Before / after
- Image hotspot
- Timeline
- Steps / procedure
- Data visualization / chart
- Math
- Product reference
- Product collection
- Magazine reference

Unknown block types must fail gracefully and preserve their data rather than crash or silently erase content.

## 3. Architecture direction

Use Angular 22, standalone components, strict TypeScript, SSR and hydration, lazy feature routes, and a small custom CSS design system. Do not introduce Tailwind, PrimeNG, Quill, or `ngx-quill`.

Suggested feature boundaries:
- `core/`: runtime configuration, HTTP/API clients, auth/session contracts, SSR-safe utilities, error handling.
- `shared/`: accessible primitives, icons, focus/overlay utilities, image handling, skeleton/loading states.
- `features/reader/`: reader page, reading progress, mood selector, comments/reactions, reader layout.
- `features/article-studio/`: article metadata, block registry, block editors, drag/reorder, preview and publishing.
- `features/articles/`: article discovery, cards, lists, category/search surfaces.
- `features/profiles/`: profile-as-channel, profile navigation, content and store tabs.
- `features/magazines/`: magazine creation, issue view, membership/curation contracts.
- `features/storefront/`: Mageus's own shop presentation and product references, isolated from article persistence.
- `features/settings/`: wallpapers, appearance/moods, account settings.
- `domain/`: typed article/block, profile/channel, magazine, media, and store contracts.
- `styles/`: tokens, reset, typography, layout, glass surfaces, mood presets, motion/accessibility rules.

Keep domain models independent of Angular UI components. Components should use services/facades rather than embedding network and persistence logic in templates.

## 4. Data and migration principles

- Establish explicit domain models and API DTOs; avoid untyped `any` for persisted data.
- Keep article blocks as structured, versionable data. Add a schema/version strategy and compatibility adapters for legacy article payloads.
- Treat legacy `parts` and `article` payloads as a migration boundary; normalize them once at the API/domain boundary instead of adding compatibility checks throughout every component.
- Keep media metadata separate from rendering. Do not assume every stored image URL is browser-safe or permanently public.
- Do not use a browser-only storage API directly in SSR-rendered constructors or initializers.
- Do not couple Mageus to Dollareus or share application databases. Once Mageus's publishing model is stable, define a narrow integration contract using stable IDs and explicit API clients.

## 5. Legacy Node.js backend audit

The historical `mageus-backend` includes a large Express entry point, Socket.IO, PostgreSQL access, uploads, and older dependencies. Before any code is reused:
1. Inventory routes, request/response shapes, tables, and external side effects.
2. Identify authentication and authorization boundaries.
3. Remove hard-coded secrets and local database credentials; rotate any credential that may have been committed.
4. Review SQL parameterization, file upload limits/types, image processing, CORS, request size limits, and error handling.
5. Separate route handlers, services, repositories, validation, configuration, and background work.
6. Write API contracts and migration notes before replacing endpoints.
7. Keep the API deployable independently from the Angular SSR app.

Do not migrate the legacy backend wholesale into Angular SSR. SSR is the frontend rendering/deployment architecture, not a reason to put database access or secret-bearing server logic in the browser bundle.

## 6. Implementation sequence

1. **Foundation:** Angular 22 SSR/hydration, strict configuration, scripts, CI build, custom CSS tokens, route shell.
2. **Visual shell:** wallpaper layer, independent glass page, responsive navigation, reduced-motion-aware effects.
3. **Mood system:** typed mood presets, glass/effect mapping, accessible selector, persistence adapter with SSR-safe defaults.
4. **Article domain and renderer:** versioned block contracts, normalization, block registry, graceful unknown-block behavior.
5. **Article studio:** metadata and media selection, block catalogue, inline editing, reorder/duplicate/delete, validation, preview and draft/publish states.
6. **Reader:** responsive article layout, mood controls, reading progress, safe embeds, comments/reactions contracts, SEO metadata.
7. **Channels and magazines:** profiles refactored as channels, magazine/issue surfaces, and content navigation.
8. **Storefront surfaces:** preserve Mageus's existing shop concept and render product references without coupling it to article storage.
9. **Backend modernization:** route inventory and API contracts, then incremental server refactor and database migration planning.
10. **Release hardening:** accessibility, responsive checks, SSR/prerender verification, security review, performance checks, migration/rollback plan.

## 7. Acceptance gates

A phase is not complete merely because files exist. Each implementation slice should:
- pass production Angular build and SSR build;
- avoid Tailwind, PrimeNG, Quill, and `ngx-quill`;
- preserve the existing Mageus visual language;
- be safe when rendered on the server;
- include meaningful behavior rather than static mock controls;
- use typed models and handle loading, empty, and error states;
- preserve keyboard access, focus visibility, readable contrast, and reduced-motion preferences;
- include focused tests for critical domain behavior where feasible.

The old `mageus` and `mageus-ui-test` repositories are reference sources and should not be destructively rewritten during this migration.

## 8. Current implementation status (2026-10-12)

### Implemented in the new repository

- Angular 22 standalone application with server rendering, strict template/type checks, lazy routes, and a production-build CI workflow.
- Custom CSS-only styling (no Tailwind, PrimeNG, Quill, or `ngx-quill`).
- Wallpaper layer and translucent glass shell are separated; the shell has independent mood-based glass/accent tokens and restrained mood lighting.
- Typed article/block contracts cover the prototype's 15 block types.
- Shared block renderer supports text, image, gallery, slides, quote, embed links, before/after, hotspots, timeline, steps, data visualization, math, product references, product collections, and magazine references.
- Initial studio surface includes article title/subtitle, block catalogue, adding/removing/reordering blocks, and starter fields for common blocks.
- Initial reader surface demonstrates the glass reader, mood selector, reading progress, and shared block renderer.
- Legacy backend endpoint inventory and a security/migration risk register have been recorded.

### Deliberately still incomplete

- The reader and landing page currently use design-preview content; they are not connected to real article/profile/store APIs.
- The studio's save action does not pretend to persist data. API persistence, draft recovery/autosave, media upload/selection, robust inline rich-text editing, and focused editors for every block type remain to be built.
- Mood selection is currently in-memory only. Persisted preferences and the user's uploaded wallpaper must be connected through a browser-safe appearance/settings service and a real API contract.
- The block renderer is an initial shared renderer, not yet a full renderer/editor registry with per-block validation and version migrations.
- Authentication/session behavior, profiles-as-channels, magazine flows, store data, comments/reactions, search, SEO metadata per article, and API integration remain pending.
- No legacy database migration, live API, deployed environment, browser acceptance, or production cutover has been verified.

The production SSR build passed in [CI run 38268153611](https://github.com/marvenpiadri/mageus2/actions/runs/38268153611). That validates compilation and SSR route extraction, not the unfinished product behavior listed above.
