# design.md — Quire (Confluence-class wiki) UI

Status: Draft v0.1
Scope: Web client (desktop-first, responsive to tablet and phone)
Working name: **Quire** — a set of folded sheets bound together; maps directly to spaces containing page trees.

---

## 0. Positioning and constraints

Quire replicates the *information architecture and workflows* of Confluence (spaces, hierarchical pages, rich editor, inline comments, versions, permissions). It deliberately does **not** replicate Atlassian's visual identity: no Atlassian Design System tokens, logos, iconography, product names, or blue-on-white chrome. Everything visual in this document is original.

The product has two modes that dominate every design decision:

- **Read** — the majority of sessions. Optimised for long-form scanning, navigation by tree and search, and low chrome.
- **Write** — fewer sessions, higher stakes. Optimised for a distraction-free canvas, fast block insertion, and safe publishing.

The UI must make the current mode unambiguous at all times. Confusing draft vs. published state is the single most damaging failure in this product category.

### Non-goals (v1)

Real-time whiteboards, databases/Airtable-style tables, Jira-equivalent integrations, marketplace apps, and custom themes per space. The component model should not preclude them.

---

## 1. Design principles

1. **The page is the product.** Chrome recedes; content width, typography, and rhythm get the design budget.
2. **Location is always legible.** A user can always answer "which space, which parent, which version am I looking at?" without scrolling.
3. **State is explicit.** Draft, published, unpublished changes, restricted, archived — each has one visual treatment used everywhere.
4. **Keyboard parity.** Every primary action is reachable by keyboard; the editor is fully operable without a mouse.
5. **One accent, used for intent.** The accent colour marks the primary action and the current location. It is never decoration.

---

## 2. Information architecture

```
Site
├── Home (personal)
│   ├── Recently viewed
│   ├── Drafts
│   ├── Starred
│   └── Following feed
├── Spaces directory
│   └── Space
│       ├── Overview (space home page)
│       ├── Page tree
│       │   └── Page
│       │       ├── Child pages (unbounded depth)
│       │       ├── Attachments
│       │       ├── Comments (inline + footer)
│       │       ├── Version history
│       │       └── Restrictions
│       ├── Blog posts (chronological)
│       ├── Templates
│       └── Space settings
├── Search (global, scoped)
├── People / profile
└── Admin (site-level)
```

### Object vocabulary (UI-facing)

| Object | Definition | Notes |
|---|---|---|
| Space | Top-level container with its own permissions and home page | Has a key (e.g. `ENG`), name, icon, owner |
| Page | Hierarchical document | Always has exactly one parent (page or space root) |
| Blog post | Dated document, flat list per space | Not in the page tree |
| Draft | Unpublished page, or unpublished changes to a published page | Two distinct states, see §7 |
| Template | Page blueprint scoped to space or site | |
| Label | Free-form tag on pages | Lower-case, hyphenated |

---

## 3. Layout system

### 3.1 Application shell

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar (48)                                                          │
├────────────┬─────────────────────────────────────────────┬───────────┤
│ Space nav  │  Page header (breadcrumb, title, meta, acts) │ Right     │
│ (280,      │ ──────────────────────────────────────────── │ panel     │
│ resizable  │                                              │ (360,     │
│ 240–400,   │  Content column (max 760 reading / 960 wide) │ optional: │
│ collapsible│                                              │ comments, │
│ to 0)      │                                              │ history,  │
│            │                                              │ details)  │
└────────────┴─────────────────────────────────────────────┴───────────┘
```

- **Top bar**: global, fixed. Never changes between read and write mode except for the editor toolbar replacing the page header (see §6.4).
- **Space nav**: contextual to the current space; absent on Home, Search, and Spaces directory.
- **Right panel**: overlays below 1280 px, docks at ≥ 1280 px. Only one panel open at a time.

### 3.2 Content width

| Width mode | Max content width | Use |
|---|---|---|
| Reading (default) | 760 px (~72 characters at body size) | Prose pages |
| Wide | 960 px | Pages with tables or diagrams |
| Full | 100% of column minus 48 px gutters | Dashboards, large tables |

Width is a per-page property set in the editor and persisted with the page. Tables and code blocks may break out to Wide inside a Reading page.

### 3.3 Grid and spacing

Base unit **4 px**. Layout rhythm on an 8 px grid.

| Token | Value | Typical use |
|---|---|---|
| `space.050` | 2 px | Icon-to-label nudge |
| `space.100` | 4 px | Inline gaps |
| `space.150` | 6 px | Tight control padding |
| `space.200` | 8 px | Default control padding, list gaps |
| `space.300` | 12 px | Card/field inner padding |
| `space.400` | 16 px | Section inner padding |
| `space.600` | 24 px | Block spacing in content |
| `space.800` | 32 px | Page header to content |
| `space.1200` | 48 px | Page side gutters (desktop) |

### 3.4 Breakpoints

| Name | Range | Shell behaviour |
|---|---|---|
| `xs` | < 600 | Space nav becomes a drawer; top bar collapses search to icon; right panel becomes full-screen sheet; editor toolbar docks to bottom above keyboard |
| `sm` | 600–959 | Space nav drawer; content gutters 24 px |
| `md` | 960–1279 | Space nav docked, collapsible; right panel overlays |
| `lg` | ≥ 1280 | Everything docked |

---

## 4. Design tokens

All tokens are semantic. Components consume semantic tokens only; raw palette values never appear in component code.

### 4.1 Base palette

| Name | Hex | Role |
|---|---|---|
| Slate Ink | `#1C2431` | Primary text, top bar in dark theme |
| Graphite | `#56606E` | Secondary text, icons |
| Mist | `#E4E7EC` | Borders, dividers |
| Frost | `#F4F6F8` | App background, nav background |
| Paper | `#FFFFFF` | Page canvas |
| Harbor Teal | `#0E6B70` | Accent: primary action, current location, links |
| Marker | `#F2C94C` | Highlight, mention-of-me, search hit |

Status hues (used only through status tokens):

| Name | Hex |
|---|---|
| Moss (success) | `#2E7A4E` |
| Amber (warning) | `#B7791F` |
| Brick (danger) | `#B83A2A` |
| Iris (info/discovery) | `#5B4FC4` |

### 4.2 Semantic colour tokens (light / dark)

| Token | Light | Dark |
|---|---|---|
| `color.bg.app` | `#F4F6F8` | `#12161D` |
| `color.bg.canvas` | `#FFFFFF` | `#181D25` |
| `color.bg.nav` | `#F4F6F8` | `#141920` |
| `color.bg.raised` | `#FFFFFF` | `#202631` |
| `color.bg.sunken` | `#EDF0F3` | `#0F1318` |
| `color.bg.hover` | `#1C24310A` (4%) | `#FFFFFF0F` (6%) |
| `color.bg.selected` | `#0E6B7014` (8%) | `#4FB3B829` |
| `color.bg.accent` | `#0E6B70` | `#4FB3B8` |
| `color.bg.accent.hover` | `#0A5559` | `#6BC4C8` |
| `color.text.primary` | `#1C2431` | `#E6E9EE` |
| `color.text.secondary` | `#56606E` | `#A3ACB9` |
| `color.text.disabled` | `#9AA3AF` | `#5E6773` |
| `color.text.onAccent` | `#FFFFFF` | `#0B1F20` |
| `color.text.link` | `#0E6B70` | `#6BC4C8` |
| `color.border.default` | `#E4E7EC` | `#2A313C` |
| `color.border.strong` | `#C5CBD3` | `#3A4350` |
| `color.border.focus` | `#0E6B70` | `#6BC4C8` |
| `color.highlight` | `#F2C94C66` | `#F2C94C40` |

Contrast requirement: all text tokens on their intended backgrounds meet WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI glyphs). Verify with tooling in CI against the token file, not per component.

### 4.3 Status tokens

Each status has `bg.subtle`, `bg.bold`, `text`, `border`, `icon`. Example (light):

| Status | bg.subtle | bg.bold | text |
|---|---|---|---|
| success | `#E6F2EB` | `#2E7A4E` | `#1F5A38` |
| warning | `#FBF0DC` | `#B7791F` | `#7A500F` |
| danger | `#F8E4E1` | `#B83A2A` | `#8A2A1E` |
| info | `#ECEAFB` | `#5B4FC4` | `#43389A` |
| neutral | `#EDF0F3` | `#56606E` | `#3A4350` |

### 4.4 Typography

Two families plus mono, with distinct roles:

| Role | Family | Fallback |
|---|---|---|
| UI (chrome, nav, controls, meta) | **IBM Plex Sans** | `system-ui, -apple-system, "Segoe UI", sans-serif` |
| Content body (read mode default) | **Source Serif 4** | `Georgia, "Times New Roman", serif` |
| Code | **IBM Plex Mono** | `ui-monospace, "SF Mono", Menlo, monospace` |

A user preference switches content body to IBM Plex Sans ("Sans reading"). The editor uses the same face as read mode so WYSIWYG is literal.

Scale (content):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `type.content.title` | 36 / 44 | 600 (Plex Sans) | Page title |
| `type.content.h1` | 28 / 36 | 600 (Plex Sans) | |
| `type.content.h2` | 22 / 30 | 600 (Plex Sans) | |
| `type.content.h3` | 18 / 26 | 600 (Plex Sans) | |
| `type.content.h4` | 16 / 24 | 600 (Plex Sans) | |
| `type.content.body` | 17 / 28 (serif) · 16 / 26 (sans) | 400 | Paragraphs |
| `type.content.small` | 14 / 22 | 400 | Captions, table cells |
| `type.content.code` | 14 / 22 | 400 | Code blocks, inline code |

Headings are set in Plex Sans even in serif mode; the contrast between sans headings and serif body gives scanning structure.

Scale (UI):

| Token | Size / line-height | Weight |
|---|---|---|
| `type.ui.lg` | 16 / 24 | 500 |
| `type.ui.md` | 14 / 20 | 400 / 500 |
| `type.ui.sm` | 12 / 16 | 400 / 500 |

Rules: sentence case everywhere, including buttons and headings. No all-caps labels. Numerals in tables use tabular figures (`font-variant-numeric: tabular-nums`).

### 4.5 Radius

Radius encodes hierarchy, not decoration.

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | Page canvas, tables |
| `radius.sm` | 4 px | Inputs, buttons, lozenges, code blocks |
| `radius.md` | 8 px | Popovers, menus, panels (callouts) |
| `radius.lg` | 12 px | Modals |
| `radius.round` | 999 px | Avatars, counters |

### 4.6 Elevation

| Token | Shadow | Use |
|---|---|---|
| `elevation.0` | none, 1 px `border.default` | Flat surfaces |
| `elevation.1` | `0 1px 2px #1C24311F` | Sticky headers on scroll |
| `elevation.2` | `0 4px 12px #1C243124, 0 0 0 1px #1C24310F` | Menus, popovers, toolbar |
| `elevation.3` | `0 12px 32px #1C243133, 0 0 0 1px #1C24310F` | Modals, command palette |

Dark theme replaces shadows with a lighter surface (`bg.raised`) plus 1 px `border.strong`.

### 4.7 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion.instant` | 80 ms | linear | Hover/press feedback |
| `motion.quick` | 150 ms | `cubic-bezier(.2,0,0,1)` | Menus, tooltips, tree expand |
| `motion.standard` | 220 ms | `cubic-bezier(.2,0,0,1)` | Panels, drawers, modals |

Motion only responds to user action. No entrance animations on content. `prefers-reduced-motion: reduce` sets all durations to 0 except opacity fades (≤ 80 ms).

### 4.8 Z-index

`base 0 · sticky 100 · nav 200 · panel 300 · popover 400 · modal 500 · toast 600 · tooltip 700`.

---

## 5. Iconography

Stroke icons, 1.5 px stroke at 20 px grid, rounded joins. Sizes: 16 (inline, dense lists), 20 (default), 24 (empty states only). Icons in buttons are always paired with a text label except in the editor toolbar and top-bar utilities, which require tooltips and `aria-label`.

Emoji are allowed as user-chosen page and space icons; they render at 20 px in the tree and 48 px in the page header.

---

## 6. Components

Each component lists anatomy, states, and behaviour. All interactive components have: default, hover, active/pressed, focus-visible (2 px `border.focus` outline, 2 px offset), disabled, and where relevant loading.

### 6.1 Top bar

```
[≡] [Quire mark] [Spaces ▾] [Recent ▾] [Starred ▾]   [ Search (⌘K) ........ ]   [+ Create] [🔔] [?] [Avatar]
```

- Height 48 px, `bg.canvas`, bottom border.
- **Create** is the only accent-filled button in the top bar.
- Search field opens the command palette (§6.12) on focus; it is not an inline search.
- Notification bell shows a counter (max display `99+`).
- `xs`: collapses to `[≡] [mark] ....... [🔍] [+] [Avatar]`.

### 6.2 Space navigation (sidebar)

```
┌──────────────────────────┐
│ [icon] Engineering    ⋯  │  ← space switcher header
│ ENG                      │
├──────────────────────────┤
│ ⌂ Overview               │
│ ✎ Blog                   │
│ ⧉ Templates              │
│ ⚙ Space settings         │
├──────────────────────────┤
│ Content            [+] ⋯ │  ← section header
│ ▾ 📘 Handbook            │
│   ▸ Onboarding           │
│   ▾ Architecture         │
│     ● ADR-012 Queueing   │  ← current page
│     Service map          │
│ ▸ Runbooks               │
├──────────────────────────┤
│ « Collapse               │
└──────────────────────────┘
```

- Resizable via 4 px drag handle on the right edge; double-click resets to 280 px. Width persisted per user.
- `[` toggles collapse.
- Current page: `bg.selected` row, 3 px accent bar on the left edge, text weight 500. The tree auto-expands and scrolls to reveal the current page on navigation.

### 6.3 Page tree (item spec)

Row height 32 px (28 px in compact density). Indent 16 px per level. Maximum rendered indent 8 levels; deeper levels keep indenting logically but show a depth badge instead of further visual indent to protect width.

Row anatomy: `[chevron 16] [icon 16] [title, truncates with ellipsis] [hover actions: + ⋯]`.

Behaviours:

- **Lazy loading**: children fetched on expand; show 3 skeleton rows at the child indent.
- **Drag and drop**: drag a row to reorder among siblings or to reparent. Drop indicators: 2 px accent line between rows (reorder) or `bg.selected` + accent outline on target row (reparent). Hovering over a collapsed row for 600 ms expands it. Moving a page that has children shows a confirmation with the descendant count. Moving across permission boundaries shows a warning that restrictions will change.
- **Keyboard** (WAI-ARIA tree pattern): ↑/↓ move, → expand/enter child, ← collapse/go to parent, Enter open, Home/End, type-ahead by title, `Shift+F10` or `⋯` opens context menu.
- Restricted pages show a 12 px lock glyph after the title. Drafts (unpublished pages) show in italic with `text.secondary` and are visible only to their authors and collaborators.
- Context menu: New child page, Copy link, Move…, Copy…, Archive, Delete.

### 6.4 Page header (read mode)

```
Engineering / Handbook / Architecture                       [Edit] [☆] [Share] [⋯]
📐
ADR-012: Queueing strategy for payment events
[avatar] Owned by Daniel · Last updated 3 hours ago by Adel · 6 min read   [lock] Restricted
[label] [label] [label]
```

- Breadcrumb: `type.ui.sm`, `text.secondary`, truncates middle segments into `…` menu when overflowing; the space and immediate parent are always visible.
- Title: `type.content.title`, wraps, never truncates.
- Meta line: `type.ui.sm`. Restriction lozenge appears only if restricted.
- Actions: **Edit** is the primary (accent) button. `E` shortcut enters edit mode.
- On scroll past the title, a condensed sticky header (40 px, `elevation.1`) shows breadcrumb-truncated title plus actions.

### 6.5 Editor shell (write mode)

Entering edit mode replaces the page header region; the space nav collapses by default (user can reopen) to give the canvas focus.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [‹ Close] Editing · ENG / Architecture     ● Saved 5s ago   [avatars]  [Update] │
├──────────────────────────────────────────────────────────────────────────┤
│ [¶ Normal ▾] B I U S ⋯ | • 1. ☐ | 🔗 @ 😀 | ▦ ⌥ </> | ⓘ | + Insert ▾ | ↔ width │
├──────────────────────────────────────────────────────────────────────────┤
│                    Title placeholder: "Give this page a title"            │
│                    Body…                                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

- Save indicator states: `Saving…` (spinner), `Saved <relative>` (check), `Offline — changes stored locally` (warning), `Couldn't save — retry` (danger, with Retry action). The indicator must never lie; optimistic "Saved" is prohibited.
- Collaborator avatars (max 4 visible, then `+n`), each with a cursor colour assigned from a fixed 8-colour set that excludes the accent and status hues.
- Primary action label: **Publish** for never-published pages, **Update** for published pages. Secondary via split button: Save as draft (for new pages), Publish options (notify watchers toggle, version comment).
- Toolbar sticks under the editor header on scroll. At `xs` it moves to a bottom bar above the software keyboard with a horizontally scrollable set of tools.

### 6.6 Editor content blocks

All blocks share: 24 px vertical rhythm (`space.600`) between top-level blocks, a 20 px drag handle (`⋮⋮`) and `+` inserter appearing in the left gutter on hover or keyboard focus, and a block context menu (Duplicate, Move up/down, Copy link to block, Delete).

| Block | Spec highlights |
|---|---|
| Paragraph | Body type; empty paragraph shows placeholder "Type / to insert" only on the focused line |
| Headings H1–H4 | Auto-generate anchor slugs; hover shows `#` link icon to copy anchor URL |
| Lists (bullet, numbered, task) | Tab / Shift+Tab indent; task items show assignee `@` and due date chips inline |
| Quote | 3 px `border.strong` left rule, italic body |
| Callout panel | Types: info, note, success, warning, danger. `radius.md`, `status.bg.subtle` fill, 20 px status icon, optional custom emoji icon |
| Code block | Plex Mono, `bg.sunken`, language selector, line numbers toggle, copy button, wrap toggle; syntax theme tuned to token palette |
| Table | Header row/column toggles, column resize, cell background from a 10-swatch neutral/status palette, sticky header on scroll, horizontal scroll container when wider than content column. Sort in read mode (non-destructive) |
| Divider | 1 px `border.default`, 32 px vertical margin |
| Image / media | Alignment (center, wrap left/right, wide, full), caption, alt text required before publish (soft-blocking warning), click-to-zoom lightbox in read mode |
| File attachment | Card: file-type icon, name, size, uploader; inline preview for PDF |
| Expand | Collapsible section with title; collapsed by default in read mode |
| Status lozenge (inline) | 20 px height, `radius.sm`, `type.ui.sm` weight 500, sentence case, status colours |
| Mention (inline) | `@Name` chip; mention of current user uses `color.highlight` background |
| Date (inline) | Chip with calendar picker; renders relative in read mode with absolute tooltip |
| Page link (inline) | Link with page icon; broken links shown with danger text and strikethrough icon |
| Table of contents (macro) | Generated from headings; optional sticky rendering in right margin at `lg` |
| Children list (macro) | Renders child pages as a list or tree, configurable depth |
| Excerpt / include (macro) | Visible dashed `border.strong` outline in edit mode only, with source label |

### 6.7 Slash command menu

Triggered by `/` at the start of an empty block or after whitespace. Popover at caret, `elevation.2`, width 320 px, max height 360 px.

- Grouped: Basic, Media, Layout, Macros, Recently used (top, max 5).
- Each item: 20 px icon, label, secondary description, right-aligned shortcut hint when one exists.
- Fuzzy match on label, aliases, and keywords (e.g. "note" → Callout panel).
- ↑/↓ navigate, Enter insert, Esc closes and leaves the typed text.

### 6.8 Inline formatting toolbar

On text selection, a floating toolbar appears 8 px above the selection: Bold, Italic, Code, Link, Highlight, Text colour, Comment. The Comment action is also available in read mode on selection (see §6.9).

### 6.9 Comments

Two types:

- **Inline comments** anchored to a text range. Anchored text gets a `color.highlight` underline (2 px). Clicking opens the thread in the right panel (docked) or a popover (overlay sizes). Resolved threads remove the highlight and move to a "Resolved" filter.
- **Page comments** at the page footer, threaded one level deep (replies to replies flatten to the same thread with a quote reference).

Thread anatomy: avatar 24 px, name, relative time, body (supports mentions, links, inline code, emoji), actions (Reply, React, Edit, Delete, Resolve for inline). Composer expands from a single line on focus; `⌘Enter` submits.

If the anchored text is deleted, the thread is retained and marked "Original text removed" with the last-known quote.

### 6.10 Right panel

Tabs: **Comments**, **Details** (owner, created, labels, attachments, word count, analytics), **History** (§8.6). Header 48 px with tab control and close. Content scrolls independently. Keyboard: `]` toggles, `Esc` closes when focus is inside.

### 6.11 Buttons

| Variant | Use | Style |
|---|---|---|
| Primary | One per view region | `bg.accent`, `text.onAccent` |
| Default | Secondary actions | `bg.canvas`, 1 px `border.strong` |
| Subtle | Toolbars, tertiary | Transparent, `bg.hover` on hover |
| Danger | Destructive confirm | `status.danger.bg.bold` |
| Link | Inline navigation | `text.link`, underline on hover |

Sizes: 32 px (default), 28 px (compact, toolbars), 40 px (touch primary on `xs`). Min target 24×24 px desktop, 44×44 px touch.

### 6.12 Command palette / search

Opened by `⌘K` / `Ctrl K` or `/` when not in an editable field. Centered modal, 640 px, `elevation.3`.

- Empty state: Recent pages (5), Recent spaces (3), Actions (Create page, Go to space…, Toggle theme).
- Typing: results grouped by Pages, Blog posts, Spaces, People, Attachments. Each page result shows title with match highlight (`color.highlight`), space name, breadcrumb path truncated, last updated.
- Scope chip: "In ENG" when opened inside a space; Backspace on empty query removes the scope.
- Enter opens; `⌘Enter` opens in new tab; `→` on a page result previews it in a side pane at `lg`.
- "See all results" routes to the full search page (§8.5).

### 6.13 Menus, popovers, tooltips

- Menus: `elevation.2`, `radius.md`, 4 px inner padding, 32 px items, section headers in `type.ui.sm` `text.secondary` (sentence case), destructive items at the bottom in danger text after a divider.
- Tooltips: 500 ms delay, `bg` = `text.primary`, `type.ui.sm`, max width 240 px, include shortcut hint where applicable.

### 6.14 Modals

Widths: 400 (confirm), 600 (form), 800 (picker/template gallery). Header with title and close, body scrolls, footer right-aligned actions with primary rightmost. Focus trapped; initial focus on first field or, for destructive confirms, on Cancel.

### 6.15 Toasts

Bottom-left, stacked max 3, auto-dismiss 5 s (success/info), persistent (error). Always carry an action when one exists ("Page moved · Undo"). Verb matches the triggering action ("Publish" → "Published").

### 6.16 Lozenges and badges

Lozenge (status text), Counter badge (numeric, `radius.round`), Label chip (removable in edit, clickable filter in read). Never use colour alone; lozenges always contain text.

### 6.17 Avatars

Sizes 16, 24, 32, 48, 96. Initials fallback on a hashed neutral background. Presence dot (collaborating now) in accent at 24 px and above.

### 6.18 Forms

Label above field, `type.ui.md` 500. Helper text below in `text.secondary`. Error text replaces helper, danger colour, with icon, and the field gets a 1 px danger border. Validate on blur, re-validate on change after the first error.

---

## 7. Page state model (visual contract)

| State | Who sees it | Header treatment | Tree treatment |
|---|---|---|---|
| New draft (never published) | Author + invited collaborators | Neutral lozenge "Draft" next to title; banner "Only you and collaborators can see this page" | Italic, secondary text |
| Published | Anyone with view permission | None | Normal |
| Published with unpublished changes | Editors | In read mode, warning banner "Unpublished changes by Adel · View / Discard" | Normal, small dot after title for editors |
| Restricted | Per restriction | Lock lozenge "Restricted" with popover listing who can view/edit | Lock glyph |
| Archived | Admins, search opt-in | Neutral banner "Archived · Restore" and content rendered at 70% opacity for images only (text stays full contrast) | Hidden from tree; visible in Archive view |
| Deleted (trash) | Space admins | Not viewable; Trash list only | Hidden |

These treatments are the only allowed representations of these states.

---

## 8. Key screens

### 8.1 Home

Two-column at `lg`: main column (Recently viewed as a list with space and relative time; Drafts; Following feed with page update cards showing a 2-line diff summary) and a 320 px side column (Starred, Spaces you belong to). Single column below `lg`.

Empty state for a new user: "Start by joining a space or creating your first page" with actions Browse spaces and Create page.

### 8.2 Spaces directory

Filterable list (not cards): icon, name, key, description (1 line), owner, member count, last activity. Filters: All, Mine, Starred, Archived. Sort: Name, Recently active. Create space button top-right.

### 8.3 Space overview

The space home page is an ordinary page rendered with the space header above it:

```
[48 icon]  Engineering                                 [Star] [Watch] [⋯]
           ENG · 128 pages · 14 members
─────────────────────────────────────────────────────────────────────
<home page content>
```

### 8.4 Create flow

`+ Create` opens a 800 px modal: left column location picker (space + parent, defaulting to current page's parent context), right column template gallery (Blank first, then Recent, then categories). Selecting a template shows a preview. Primary action "Create" enters the editor with a new draft. `⌘Enter` creates a blank page directly from the modal.

Quick path: the tree row `+` creates a blank child draft without the modal.

### 8.5 Search results page

Left filter column (240 px): Space, Type, Contributor, Last modified, Labels. Results column: title with highlights, 2-line contextual snippet with highlights, breadcrumb, modifier, date. Sort: Relevance, Last modified. Zero-result state suggests removing the most restrictive filter by name.

### 8.6 Version history

Right-panel list of versions: version number, author avatar, relative time, version comment, "Current" lozenge on the latest. Selecting a version opens a full-width compare view:

- Side-by-side at `lg`, unified below.
- Additions: `status.success.bg.subtle` background with underline; removals: `status.danger.bg.subtle` with strikethrough. Changes also marked with a gutter glyph so colour is not the only signal.
- Actions: Restore this version (creates a new version; confirm modal states this explicitly), Copy link to version.

### 8.7 Restrictions / share

Share modal (600 px) with two sections: Link sharing (copy link; view/edit scope reflecting space permissions) and Restrictions (radio: Anyone in space can view and edit / Anyone can view, some can edit / Only specific people can view or edit). People picker with role dropdown per entry. Inherited restrictions from ancestors are listed read-only with a link to the ancestor.

### 8.8 Space settings

Tabbed page: Details, Permissions (matrix: groups/users × View, Add, Edit, Delete, Comment, Admin with checkboxes and sticky header column), Templates, Labels, Archive, Delete space (danger zone at bottom, requires typing the space key).

---

## 9. Interaction details

### 9.1 Keyboard shortcuts

| Scope | Shortcut | Action |
|---|---|---|
| Global | `⌘K` / `Ctrl K` | Command palette |
| Global | `/` | Command palette (outside editable) |
| Global | `C` | Create page |
| Global | `[` / `]` | Toggle space nav / right panel |
| Global | `?` | Shortcut reference |
| Read | `E` | Edit page |
| Read | `M` | Add comment on selection |
| Read | `S` | Star / unstar |
| Editor | `⌘S` | Force save (no-op feedback: "Saved") |
| Editor | `⌘Enter` | Publish / Update |
| Editor | `⌘K` | Insert/edit link (editor overrides global) |
| Editor | `⌘⌥1–4` | Heading 1–4 |
| Editor | `⌘⌥0` | Normal text |
| Editor | `⌘⇧7` / `⌘⇧8` / `⌘⇧9` | Numbered / bullet / task list |
| Editor | ``⌘` `` / `⌘⌥C` | Inline code / code block |
| Editor | `Esc` | Close menus; second `Esc` moves focus to toolbar |

Markdown input rules: `#`–`####` + space, `-`/`*`, `1.`, `[]`, `>`, ```` ``` ````, `---`, `**bold**`, `_italic_`, `` `code` ``.

### 9.2 Leaving the editor

Close with unpublished changes: no blocking modal if autosave succeeded; the page returns to read mode showing the "Unpublished changes" banner. A blocking confirm appears only when local changes have not reached the server.

### 9.3 Conflict handling

Real-time collaboration makes content conflicts rare; permission or structural conflicts (page moved or deleted by someone else while editing) show a non-dismissible banner inside the editor with the specific event and actions ("Page was moved to Runbooks · Continue editing").

### 9.4 Links and previews

Hovering an internal page link for 400 ms shows a preview card (title, space, excerpt first 160 characters, last updated). Pasting a page URL in the editor converts to a smart link chip; `⌘Z` immediately after reverts to plain URL.

---

## 10. Loading, empty, and error states

- **Skeletons** mirror final layout: title bar (60% width), meta line, then paragraph bars at varied widths (100/96/88/92/60%). Tree children use row skeletons. No shimmer animation when reduced motion is set.
- **Progressive rendering**: page header renders from cached metadata before content arrives.
- **Empty states** state what the area is for and give one action. Example — empty space: "This space has no pages yet" + Create page.
- **Errors** name the failure and the fix: "You don't have permission to view this page. Ask the owner, Daniel, for access" + Request access. "This page was deleted. A space admin can restore it from Trash."
- **404 vs 403** are distinct screens; 403 never reveals the page title.

---

## 11. Accessibility

- Target WCAG 2.2 AA.
- Landmarks: `header` (top bar), `nav` (space nav, labelled with space name), `main` (page), `aside` (right panel), `search`.
- Skip links: "Skip to content", "Skip to page tree".
- Tree implements `role="tree"` / `treeitem` with `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`.
- Editor: toolbar is `role="toolbar"` with roving tabindex; formatting state exposed via `aria-pressed`. Collaborator presence changes announced politely, throttled to once per 10 s.
- Save status is an `aria-live="polite"` region; errors use `assertive`.
- Focus is never lost on panel open/close: returns to the invoking control.
- Diffs, statuses, and restriction states never rely on colour alone.
- Supports 200% zoom and 320 px viewport reflow without horizontal scroll (except tables/code in their own scroll containers).

---

## 12. Theming and density

- Themes: Light, Dark, System (default System). Theme switch applies instantly via CSS custom properties on `:root[data-theme]`.
- Density: Comfortable (default) and Compact (tree rows 28 px, controls 28 px, content block rhythm 16 px). Content typography does not change with density.

---

## 13. Token and component naming conventions

- Tokens: `category.role.variant.state` — e.g. `color.bg.accent.hover`, `type.content.h2`, `space.400`.
- Components: PascalCase, domain-prefixed only when ambiguous — `PageTree`, `PageTreeItem`, `PageHeader`, `EditorToolbar`, `CommentThread`, `StatusLozenge`, `CommandPalette`.
- Props for state use enums, not booleans, where more than two states exist (`saveState: 'idle' | 'saving' | 'saved' | 'offline' | 'error'`).

---

## 14. Open decisions

1. **Editor engine** — ProseMirror (via Tiptap) vs. Lexical. The block list in §6.6, inline anchoring of comments (§6.9), and CRDT collaboration (Yjs) favour ProseMirror/Tiptap given ecosystem maturity for collaborative anchors. Decide before component work on §6.5–6.9 starts; the rest of the UI is engine-agnostic.
2. **Page width default** — Reading (760) vs. Wide (960). Reading is proposed; revisit after usage data on table-heavy spaces.
3. **Serif body default** — proposed as default for read mode. If early users skew heavily toward technical documentation, flip the default to Sans reading.
4. **Blog posts in v1** — low incremental UI cost but adds a second content model to search, permissions, and notifications. Candidate to defer.
5. **Page comments threading depth** — one level proposed; confirm this satisfies review workflows before building.
