# Mageus Article Studio architecture

The studio is the canonical creation surface for every long-form story in Mageus. It borrows the visual freedom of a Behance-style canvas, but supports editorial writing, interactive storytelling, references to Mageus shops, and future Dollareus products through explicit adapters rather than one giant component.

## Editor principles

- One editor for all articles; block-specific tools are modular panels registered by type.
- Editing is schema-driven and versioned. Each block has a stable ID, type, schema version, validated data, and optional layout/presentation settings.
- The editor canvas, public reader, preview, SEO extraction, and persistence consume the same document model. A block is not separately reimplemented in each surface.
- Keep block content portable JSON; never persist Angular templates or executable HTML as the canonical document.
- Use immutable updates, block-level validation, schema migrations, keyboard-accessible reordering, undo/redo, autosave status, and explicit publish validation.
- Do not couple the editor to a specific commerce backend. Product blocks store a provider + external resource ID + display options, resolved through a Mageus commerce adapter.

## Document layers

1. **Article metadata**: title, subtitle, slug, excerpt, cover, category/tags, author channel, publication status, language, SEO title/description/canonical, social image, visibility.
2. **Ordered blocks**: stable IDs, type, schema version, content payload, layout settings, optional responsive overrides, and accessibility text.
3. **References**: typed resource references for products, collections, magazines/issues, videos, and external embeds.
4. **Presentation**: reader mood preference is a reader-side experience setting and must not mutate the canonical article content.
5. **Publication snapshot**: publishing validates and snapshots the versioned document, then public SSR serves the published version without authentication.

## Block families

- Editorial: rich text, heading, divider, quote, callout, footnote, table, code, math.
- Media: image, gallery, carousel/slides, video, audio, embed, before/after, hotspot/image annotation.
- Narrative: steps, timeline, comparison, map, interactive data visualization.
- Commerce: product, product collection, product comparison, service/booking reference.
- Publishing: magazine/issue reference, related article, channel/profile reference.
- Future extensibility: add new block type via a registry entry, schema + migration, editor panel, renderer, accessibility rules, and validation. Unknown blocks must render a safe fallback rather than break an entire article.

## Implementation sequence

1. Build a type-safe block registry and immutable document operations.
2. Port the useful behaviors from `mageus-ui-test` `create-article.ts`, `block-editor-modal.ts`, and `article-block-renderer.ts` after reviewing their actual data shapes; don't blindly copy the oversized 95 KB creator into one component.
3. Give each block type its own editor panel and renderer, with common controls for move/duplicate/delete, alignment, width, caption/alt text, and mobile preview where relevant.
4. Add local draft recovery and server autosave with optimistic concurrency/version checks.
5. Implement preview using the same renderer as the public reader.
6. Add publish validation, public article SSR, sitemap and structured metadata.
7. Connect product references through an adapter when Mageus's product contract is defined. Keep Dollareus integration deferred until its API contract is stable.

## Public/private boundary

Published article HTML and SEO metadata are public. Drafts, revisions, authoring controls, unpublished media, comments' moderation state, likes, and account data remain behind server-side authorization. A client-side route guard is UX only; every write endpoint must independently verify identity and ownership.
