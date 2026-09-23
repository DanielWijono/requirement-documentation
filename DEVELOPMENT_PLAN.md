# Quire — Development Plan

Tracks work on `quire-web/` against the spec in [design.md](design.md).
Update the checkboxes as work lands, and add new findings to the right phase instead of starting a new file.

- **Last updated:** 2026-09-23
- **Status:** Frontend prototype running on mock data. Zustand stores only, so a reload loses all changes.
- **Current phase:** Phase 0 → Phase 1

## Next up

1. Set up git and commit the current baseline (Phase 0). Right now nothing is under version control.
2. Fix the "Discard" bug that the failing test catches (Phase 1.1).
3. Save state to `localStorage` so the app survives a page reload (Phase 2).

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

- [ ] `git init`, add a `.gitignore` check, commit the baseline, and do all later work on feature branches
- [x] Set up Vitest, jsdom and Testing Library (`vitest.config.ts`, `tests/setup.ts`, `npm test`)
- [x] Unit tests for `contentStore` and `uiStore` (21 tests)
- [x] UI tests for routes, shortcuts, spaces, command palette, create flow, page view, right panel and editor (36 tests)
- [ ] Add a `check` script that runs typecheck, lint and tests in one command
- [ ] Clear the 18 oxlint warnings:
  - [ ] `BubbleToolbar.tsx`: components are created during render (6×). Move them to module scope.
  - [ ] `set-state-in-effect` in `useMediaQuery`, `CreatePageModal`, `SlashMenu` and `CommandPalette`
  - [ ] `Tooltip.tsx:34`: a ref is read during render
  - [ ] `SlashMenu.tsx:154`: `lastGroup` is reassigned after render
  - [ ] `only-export-components`: move the hooks and helpers out of component files (`SpaceNav`, `PageTreeItem`, `CommandPalette`, `SlashMenu`, `callout`, `expand`)

## Phase 1 — Correctness bugs

These are bugs in features that already exist. Each fix gets a test that fails before the change and passes after it.

- [ ] **1.1 "Discard" publishes the changes instead of discarding them.** `PageStateBanner.tsx:30` calls `saveContent(..., { publish: true })`, which adds a new version. Discard should revert to the last published content. That means storing the published content separately from the draft (see 1.3). Failing test: `tests/ui/features.test.tsx` › "Known behavior gaps".
- [ ] **1.2 Comment replies are thrown away.** `CommentThread.tsx`: Cmd+Enter clears the reply box without saving it. Add `addReply(pageId, commentId, body)` to the store. The spec allows one level of threading (§14.5).
- [ ] **1.3 "Restore version" doesn't restore any content.** `restoreVersion` only adds a version entry, because `PageVersion` has no content snapshot. Add `contentHtml` to versions, snapshot it on publish, and restore from it.
- [ ] **1.4 Many menu items do nothing:**
  - [ ] Page and tree menus: Archive (the store already has `archivePage`), Copy link, Move…, Copy…, Delete
  - [ ] Banner: "View" for unpublished changes, "Restore" for archived pages
  - [ ] Toast `actionLabel` button (for example Undo)
- [ ] **1.5 Duplicate "Collapse" label.** The nav footer's "Collapse" button has the same accessible name as the tree-row arrows. Rename the footer one to "Collapse navigation".
- [ ] **1.6 Home "Create page" (empty state) and the palette's "Create page" action only go to `/spaces`.** They should open the Create modal.

## Phase 2 — Persistence

- [ ] Save `contentStore` (and the UI preferences theme, density, reading font and nav width) to `localStorage` with Zustand `persist`, and include a schema version for future migrations
- [ ] Reset-to-seed action (dev only) for demos
- [ ] Tests: data survives a store reload, and old schema versions migrate
- [ ] **Decision needed:** stay local-only, or add a backend (see Phase 6)?

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

- **2026-09-23:** First check of the app. Added the test setup (57 tests: 56 pass, 1 fails on the known Discard bug). Wrote this plan.
