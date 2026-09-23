# Quire — Development Plan

Tracks work on `quire-web/` against the spec in [design.md](design.md).
Update the checkboxes as work lands, and add new findings to the right phase instead of starting a new file.

- **Last updated:** 2026-09-23
- **Status:** Frontend prototype on mock seed data, with changes saved to `localStorage`.
- **Current phase:** Phase 3

## Next up

1. Close the design-spec gaps (Phase 3).

## Git rules

- Remote: https://github.com/DanielWijono/confluenceClone (`main` is the default branch).
- Do each phase on its own branch (`phase-N-<slug>`), then fast-forward merge into `main` and push.
- **Never add `Co-Authored-By: Claude` (or any other AI-attribution trailer) to commit messages or PR descriptions.** Commits carry the author's identity only.
- Run the quality gates below before every commit.

## Quality gates (every change)

Run these from `quire-web/`:

```
npx tsc -b      # typecheck: must be 0 errors
npm run lint    # oxlint: no new warnings
npm test        # vitest: all green, apart from tests listed below as known bugs
npm run build   # must succeed
```

Baseline on 2026-09-23: tsc 0 errors · lint 0 errors, 18 warnings · tests 56/57 passing · build OK (JS bundle 858 kB, 261 kB gzipped).

---

## Phase 0 — Foundations

- [x] `git init`, add a `.gitignore` check, commit the baseline, and do all later work on feature branches
- [x] Set up Vitest, jsdom and Testing Library (`vitest.config.ts`, `tests/setup.ts`, `npm test`)
- [x] Unit tests for `contentStore` and `uiStore` (21 tests)
- [x] UI tests for routes, shortcuts, spaces, command palette, create flow, page view, right panel and editor (36 tests)
- [x] Add a `check` script that runs typecheck, lint and tests in one command
- [x] Clear the 18 oxlint warnings:
  - [x] `BubbleToolbar.tsx`: components are created during render (6×). Move them to module scope.
  - [x] `set-state-in-effect` in `useMediaQuery`, `CreatePageModal`, `SlashMenu` and `CommandPalette`
  - [x] `Tooltip.tsx:34`: a ref is read during render
  - [x] `SlashMenu.tsx:154`: `lastGroup` is reassigned after render
  - [x] `only-export-components`: move the hooks and helpers out of component files (`SpaceNav`, `PageTreeItem`, `CommandPalette`, `SlashMenu`, `callout`, `expand`)

## Phase 1 — Correctness bugs

These are bugs in features that already exist. Each fix gets a test that fails before the change and passes after it.

- [x] **1.1 "Discard" publishes the changes instead of discarding them.** `PageStateBanner.tsx:30` calls `saveContent(..., { publish: true })`, which adds a new version. Discard should revert to the last published content. That means storing the published content separately from the draft (see 1.3). Failing test: `tests/ui/features.test.tsx` › "Known behavior gaps".
- [x] **1.2 Comment replies are thrown away.** `CommentThread.tsx`: Cmd+Enter clears the reply box without saving it. Add `addReply(pageId, commentId, body)` to the store. The spec allows one level of threading (§14.5).
- [x] **1.3 "Restore version" doesn't restore any content.** `restoreVersion` only adds a version entry, because `PageVersion` has no content snapshot. Add `contentHtml` to versions, snapshot it on publish, and restore from it.
- [x] **1.4 Many menu items do nothing:**
  - [x] Page and tree menus: Archive (the store already has `archivePage`), Copy link, Move…, Copy…, Delete
  - [x] Banner: "View" for unpublished changes, "Restore" for archived pages
  - [x] Toast `actionLabel` button (for example Undo)
- [x] **1.5 Duplicate "Collapse" label.** The nav footer's "Collapse" button has the same accessible name as the tree-row arrows. Rename the footer one to "Collapse navigation".
- [x] **1.7 Read mode showed unpublished edits.** `PageView` rendered the working copy. It now renders `publishedHtml`, and the banner's View / Show published switches to the draft. (Found while fixing 1.1.)
- [x] **1.8 The tree-row ⋯ menu crashed.** `Menu` called the trigger's `onClick` without the event, so `stopPropagation()` threw. (Found by the new tests.)
- [x] **1.9 Deleted and archived pages still appeared** in Home (recent, starred, following feed), the palette, the Recent and Starred menus, and search. They are now filtered with `isLivePage`.
- [x] **1.10 ADR seed data marked v4 as "Current"** even though v5 and v6 came after it. v6 is now current, and v5 has a restorable snapshot.
- [x] **1.6 Home "Create page" (empty state) and the palette's "Create page" action only go to `/spaces`.** They should open the Create modal.

## Phase 2 — Persistence

- [x] Save `contentStore` (and the UI preferences theme, density, reading font and nav width) to `localStorage` with Zustand `persist`, and include a schema version for future migrations. Keys: `quire.content` (schema v1, with a v0→v1 migration) and `quire.ui`. The id counter advances past saved ids after loading.
- [x] Reset-to-seed action (dev only) for demos: Account menu → "Reset demo data"
- [x] Tests: data survives a store reload, and old schema versions migrate (`tests/unit/persistence.test.ts`)
- [ ] **Decision needed (owner):** stay local-only, or add a backend (see Phase 6)? Still open, and it blocks Phase 6.

## Phase 3 — Gaps against the design spec

Items from `design.md` that are missing or partial. Items marked (verify) weren't confirmed in the code yet.

**Page state model (§7)**
- [ ] "Draft" lozenge next to the title on draft pages
- [ ] Small dot after the title in the tree for pages with unpublished changes
- [ ] Archive view in the space that lists archived pages and offers Restore. Show archived images at 70% opacity.
- [ ] 403 screen, separate from the 404 one, that never reveals the page title

**Create flow (§8.4)**
- [ ] The tree row `+` creates a blank child draft directly, without the modal (quick path)
- [ ] Template preview in the modal, and default the parent to the current page's context
- [ ] Templates prefill the page body (right now only the title changes)

**Version compare (§8.6)**
- [ ] Replace the illustrative diff in `VersionCompareModal` with a real diff between the version snapshot and the current body

**Search (§8.5)**
- [ ] Filters for Type, Last modified and Labels (Space and Contributor exist)
- [ ] Result snippets with highlights, a breadcrumb, and relevance or last-modified sorting
- [ ] The zero-result state names the filter to remove

**Space (§8.3, §8.8)**
- [ ] Space overview header: Star, Watch, the ⋯ menu, and page and member counts (verify)
- [ ] Space settings: make the Permissions matrix, Labels and Archive tabs work, and make "Delete space" actually delete

**Editor (§6.5–6.9, §9)**
- [ ] Editor keyboard shortcuts from §9.1 (verify Tiptap's defaults: `⌘⌥1–4`, `⌘⇧7/8/9`, `⌘K` link override)
- [ ] Esc twice moves focus to the toolbar; the toolbar uses roving tabindex
- [ ] Inline comment anchors are highlighted in the page body, and clicking one opens its thread
- [ ] Link hover preview cards and smart-link chips on paste (§9.4)
- [ ] Structural conflict banner, for example "Page was moved" (§9.3). Can wait until there's a backend.

**States and accessibility (§10–11)**
- [ ] Loading skeletons for the page, tree and panels (respect reduced motion)
- [ ] Skip links: "Skip to content" and "Skip to page tree"
- [ ] Tree: add `aria-setsize` and `aria-posinset`, plus arrow-key navigation
- [ ] Focus returns to the control that opened a panel or modal (audit each one)
- [ ] 320 px reflow and 200% zoom check

## Phase 4 — Testing depth

- [ ] Component tests: `EditorToolbar`, `SlashMenu`, `BubbleToolbar`, `SearchResults`, `SpaceSettings`, `ShareModal`, `VersionCompareModal`
- [ ] Coverage report (`vitest --coverage`) with a minimum-coverage threshold once Phase 1 is done
- [ ] An accessibility check such as `vitest-axe` on the main screens
- [ ] End-to-end browser tests (Playwright) for the key journeys: create → edit → publish → comment → restore. Hold these until the UI stabilizes.

## Phase 5 — Performance

- [ ] Lazy-load the editor route (`React.lazy` on `PageEdit`) so Tiptap is kept out of the first load. The bundle is 858 kB now; the target is under 500 kB.
- [ ] Check for unnecessary re-renders from broad store subscriptions such as `s.pages` in `Home` and `TopBar`

## Phase 6 — Backend (optional, needs a decision)

These are only needed if Quire goes beyond a local prototype.

- [ ] API design: spaces, pages, versions, comments, permissions
- [ ] Auth and the per-page restrictions model (§8.7)
- [ ] Real-time collaboration (Tiptap + Yjs), presence, and the conflict banner
- [ ] Server-side search

---

## Open decisions (from design.md §14 and this plan)

| # | Decision | Status |
|---|---|---|
| 1 | Editor engine | **Decided:** Tiptap (already in use) |
| 2 | Default page width | Reading (760) is the default for now |
| 3 | Serif body text by default | Serif is the default for now |
| 4 | Blog posts in v1 | Open. There's an empty-state route; consider deferring. |
| 5 | Comment threading depth | One level proposed, and needed for 1.2 |
| 6 | Local-only vs backend | Open. Blocks Phase 6. |

## Changelog

- **2026-09-23:** Phase 2 done. Content and UI preferences are saved in `localStorage` with a versioned schema and migration, plus a dev-only reset. Tests: 87, all passing.
- **2026-09-23:** Phase 1 done. Discard now reverts; replies are saved; restoring a version restores its content; all page and tree menu actions work (Copy link, Move, Copy, Archive with Undo, Delete with confirmation and a restorable Trash screen); the Create dialog is shared by the shell. Also fixed 1.7 to 1.10, found along the way. Tests: 81, all passing.
- **2026-09-23:** Phase 0 done. Pushed the repo to GitHub, added `npm run check`, cleared all 18 lint warnings (lint is now at 0), and added a palette-reset test.
- **2026-09-23:** First check of the app. Added the test setup (57 tests: 56 pass, 1 fails on the known Discard bug). Wrote this plan.
