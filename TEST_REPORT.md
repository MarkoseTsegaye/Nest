# Nest — Feature Test Report

_Last updated: 2026-07-18. Benchmarked against Notion. Tested end-to-end in the browser via Playwright against `http://localhost:3000`._

No runtime console errors were observed across the session (only Fast Refresh/HMR noise triggered by Playwright screenshots landing in the watched project root).

## What works correctly

- **Pages**: create (sidebar + main "New page"), sidebar navigation, nested/tree display, delete, breadcrumb/parent nav, not-found handling.
- **Blocks**: text, H1–H3, bulleted + numbered lists; `/` slash menu; block-type conversion; markdown shortcuts.
- **Inline formatting**: selection toolbar (bold/italic/underline/strike/code/color/size); persists after reload.
- **Databases**: "Turn into database", add rows, add properties (text/select/date), edit cell values, select options, Name column links to the row's page.
- **Views**: column sorting; filter add / update / remove (URL syncs and clears correctly).
- **Undo/redo** (toolbar buttons): verified for block edits, row create, and property-value (cell) changes — including correct enable/disable state and correct Redo after Undo.
- **Search**: `⌘K`/sidebar dialog matches both page titles and block content; clicking a result navigates and closes the dialog.
- **Persistence**: block text, cell values, and structure survive a reload.

## Issues found

### Broken

1. **Enter in a plain text block inserts a soft line break instead of creating a new block.**
   - Repro: focus a text block, type, press Enter.
   - Nest: inserts a `<br>` in the same block. `handleEnter` returns `false` for text blocks in `components/BlockEditor.tsx`.
   - Notion: Enter creates a new sibling block; Shift+Enter is the soft line break.

2. **New pages are seeded with the literal title `"Untitled"` instead of empty title + placeholder.**
   - Repro: create a page, start typing a title → text appends to "Untitled".
   - Source: `lib/pages-context.tsx`, `createPage` uses `input.title ?? "Untitled"`.
   - Notion: title starts empty with a gray "Untitled" placeholder that disappears on first keystroke.

3. **Page-link child pages are created empty and uneditable.**
   - Repro: gutter `+` → Page link → open the linked page.
   - Source: `createPage` for `page_link` uses `persist: false`, so the server never creates the default text block.
   - Notion: linked/child pages open ready to edit with an empty first block.

### Wrong

4. **Backspace at the start of a non-empty text block does not merge it into the previous block.**
   - `handleBackspaceAtStart` converts headings/lists to text and deletes empty text blocks, but does not merge two non-empty text blocks.
   - Notion: Backspace at block start merges the current block's content into the end of the previous block.

5. **List item content can be lost when reverting a list back to text via Backspace before the edit is committed.**
   - Cause: `preserveContent` reads stale parent state when the block hasn't blurred/committed before conversion (optimistic-UI/remount timing in `BlockEditor.tsx`). Server persistence is usually fine (debounced saves), but visible content drops.

### Minor / polish

6. **React warning**: `Select is changing from uncontrolled to controlled` when editing a select cell (initial `undefined` → value). Initialize the select value to `""`.

7. **Undo/redo history is per-page-session and resets on reload/navigation** (by design per code comments). Confirm this matches intent; Notion keeps a longer history.

8. **Test-environment noise (not an app bug)**: Playwright screenshots saved to the project root repeatedly triggered Next.js Fast Refresh. Point `--output-dir` outside the watched tree.

## Prioritized fix list

1. Enter creates a new block in text blocks (make Shift+Enter the soft break) — #1.
2. New-page title empty + placeholder — #2.
3. Create the default block for page-link child pages (`persist: true` / seed a block) — #3.
4. Backspace-merge non-empty text blocks — #4.
5. Fix list→text revert content loss (commit before convert / read live content) — #5.
6. Clean up the controlled-`Select` warning — #6.

Everything else (pages, databases, views, sorting/filtering, inline formatting, undo/redo, search, persistence) is functioning correctly.
