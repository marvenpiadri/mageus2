# Mageus 2

Mageus 2 is the clean Angular 22 + server-side rendering reconstruction of Mageus.

It is not a visual redesign. The original `mageus` repository is the source of truth for Mageus's established visual identity and existing product behavior. `mageus-ui-test` is a reference for the expanded article-block system, inline editing, reader moods, glass treatments, magazine surfaces, and store concepts.

## Non-negotiable product principles

- Preserve Mageus's recognizable visual language, including the wallpaper backdrop and the translucent, blurred foreground reading surface.
- Treat **Moods** as first-class reading and exploration controls. They should coordinate the wallpaper, glass surface, accent lighting, and restrained lightweight effects.
- Carry forward the improved article creation experience and expanded block catalogue from `mageus-ui-test`, then improve its accessibility, maintainability, and reliability.
- Rebuild the application as organized, standalone Angular 22 features with SSR-safe browser behavior.
- Do not use Tailwind CSS, PrimeNG, Quill, or `ngx-quill`. Use a small custom CSS design system and purpose-built editor controls.
- Keep publishing and commerce concerns modular. Mageus already has shops; commerce integrations can be designed after the Mageus domain model and publishing architecture settle.
- Do not copy legacy backend secrets, local database credentials, or unsafe authentication patterns into this repository.

## First-version scope

Mageus is a social network, with **articles as the only standalone publishing format in the first version**. Profiles/channels, feeds, follows, notifications, comments, likes, and ratings remain core social features. Do not create a separate Posts type as a placeholder for video.

Long-form video (YouTube-style) and short-form video/Reels are future phases, to be added when the required services are affordable. The first release should not depend on expensive video hosting or processing.

Article blocks remain a flat ordered list. Tutorial steps are a presentation option on ordinary text blocks; consecutive step blocks connect visually and receive order-derived numbering.

## Source repositories

- Original application and visual/behavioral reference: [marvenpiadri/mageus](https://github.com/marvenpiadri/mageus)
- Article studio and reader UI reference: [marvenpiadri/mageus-ui-test](https://github.com/marvenpiadri/mageus-ui-test)
- Legacy Node.js backend to audit separately: [mageus-backend](https://github.com/marvenpiadri/mageus/tree/main/mageus-backend)

## Migration status

The new repository starts empty by design. Work should proceed in reviewable, buildable slices: architecture and domain contracts, Angular SSR foundation, visual shell and moods, article block renderer, article studio, reader, profiles/channels and magazines, then backend/API modernization.

See [the reconstruction plan](docs/RECONSTRUCTION-PLAN.md) for the decisions and acceptance gates.
