---
name: nest-design
description: The visual design language for the Nest app (dark-first, Notion-inspired, sleek, a touch of Apple). Load this before writing or changing any UI in this repo — components, styling, layout, colors, typography, icons, spacing. Use it so new UI matches the established look instead of drifting.
---

# Nest design language

Nest is a scoped-down Notion clone. The UI should feel **sleek, calm, and
confident** — Notion-*inspired* but never a pixel copy, with a touch of Apple
restraint. Dark mode is the default and the priority. When in doubt, remove
chrome, add space, and let the type and content carry the page.

## Foundations (already wired — use these, don't reinvent)

- **Tokens** live in `app/globals.css` as CSS variables, mapped into Tailwind
  via `@theme inline`. Dark values are under `.dark`; `<html>` carries the
  `dark` class (see `app/layout.tsx`). Never hard-code hex in components —
  always go through the token utilities below.
- **Fonts** (applied in `app/layout.tsx` via `next/font/google`): a two-family
  system tuned for students — bold, effortless to read, "organized study
  notes" energy.
  - `--font-sans` → **Lexend** (body & UI). Engineered to improve reading
    proficiency and reduce reading fatigue — this is the default reading face.
  - `--font-display` → **Bricolage Grotesque** (titles & headings). Bold and
    characterful but tidy. Use it via the `font-display` utility on page
    titles, heading blocks, and the wordmark; semantic `h1`/`h2`/`h3` also
    inherit it from base CSS.
  - `--font-mono` → Geist Mono (rarely used).
- **Icons**: `lucide-react` only. **No emoji as UI icons.** Default icon size is
  16px (`size-4`), muted color, `1.5` stroke feel. Common ones here: `FileText`
  (page), `Table2`/`Database` (database page), `ChevronRight`/`ChevronDown`
  (tree toggles), `Plus`, `Trash2`, `Type`, `Heading`, `Link2`, `Calendar`.
- **Components**: hand-vendored shadcn/ui (New York style) in `components/ui/`
  (`button`, `input`, `select`, `dropdown-menu`). The shadcn CLI registry
  (ui.shadcn.com) is blocked by this environment's egress policy, so add new
  primitives by hand in the same style rather than via `npx shadcn add`.
  `cn()` from `@/lib/utils` merges classes.

## Color usage

Reach for token utilities, not raw colors:

- `bg-background` / `text-foreground` — the app canvas and primary ink.
- `bg-sidebar` — the sidebar rail (slightly deeper than canvas in dark).
- `bg-card` / `bg-popover` — raised surfaces, menus, dialogs.
- `text-muted-foreground` — secondary text, metadata, placeholder-level labels.
- `bg-accent` — hover/active surface for rows, tree items, menu items.
- `bg-secondary` — quiet filled controls.
- `bg-primary text-primary-foreground` — **the** one accent (a confident blue).
  Use sparingly: primary action buttons and active/focus states only. Do not
  paint large areas with it.
- `border-border` — hairline separators; keep borders low-contrast and thin.
- `text-destructive` / `bg-destructive` — delete/danger only.

Dark mode is deliberately near-black (`#0a0a0b` canvas) with soft off-white ink
(`#ececee`) — never pure `#000`/`#fff`. Depth comes from subtle surface steps
(canvas → sidebar → card → popover) and hairline borders, **not** heavy shadows.

## Typography

Apple-ish: generous weight, tight tracking on large text, restrained sizes.

- Page title: `font-display text-4xl font-bold tracking-tight` (Bricolage;
  headings also get `letter-spacing: -0.02em` from base CSS — lean into it).
- Section/heading blocks: `font-display` + `font-bold`/`font-semibold`, sizes
  `text-2xl`/`text-xl`/`text-lg` for heading levels 1/2/3, `tracking-tight`.
- Body / blocks: Lexend, ~15px (`text-[15px]`), `leading-relaxed`. Let Lexend's
  legibility carry long reading; don't shrink body text below ~14px.
- Labels, table headers, metadata: `text-xs` or `text-[13px]`,
  `text-muted-foreground`, sometimes `font-medium`. Avoid ALL-CAPS unless it's a
  tiny eyebrow label; if used, add `tracking-wide`.
- Prefer weight and spacing contrast over color for hierarchy.

## Spacing, shape, motion

- **Radius**: `--radius` is `0.75rem`. Use `rounded-md`/`rounded-lg` for
  controls and surfaces — the soft, Apple-generous corner is part of the look.
- **Space is a feature.** Page content sits in a centered column
  (`max-w-3xl mx-auto`) with roomy padding. Don't crowd.
- **Hover states** are quiet: `hover:bg-accent`, short `transition-colors`.
  Reveal secondary actions (delete, add) on hover with
  `opacity-0 group-hover:opacity-100`.
- **Motion** is subtle and fast (menus/popovers use `tw-animate-css`
  `animate-in`/`fade-in-0`/`zoom-in-95`). No bouncy or slow animations.
- **Focus**: `focus-visible:ring-2 focus-visible:ring-ring/60`, no ugly default
  outlines.

## Patterns specific to Nest

- **Sidebar tree**: compact rows (`text-sm`, ~28px tall), indent by depth,
  chevron toggle + type icon + title, hover reveals `+`/trash actions. Active
  page: `bg-accent` + `font-medium`.
- **Block editor**: blocks are borderless and flush with the page — it should
  read like a document, not a form. Inputs/textareas are transparent with no
  visible border until focused. Placeholder text is `text-muted-foreground`.
  `page_link` blocks render as a subtle bordered card with a page icon.
- **Database table**: hairline `border-border` grid, `text-muted-foreground`
  column headers, generous cell padding, whole row `hover:bg-accent`. Inline
  editors (text/select/date) sit transparently inside cells. The row title is
  the link that opens the row as a full page.
- **Empty states**: centered, `text-muted-foreground`, a single primary action.

## Anti-patterns (don't)

- No emoji icons, no generic admin-panel look, no heavy drop shadows, no pure
  black/white, no rainbow of accent colors, no dense borders on everything.
- Don't hard-code colors — use tokens so light mode keeps working.
- Don't add rich-text toolbars, multiple database views, or other out-of-scope
  surface area; keep the UI focused on pages, blocks, and the database table.
