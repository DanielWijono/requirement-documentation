# Quire — Development Plan

Tracks work on `quire-web/` against the spec in [design.md](design.md).
Update the checkboxes as work lands, and add new findings to the right phase instead of starting a new file.

- **Last updated:** 2026-09-23
- **Status:** Frontend prototype on mock seed data, with changes saved to `localStorage`.
- **Current phase:** Phase 6 complete; next is a first real deployment (see DEPLOY.md), then Phase 7 (to be planned).

## Next up

1. **Docker can't pull images on this machine yet** (every registry request times out while the VPN is up). Until it can, API tests run against a throwaway Homebrew Postgres on port 5433; see "Local services" below.
2. Deploy for real: a VPS, DNS, `.env`, `docker compose -f compose.prod.yaml up -d --build`, `bootstrap-admin` (DEPLOY.md). Before that, once Docker can pull images on this machine: `sh scripts/smoke-prod.sh`.

## Git rules

- Remote: https://github.com/DanielWijono/requirement-documentation (`main` is the default branch). The old `confluenceClone` repository was deleted.
- **Commit identity: every commit must be authored *and* committed as `Daniel Wijono <danielwijono999@gmail.com>`. Never use `silverius.wijono@bni.co.id` or the name "Silverius Daniel Wijono"** (the work identity that is the global git default on this machine). The repository-local config pins the right identity:
  ```
  git config user.name "Daniel Wijono"                 # already set in this repo; re-run after a fresh clone
  git config user.email "danielwijono999@gmail.com"
  ```
  Before every push, check that the output is exactly one line, `Daniel Wijono <danielwijono999@gmail.com>`:
  ```
  git log --format='%an <%ae>%n%cn <%ce>' | sort -u
  ```
- Do each phase on its own branch (`phase-N-<slug>`), then fast-forward merge into `main` and push.
- **Never add `Co-Authored-By: Claude` (or any other AI-attribution trailer) to commit messages or PR descriptions.** Commits carry the author's identity only.
- Run the quality gates below before every commit.

## Local services

- `npm run services` (repo root) starts Postgres (host port **5434**; 5432 is taken by a Homebrew Postgres), the in-memory test Postgres (**5433**) and Mailpit (**8025** inbox, **1025** SMTP).
- API tests need the test Postgres on 5433. Override with `TEST_DATABASE_ADMIN_URL` if it lives elsewhere.
- Mailpit fallback: the release binary runs without installing (`mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025`).
- Fallback while Docker can't pull images: `initdb -D <dir> -U quire --auth=trust` then `pg_ctl -D <dir> -o "-p 5433 -F -c unix_socket_directories=''" start`.

## Quality gates (every change)

Run these in every workspace (`packages/quire-shared`, `quire-api`, `quire-web`), or `npm run check` from the root. Commands shown for `quire-web/`:

```
npx tsc -b      # typecheck: must be 0 errors
npm run lint    # oxlint: no new warnings
npm test        # vitest: all green
npm run coverage  # coverage must stay above the thresholds in vitest.config.ts
npm run build   # must succeed
```

Baseline on 2026-09-23 (start): tsc 0 errors · lint 0 errors, 18 warnings · tests 56/57 passing · build OK (JS bundle 858 kB, 261 kB gzipped).
After Phase 5: tsc 0 errors · lint 0 warnings · tests 187/187 passing · coverage 95% lines · build OK (initial JS 402 kB / 120 kB gzipped, editor chunk 492 kB loaded on demand).

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
- [x] **Decision (owner):** build a self-hosted backend. See Phase 6.

## Phase 3 — Gaps against the design spec

Items from `design.md` that were missing or partial.

**Page state model (§7)**
- [x] "Draft" lozenge next to the title on draft pages
- [x] Small dot after the title in the tree for pages with unpublished changes
- [x] Archive view in the space (`/spaces/:id/archive`, "Archived pages" in the nav) with Restore; archived images shown at 70% opacity
- [x] 403 screen, separate from the 404 one, that never reveals the page title. Restricted pages now have `viewerIds`; forbidden pages are hidden from lists, search and link previews.

**Create flow (§8.4)**
- [x] The tree row `+` creates a blank child draft directly, without the modal (quick path)
- [x] Template preview (section outline) in the modal; the parent defaults to the current page's parent context; ⌘Enter creates a blank page
- [x] Templates prefill the page body (`src/data/templates.ts`)

**Version compare (§8.6)**
- [x] Real word-level diff (`src/lib/diff.ts`) between the version snapshot and the live body: unified below `lg`, side by side at `lg`, with +/− glyphs

**Search (§8.5)**
- [x] Filters for Type, Last modified and Labels (as well as Space and Contributor); the query lives in the URL
- [x] Result snippets with highlights, a breadcrumb, and relevance or last-modified sorting (real ages via `src/lib/relativeTime.ts`)
- [x] The zero-result state names the most restrictive filter and offers to remove it

**Space (§8.3, §8.8)**
- [x] Space overview header: live page count, Star, Watch, and Export space (JSON)
- [x] Space settings: Details form, Permissions matrix, Templates, Labels, Archive/Restore space, and Delete space (after typing the key) all work

**Editor (§6.5–6.9, §9)**
- [x] Editor keyboard shortcuts from §9.1. Tiptap's defaults cover headings, lists and code blocks; added ⌘\` inline code and a ⌘K link prompt that overrides the palette.
- [x] Esc moves focus to the toolbar (the first Esc closes the slash menu); the toolbar uses roving tabindex
- [x] Inline comment anchors are highlighted in the page body, and clicking one opens and highlights its thread. "M" comments on the selected text.
- [x] Link hover preview cards (400 ms) and smart-link chips on paste (⌘Z reverts to the plain URL) (§9.4)
- [ ] Structural conflict banner, for example "Page was moved" (§9.3). **Moved to Phase 6:** it needs other users making concurrent changes, which only a backend can produce.

**States and accessibility (§10–11)**
- [x] Loading skeleton that mirrors the page layout (`PageSkeleton`, pulses only when motion is allowed). With local data nothing loads asynchronously; it is used as the fallback for lazy-loaded routes (Phase 5). Tree and panel skeletons wait for a backend.
- [x] Skip links: "Skip to content" and "Skip to page tree"
- [x] Tree: `aria-setsize`, `aria-posinset`, roving tabindex, and arrow/Home/End/Enter keyboard navigation
- [x] Focus returns to the control that opened a panel, palette, menu, modal or the version compare view
- [~] 320 px reflow and 200% zoom. Fixed-width overflows found in code review are fixed (right panel, search filters, create modal, toasts, compare header). **Not visually verified in a real browser yet**, because browser automation was out of scope for this pass.

**Found and fixed along the way**
- [x] Infinite re-render when a space had no tree (`usePageTree` returned a new `[]` on every call)
- [x] Spaces directory "Recently active" sorted relative-time labels alphabetically
- [x] Modal and palette focus return broke when a child used `autoFocus`; initial focus is now owned by the container

## Phase 4 — Testing depth

- [x] Component tests: `EditorToolbar`, `SlashMenu` + `useSlashMenu`, `BubbleToolbar` (against a real headless Tiptap editor, `tests/editorHarness.ts`), `ShareModal`, plus the earlier `SearchResults`, `SpaceSettings` and `VersionCompareModal` suites
- [x] Coverage report (`npm run coverage`, v8) with enforced minimums: statements 90, branches 82, functions 65, lines 90. Baseline: 95 / 88 / 71 / 95.
- [x] Accessibility check: axe-core on 14 screens and dialogs (`tests/ui/axe.test.tsx`, colour contrast excluded because jsdom has no layout)
- [ ] End-to-end browser tests (Playwright) for the key journeys. **Deferred by the owner's instruction:** verification uses unit and UI tests only, with no Playwright. Revisit when real-browser checks are wanted (they would also cover the 320 px and zoom checks from Phase 3).

**Found and fixed while writing these tests**
- [x] Editor toolbar and bubble toolbar showed stale formatting state, lagging up to 1 s. Tiptap v3 does not re-render on transactions, so they now subscribe via `useEditorState` (`activeFormats.ts`).
- [x] The Share dialog's Save stored nothing, the "Inherited from Architecture" note was hardcoded on every page, and the displayed link differed from the copied one. Restrictions are now saved (`viewerIds` / `editorIds`), inherited restrictions are computed from ancestors, and the tree lock icon stays in sync.
- [x] New edit permission: view-only users get no Edit button, no `E` shortcut, and a 403 on the editor route
- [x] axe: labels in the Create and Create-space dialogs weren't linked to their fields; an empty page tree was `role="tree"` with no tree items

## Phase 5 — Performance

- [x] Lazy-load the editor route (`React.lazy` on `PageEdit`, with `PageSkeleton` as the fallback). The initial JS bundle went from 893 kB (273 kB gzipped) to **402 kB (120 kB gzipped)**. The editor loads as its own 492 kB chunk only on `/edit`, and the >500 kB build warning is gone. This required moving `parsePageUrl` to `src/lib/pageUrl.ts` so read mode doesn't import Tiptap.
- [x] Check for unnecessary re-renders from broad store subscriptions. Findings and fixes:
  - Every autosave (~700 ms while typing) rebuilt the whole page tree, re-rendering the nav and every row. Tree patches are now skipped when the state, title or restriction is unchanged.
  - `TopBar` subscribed to all pages. It now uses `useDerived` (compared by value) for just the starred and recent entries.
  - Tree rows subscribed to their whole page object. `usePageActions` now takes a page id and subscribes to four fields.
  - Verified with React Profiler render counts (`tests/unit/renders.test.tsx`): autosaves cause 0 commits in `SpaceNav` and `TopBar`.
  - Left as is: `Home`, `SearchResults`, `SpaceOverview`, `SpaceArchive`, `SpaceSettings` and the Share dialog subscribe to all pages, but none of them are mounted while someone is editing, so their data only changes through their own actions.

## Phase 6 — Backend

Decided 2026-09-23. Quire is for multiple people, so it gets a self-hosted backend.

### Decisions
- **Stack:** Node + Postgres 16. Hono (API), Drizzle ORM + drizzle-kit migrations, Better Auth. Docker Compose locally now; the same compose file later runs on a VPS behind Caddy.
  - Chosen over hosted Supabase and Firebase: no lock-in, fixed cost, Postgres full-text search, and the later Yjs co-editing server runs on the same box.
- **Layout:** npm workspaces at the repo root with `packages/quire-shared` (zod schemas, types, seed data at `@quire/shared/seed`, `evaluateAccess`, `relativeTime`), `quire-api/` and `quire-web/`.
- **Accounts:** one workspace, invite-only, email + password.
- **Email:** Mailpit in dev (a fake inbox at `localhost:8025`); any SMTP provider in production via `SMTP_*` env vars.
- **Permissions:** users + groups, enforced by the API only.
  - The space matrix (§8.8): users/groups × View, Add, Edit, Delete, Comment, Admin.
  - Page restrictions (§8.7): **view restrictions are inherited** by child pages; **edit restrictions are not** (Confluence-style).
  - Drafts are visible only to their author and collaborators (§6.3).
- **Saving:** the first release uses save/publish with conflict detection (If-Match → 409). Real-time co-editing comes in 6l.
- **Data:** `mockData.ts` becomes a dev-only seed script. Production starts empty; nothing is imported from `localStorage`.
- **Frontend data access:** TanStack Query v5 plus a typed `apiClient.ts`. `contentStore` actions become mutation hooks; selectors become query hooks with the same names. `uiStore` stays.
- **Tests:** still Vitest only, no Playwright.
  - API tests run against a real Postgres (`postgres-test` compose service on tmpfs, port 5433).
  - Web tests run against an MSW in-memory fake backend.
  - A shared contract suite runs against both, so the fake can't drift from the real API.

### Permission rule (`evaluateAccess`, in `quire-shared`)
1. Principals are the user plus their groups (every active user is in the system `members` group). Space permissions are the union of their rows; the space owner and site admins get everything; `Admin` implies the rest.
2. **View:** space `View`; for drafts, the author or a collaborator; for archived/deleted pages, `Admin` or `Delete`; and for every ancestor-or-self page with a view list, the user or one of their groups is on it.
3. **Edit:** view, plus space `Edit`, plus this page's own edit list if it has one.
4. **Comment:** view + `Comment`. **Create child:** `Add` + edit on the parent. **Delete/archive:** `Delete` or page owner. **Change restrictions:** edit. **Change the permissions matrix:** `Admin`.
5. A page in a space you can't view returns 404; a restricted page returns 403 (the existing `Forbidden.tsx`). List endpoints filter in SQL, never in JS after pagination.
6. Decided in 6d: view lists bind everyone, site admins included, and drafts stay private to their author and collaborators. Trashed pages and pages in archived spaces are read-only; archived spaces accept no new pages. Anyone signed in may create a space. The API's `visiblePagesSql` / `visibleSpacesSql` are tested to agree with the pure evaluator on a shared fixture.
7. Decided in 6i: the web sub-phases are sliced by route family (people + spaces, then pages + comments, then home + search + cleanup) instead of reads-then-writes, so `main` never has reads from the API while writes still go to the local store. Web test code is now type-checked (`tsconfig.test.json` in `tsc -b`). Spaces are addressed by id or key; web URLs keep ids.
8. Decided in 6m: one server, one compose file (`compose.prod.yaml`): Postgres, a one-shot `migrate` job the API waits for, the API (non-root, health-checked), Caddy serving the built app and proxying `/api` and `/collab` with a CSP (allowing Google Fonts, which the app uses), HSTS and immutable caching of hashed assets, and a `backup` service writing daily `pg_dump` custom-format dumps with retention. Only 80/443 are published. Writing the runbook showed the web app had no way to invite people, so 6m also adds the People admin screen (invites, roles, deactivation, groups) for site admins, with fake-API support and contract cases. Verified without Docker (images can't be pulled on this machine yet): `docker compose config`, `caddy validate`, a backup-and-restore round trip into a fresh database, and the production shape run natively (production-mode API behind the real Caddyfile over TLS: headers, SPA fallback, HTTPS redirect, `__Secure-` session cookie, co-editing WebSocket, foreign Origin refused). `scripts/smoke-prod.sh` runs the real compose file once Docker works.
9. Decided in 6l: co-editing runs inside the API process on the same port (`/collab`, Hocuspocus 4 over `ws`), so it shares auth, the database and access checks and needs no extra service. The page schema moved to `packages/quire-editor` (`@quire/editor`), which the browser editor and the API both use; the API turns Yjs into sanitized HTML for the draft and seeds new documents from HTML. Connections need a session cookie, the web Origin, and edit access; restriction changes make editors reconnect and be checked again. Publishing flushes the open document first; discarding a draft or restoring a version rewrites open documents in place. Titles and width still save over REST with the lock version (not co-edited). Comment anchors stay text quotes rather than Yjs relative positions: they keep working while the quoted text exists, which is enough for now. The jsdom UI tests use the REST save path; co-editing is covered by Node tests against real WebSockets and a manual two-client check through the Vite proxy.
9. Decided in 6j: everything that reads pages moved together (tree, page view, editor, comments, history, share, home, search, palette), so 6k's cleanup landed in the same branch and `contentStore`, its persistence and `mockData` are gone from the app (the bundle has no seed data; the app clears the old `quire.content` storage key once). The web loads a space's whole visible tree in one request (`GET /spaces/:key/tree?all=1`) instead of level by level: spaces are small and several screens need the full tree; the lazy endpoint stays for when a space outgrows that. Home's mock "Following feed" became "Recently updated" (search sorted by modified); "Reset demo data" is gone (the seed is `npm run db:seed`); the 403 screen no longer names the owner of a page you can't see, since the API doesn't reveal it; space export writes the visible outline only. The editor saves drafts one at a time with the draft rev, queues title/width changes with the lock version, flushes before publishing, and stops on any 409 behind a banner (Copy my changes / Reload); the browser warns on leave only while something is unsent. Seed tree labels now match page titles.
9. Decided in 6e: a page's owner can see their own page in the trash (so they can undo a delete); moves stay within a space; copy duplicates one page as a new draft next to the original; restoring a page whose parent is still in the trash puts it at the top of the space; whoever sets a non-empty restriction list is always kept on it; bodies are sanitized with an allowlist of the editor's schema before they are stored.

### Database outline
- Auth: Better Auth `user` (+ `color_seed`, `site_role`, `deactivated_at`), `session`, `account`, `verification`; `invites`; `groups`, `group_members`.
- Spaces: `spaces` (`key citext` unique), `space_permissions` (principal type/id, `perms[]`).
- Pages: `pages` (`parent_id`, fractional `position`, `status`, `published_version`, `lock_version`, `body_text`, generated `search tsvector` with GIN, trigram index on title), `page_drafts` (`rev`), `page_versions`, `page_restrictions`, `page_collaborators`.
- Other: `comments` (one reply level, enforced by trigger), `page_labels`, and per-user `space_stars`, `page_stars`, `space_watches`, `page_watches`, `recent_views` (separate tables so every row has a real foreign key).
- As built in 6b: space keys are stored upper case with a format check instead of `citext`; invite emails are stored lower case; triggers also keep a page's parent in the same space and reject tree cycles; the home "following" feed is derived from `page_versions`, so it has no table.
- Timestamps are ISO dates; the client formats them.
- HTML is sanitized on the server with an allowlist matching the Tiptap schema.

### Sub-phases (branch `phase-6x-<slug>` each)
- [x] **6a scaffold:** workspaces, `quire-shared`, Hono `/api/health`, `compose.yaml` (postgres, postgres-test, mailpit, api), test database harness, quality gates for every package.
- [x] **6b schema:** Drizzle schema and first migration; `db:seed` from `mockData` (refuses to run in production). Tests: migration applies, seed is idempotent, constraints hold.
- [x] **6c auth:** Better Auth (httpOnly SameSite=Lax cookies), invites, password reset through nodemailer, `bootstrap-admin` CLI, `/me`, users and groups admin, rate limits, Origin check on mutations. Tests: invite → accept → login; reset email read through the Mailpit API.
- [x] **6d authz + spaces:** `evaluateAccess`, authz middleware, spaces CRUD, permissions matrix, stars/watches. Tests: table-driven evaluator; route × role matrix.
- [x] **6e pages:** tree (lazy, one level), CRUD, move/copy, archive/delete/restore, restrictions, collaborators, drafts, publish and versions with 409 on conflict. Tests: concurrent saves (200 + 409), cycle rejection, subtree state.
- [x] **6f comments + home:** comments, labels, recent views, `/me/recent|starred|drafts`.
- [x] **6g search:** full-text search with snippets and filters, trigram palette endpoint. Tests: ranking, filters, no restricted results.
- [x] **6h web foundation:** `apiClient`, QueryClient, MSW fake + contract suite, providers in `renderApp`, `useSession` replacing `currentUser` (10 files), Login / Accept invite / Forgot and Reset password routes, route guard, Vite proxy `/api` → `:3000`.
- [x] **6i web: people and spaces** (re-sliced, see below): users and groups queries replace `userById`/`users`; spaces directory, overview, settings (details, permissions matrix, archive, delete) and create-space run on the API, with skeleton / retry / Not found states.
- [x] **6j web: pages and comments:** tree, page view, history and details from queries; page mutations; honest save states (§6.5: Saving…, Saved, Offline, Couldn't save – retry); blocking confirm only for unsent changes (§9.2); 409 shows a non-dismissible banner (Reload / Copy my changes).
- [x] **6k web: home, search and cleanup** (done inside 6j, see below): home lists, server search and palette, share modal with inherited restrictions; remove `contentStore` persist/migrate, `persistence.test.ts` and `mockData` from the app bundle.
- [x] **6l realtime:** Hocuspocus service, Yjs doc per draft, Tiptap Collaboration/Caret, presence avatars, structural-event banner (§9.3, moved here from Phase 3), comment anchors on Yjs relative positions.
- [x] **6m deploy:** `compose.prod.yaml` with Caddy (TLS, static web, `/api` and `/collab` proxy, CSP), migration job, nightly `pg_dump` with a restore runbook, SMTP config, env docs. Smoke-tested locally; no VPS yet.

### Phase 6 quality gates
Run the gates above in every workspace (`packages/quire-shared`, `quire-api`, `quire-web`), with `docker compose up -d postgres postgres-test mailpit` running for API tests. Coverage thresholds are set per package. From 6h on, also check by hand: `npm run dev`, `db:seed`, log in as the seeded admin, invite a user through Mailpit, and confirm a restricted page is hidden from them.

### Risks
- Fake vs real API drift: the contract suite is required for every new route.
- Test churn as data turns async: migrate one route family per sub-phase.
- Deep trees slowing the restriction query: index `parent_id`; add an `ltree` path only if measured.
- Stored XSS through page HTML: server-side sanitizing plus CSP.
- Better Auth / Drizzle version changes: pin versions and commit generated schema.
- Web UI flake (seen once, 2026-09-24, during the full `npm run check`): `axe … share dialog` and `Page actions > Delete asks for confirmation` failed together, then passed in 3 reruns. Watch it; both tests are rewritten against the API in 6i–6k anyway.

---

## Open decisions (from design.md §14 and this plan)

| # | Decision | Status |
|---|---|---|
| 1 | Editor engine | **Decided:** Tiptap (already in use) |
| 2 | Default page width | Reading (760) is the default for now |
| 3 | Serif body text by default | Serif is the default for now |
| 4 | Blog posts in v1 | Open. There's an empty-state route; consider deferring. |
| 5 | Comment threading depth | One level proposed, and needed for 1.2 |
| 6 | Local-only vs backend | **Decided:** self-hosted backend (Node + Postgres), see Phase 6 |

## Changelog

- **2026-09-24:** Phase 6m done: production deployment. `compose.prod.yaml`, `deploy/` (Caddyfile, web Dockerfile, backup script, `.env.example`), updated API Dockerfile (editor package, non-root, healthcheck), `DEPLOY.md` runbook (first deploy, admin, updates, backups and restore, email, security), `scripts/smoke-prod.sh`. People admin screen (`/admin/people`: invites, roles, deactivation, groups). Contract suite 19 cases on both targets. Tests: shared 58, api 171, web 205.
- **2026-09-24:** Phase 6l done: real-time co-editing. `@quire/editor` shared schema; API `src/collab.ts` (Hocuspocus on `/collab`, session + Origin + edit-access checks, drafts stored as Yjs state plus sanitized HTML with a row lock per page, `flush`/`replace`/`notify`/`recheck` hooks used by publish, discard, restore, move, trash and restriction changes, clean shutdown that waits for stores); migration `0003_collab_state` (`page_drafts.ystate`). Web: Collaboration + CollaborationCaret, presence avatars, save state from the connection, a banner when someone else publishes, moves, trashes or discards; Vite proxies `/collab`. Tests: shared 58, api 168 (7 over real WebSockets, including a server restart), web 195.
- **2026-09-24:** Phase 6j done (and 6k): pages, comments, home, search and palette run on the API. Query modules `queries/pages|comments|home|search`; `usePageRoute` (skeleton, 404, 403, retry); editor with honest save states (Saving…, Saved, Offline, Couldn't save + Retry, Not saved on conflict), a 409 banner, and a leave warning only for unsent changes; ShareModal on the restrictions API (fixed: restricting someone to view-only now also keeps an edit list, which an empty list would not); tree skeleton and retry; `contentStore`, persistence and `mockData` removed from the app. API: `tree?all=1`, `spaceId` on home/search items, `space` filter on `/labels` and `/search/quick`, search `space` by id or key. Fake API covers every route; contract suite grew to 16 cases (pages, drafts/publish conflicts, trash, restrictions, comments, labels, home, search), passing against both. Tests: shared 58, api 161, web 191.
- **2026-09-24:** Phase 6i done (people and spaces): `useUsers`/`useUserLookup`/`useGroups`, `useSpaces`/`useSpace` plus star, watch, create, update (key renames too), archive, delete and permission-matrix mutations with optimistic updates; `useSpaceRoute` shows a skeleton, an error with retry, or Not found; the local store lost its space actions. API: spaces found by id or key, PATCH can change the key (409 when taken). Fake API gained the spaces family; the contract suite covers it against both targets (10 cases). Web tests are now type-checked. Tests: shared 58, api 154, web 217.
- **2026-09-24:** Phase 6h done: web `apiClient` (typed `ApiError`, offline detection, If-Match), TanStack Query client (no retries on 4xx), `useSession` / `useCurrentUser` / sign-in / sign-out hooks, Login, Accept invite, Forgot and Reset password screens, `RequireSession` guard with a `next` redirect limited to in-app paths, Vite proxy `/api` → `:3000`, Log out in the account menu. Tests: an MSW fake backend (`quire-web/tests/fakeApi`) seeded from the shared seed; a shared contract suite (`@quire/shared/contract`) that passes against both the fake and the real API; existing UI tests run signed in through the fake. Manually checked sign-in through the Vite proxy against a seeded database (HttpOnly session cookie, `/me`, spaces, search). Tests: shared 58, api 149, web 207.
- **2026-09-24:** Phase 6g done: `GET /search` (`websearch_to_tsquery` with stemming, `ts_rank` + title trigram similarity, typo-tolerant titles, `ts_headline` snippets returned as plain-text parts, never HTML), filters (space, type, contributor, modified, label) with per-filter `relaxed` counts, offset cursors; `GET /search/quick` for the palette (title prefix first, own drafts included, matching spaces). Restricted pages, drafts and hidden spaces never appear or count. Tests: shared 58, api 143.
- **2026-09-24:** Phase 6f done: comments (threads one level deep; replying to a reply joins its thread; author-only edits; author or space admin soft-deletes, with a placeholder kept while replies exist; resolve/reopen on threads), labels (`PUT /pages/:id/labels` normalizes to lower-case-with-dashes; `GET /labels?q` counts only visible pages), `POST /pages/:id/views`, `GET /me/recent|starred|drafts`. Tests: shared 56, api 135.
- **2026-09-24:** Phase 6e done: lazy page tree and trash listing, page CRUD, drafts with If-Match `rev`, publish and version restore with If-Match `lock_version` (428 without it, 409 with the current page on a conflict), versions, move (index-based fractional positions, cycle and cross-space checks), copy, subtree archive/delete/restore, restrictions with inherited view lists shown read-only, draft collaborators, page stars and watches, server-side HTML sanitizing. Tests: shared 54, api 125 (two concurrent publishes give 200 + 409).
- **2026-09-24:** Phase 6d done: pure `evaluateSpaceAccess` / `evaluatePageAccess` in `quire-shared` (31 table cases), API access service (ancestor-chain recursive CTE, SQL list filters checked against the evaluator), spaces CRUD, archive/unarchive, permissions matrix (`GET|PUT /spaces/:key/permissions`), stars and watches, 404 for hidden spaces. Tests: shared 50, api 99 including a route × role matrix over seven roles.
- **2026-09-23:** Phase 6c done: Better Auth (email + password, sign-up disabled, httpOnly SameSite=Lax cookies, rate limits on sign-in and reset, deactivated users blocked), invites (hashed single-use tokens, 7-day expiry, email via SMTP), password reset email, `bootstrap-admin` CLI, `/me`, users admin (roles, deactivation ends sessions), groups CRUD with a protected system group, Origin check on writes. Seeded people sign in with `quire-dev-password`. Tests: api 71 (invite and reset flows read the real Mailpit inbox), shared 19.
- **2026-09-23:** Phase 6b done: Drizzle schema (21 tables) in three migrations (pg_trgm, schema, integrity triggers for reply depth, tree cycles and cross-space parents); `db:migrate` and `db:seed` (idempotent, refuses production); seed data and domain types moved to `@quire/shared` (the web app re-exports them unchanged). Tests: api 43, all passing.
- **2026-09-23:** Phase 6a done: npm workspaces, `@quire/shared` (`relativeTime`, API error and health schemas), `quire-api` (Hono, `/api/health`, env loading with dev defaults, migration runner), `compose.yaml`, and a test harness that clones a migrated template database per worker and truncates between tests. Tests: shared 12, api 10, web 187, all passing.
- **2026-09-23:** Phase 6 planned: self-hosted Node + Postgres backend (Hono, Drizzle, Better Auth), invite-only with email + password, users + groups permissions with view-only inheritance, Mailpit/SMTP email, co-editing later (6l), deploy last (6m).
- **2026-09-23:** Author name changed from "Silverius Daniel Wijono" to "Daniel Wijono" on every commit (history replayed, code unchanged) and pinned in repo config.
- **2026-09-23:** The old repository contained commits authored with the work email. It was deleted, history was replayed with `danielwijono999@gmail.com` as author and committer (code unchanged), and pushed to the new `requirement-documentation` repository. Added the commit-identity rule above.
- **2026-09-23:** Phase 5 done: the lazy editor route cut the initial bundle by 55%, and autosave no longer re-renders the nav or top bar (verified with render counts). Tests: 187, all passing.
- **2026-09-23:** Phase 4 done: component tests for the editor chrome and the Share dialog, enforced coverage (95% of lines), and an axe scan of 14 screens. Fixed stale toolbar state, the Share dialog not saving, and two axe findings. Tests: 183, all passing. Playwright E2E deferred per the owner's instruction.
- **2026-09-23:** Phase 3 done: the page state model, create flow, version diff, search, space screens, editor keyboard and smart links, comment anchors, link previews, and accessibility (skip links, tree keyboard, focus return). Tests: 155, all passing.
- **2026-09-23:** Phase 2 done. Content and UI preferences are saved in `localStorage` with a versioned schema and migration, plus a dev-only reset. Tests: 87, all passing.
- **2026-09-23:** Phase 1 done. Discard now reverts; replies are saved; restoring a version restores its content; all page and tree menu actions work (Copy link, Move, Copy, Archive with Undo, Delete with confirmation and a restorable Trash screen); the Create dialog is shared by the shell. Also fixed 1.7 to 1.10, found along the way. Tests: 81, all passing.
- **2026-09-23:** Phase 0 done. Pushed the repo to GitHub, added `npm run check`, cleared all 18 lint warnings (lint is now at 0), and added a palette-reset test.
- **2026-09-23:** First check of the app. Added the test setup (57 tests: 56 pass, 1 fails on the known Discard bug). Wrote this plan.
