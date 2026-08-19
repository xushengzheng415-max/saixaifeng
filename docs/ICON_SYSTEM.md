# Saixiaofeng Football Icon System

Status: confirmed by the product owner on 2026-08-11.

## Brand direction

- Professional youth-football competition product; energetic and trustworthy, never cartoonish.
- Brand spot icons use the `football-brand-v1` direction: rounded deep-emerald outlines (`#087A48`), pale-mint fills (`#EAF7EE`), and a restrained amber emphasis (`#F6A019`).
- Keep one construction system across a set: rounded line ends, flat front-facing geometry, consistent optical padding, and a subtle football-panel or pitch-corner motif.
- The primary outline remains visually heavier than any fill or accent. Do not use black as the dominant filled mass.

## Production boundary

- Use the `oil-icon` workflow for a new, cohesive set of large brand spot, feature, empty-state, onboarding, or category icons. Generate a reviewed sheet first, preserve the raw sheet, slice to transparent PNGs, and inspect every cutout before accepting it.
- Do not manually redraw or simplify branded icons into ad-hoc line art. The approved `oil-icon` output is the visual source for a new brand icon family; retain its silhouette, depth, accent treatment, and recognisable motifs when it is used in product UI.
- Use the shared vector icon registry at `miniprogram/images/icons/manifest.json` for dense 16–24px controls, table tools, and bottom navigation. Do not shrink generated raster spot icons into UI glyphs.
- The bottom menu follows the approved V1 visual direction. Prefer clean SVGs for dense controls; when the product owner explicitly approves a detailed `oil-icon` family for a named tab bar, preserve and use the reviewed transparent PNG cutouts rather than replacing them with simplified line art.
- Reuse a semantic source from the shared library; never duplicate an icon into page-local folders or crop an icon from a prototype.

## Review gate

- Before first use of a new set, present a complete style sheet for visual review.
- Preserve raw generation, source metadata, semantic map, final variants, and target-page mapping.
- Record only accepted assets in the shared library; keep exploratory images outside runtime asset paths.

## Mini-program capsule safe area

- Status bar and the upper-right WeChat capsule are non-content space. Custom-navigation pages must reserve the capsule’s full horizontal footprint plus a visible clearance beneath it.
- Do not position page titles, badges, message actions, filters, or floating controls under, within, or immediately against the capsule. The title should occupy the left safe column; right-side controls must begin below the capsule or be placed in the body.
- Every 390 × 844 iPhone 13 Pro visual-QA screenshot must explicitly check that the capsule is unobstructed and that no UI overlaps its clearance area before the page is accepted.
