import type { Page, PageTreeNode } from '@quire/shared'
import { pageTree, pages, recentlyViewedSeed, spaces, users } from '@quire/shared/seed'
import { countWords, htmlToText } from '../lib/html.ts'
import type { Db } from './client.ts'
import * as t from './schema.ts'

export const SEED_ADMIN_ID = 'u.daniel'
export const MEMBERS_GROUP_ID = 'group.members'
export const MEMBER_DEFAULT_PERMS = ['View', 'Add', 'Edit', 'Comment'] as const
export const ALL_PERMS = ['View', 'Add', 'Edit', 'Delete', 'Comment', 'Admin'] as const

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
}

/** Turn a seed label such as "3 hours ago" or "Yesterday" into a timestamp before `now`. */
export function labelToDate(label: string, now: Date): Date {
  const text = label.trim().toLowerCase()
  if (text === 'yesterday') return new Date(now.getTime() - UNIT_MS.day)
  const m = /^(\d+|a|an)\s+(minute|hour|day|week|month|year)s?\s+ago$/.exec(text)
  if (!m) return now
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])
  return new Date(now.getTime() - n * UNIT_MS[m[2]])
}

export function seedEmail(name: string) {
  return `${name.toLowerCase()}@quire.local`
}

function treePositions(nodes: PageTreeNode[], into = new Map<string, number>()) {
  nodes.forEach((n, i) => {
    into.set(n.id, i + 1)
    treePositions(n.children, into)
  })
  return into
}

function depth(page: Page): number {
  return page.parentId ? 1 + depth(pages[page.parentId]) : 0
}

export interface SeedOptions {
  now?: Date
  nodeEnv?: string
}

/**
 * Load the demo workspace from `@quire/shared/seed`. Safe to run repeatedly: rows that already exist are left alone.
 * Development only: production starts empty.
 */
export async function seed(db: Db, { now = new Date(), nodeEnv = process.env.NODE_ENV }: SeedOptions = {}) {
  if (nodeEnv === 'production') throw new Error('Refusing to seed a production database.')
  const at = (label: string) => labelToDate(label, now)

  await db.transaction(async (tx) => {
    await tx
      .insert(t.user)
      .values(
        users.map((u) => ({
          id: u.id,
          name: u.name,
          email: seedEmail(u.name),
          emailVerified: true,
          colorSeed: u.colorSeed,
          siteRole: u.id === SEED_ADMIN_ID ? ('admin' as const) : ('member' as const),
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(t.groups)
      .values({ id: MEMBERS_GROUP_ID, name: 'All members', description: 'Everyone with an active account.', isSystem: true })
      .onConflictDoNothing()

    await tx
      .insert(t.spaces)
      .values(
        spaces.map((s) => ({
          id: s.id,
          key: s.key,
          name: s.name,
          icon: s.icon,
          description: s.description,
          ownerId: s.ownerId,
          archivedAt: s.archived ? at(s.lastActivity) : null,
          lastActivityAt: at(s.lastActivity),
          createdAt: at(s.lastActivity),
        })),
      )
      .onConflictDoNothing()

    await tx
      .insert(t.spacePermissions)
      .values(
        spaces.flatMap((s) => [
          { spaceId: s.id, principalType: 'user' as const, principalId: s.ownerId, perms: [...ALL_PERMS] },
          { spaceId: s.id, principalType: 'group' as const, principalId: MEMBERS_GROUP_ID, perms: [...MEMBER_DEFAULT_PERMS] },
        ]),
      )
      .onConflictDoNothing()

    const starredSpaces = spaces.filter((s) => s.starred).map((s) => ({ userId: SEED_ADMIN_ID, spaceId: s.id }))
    if (starredSpaces.length) await tx.insert(t.spaceStars).values(starredSpaces).onConflictDoNothing()
    const watchedSpaces = spaces.filter((s) => s.watched).map((s) => ({ userId: SEED_ADMIN_ID, spaceId: s.id }))
    if (watchedSpaces.length) await tx.insert(t.spaceWatches).values(watchedSpaces).onConflictDoNothing()

    const positions = new Map<string, number>()
    for (const nodes of Object.values(pageTree)) treePositions(nodes, positions)

    // Parents before children, for the foreign key and the parent trigger.
    const ordered = Object.values(pages).sort((a, b) => depth(a) - depth(b))
    for (const p of ordered) {
      const publishedHtml = p.publishedHtml ?? (p.state === 'draft' ? null : p.contentHtml)
      const status = p.state === 'draft' || p.state === 'archived' || p.state === 'deleted' ? p.state : 'published'
      const updated = at(p.updatedRelative)
      const oldest = p.versions.at(-1)
      const bodyText = htmlToText(publishedHtml ?? '')
      await tx
        .insert(t.pages)
        .values({
          id: p.id,
          spaceId: p.spaceId,
          parentId: p.parentId,
          position: positions.get(p.id) ?? 0,
          title: p.title,
          icon: p.icon ?? null,
          status,
          statusBeforeTrash: status === 'archived' || status === 'deleted' ? (publishedHtml === null ? 'draft' : 'published') : null,
          ownerId: p.ownerId,
          updatedById: p.updatedById,
          publishedHtml,
          publishedVersion: p.versions[0]?.version ?? 0,
          bodyText,
          wordCount: p.wordCount || countWords(bodyText),
          widthMode: p.widthMode,
          isBlogPost: p.isBlogPost ?? false,
          statusChangedAt: updated,
          createdAt: oldest ? at(oldest.relativeTime) : updated,
          updatedAt: updated,
        })
        .onConflictDoNothing()

      if (publishedHtml === null || p.contentHtml !== publishedHtml) {
        await tx
          .insert(t.pageDrafts)
          .values({ pageId: p.id, html: p.contentHtml, updatedById: p.updatedById, updatedAt: updated })
          .onConflictDoNothing()
      }

      if (p.versions.length) {
        await tx
          .insert(t.pageVersions)
          .values(
            p.versions.map((v) => ({
              pageId: p.id,
              version: v.version,
              html: v.contentHtml ?? (v.current ? publishedHtml : null),
              title: p.title,
              authorId: v.authorId,
              comment: v.comment,
              createdAt: at(v.relativeTime),
            })),
          )
          .onConflictDoNothing()
      }

      const restrictions = [
        ...(p.viewerIds ?? []).map((id) => ({ kind: 'view' as const, principalId: id })),
        ...(p.editorIds ?? []).map((id) => ({ kind: 'edit' as const, principalId: id })),
      ]
      // A page flagged restricted without explicit lists keeps editing to its owner and the admin.
      if (p.restricted && restrictions.length === 0) {
        for (const id of new Set([p.ownerId, SEED_ADMIN_ID])) restrictions.push({ kind: 'edit', principalId: id })
      }
      if (restrictions.length) {
        await tx
          .insert(t.pageRestrictions)
          .values(restrictions.map((r) => ({ pageId: p.id, principalType: 'user' as const, ...r })))
          .onConflictDoNothing()
      }

      if (p.labels.length) {
        await tx
          .insert(t.pageLabels)
          .values(p.labels.map((l) => ({ pageId: p.id, name: l.name })))
          .onConflictDoNothing()
      }

      if (p.starred) await tx.insert(t.pageStars).values({ userId: SEED_ADMIN_ID, pageId: p.id }).onConflictDoNothing()

      for (const c of p.comments) {
        await tx
          .insert(t.comments)
          .values({
            id: c.id,
            pageId: p.id,
            authorId: c.authorId,
            body: c.body,
            anchorText: c.anchorText ?? null,
            resolvedAt: c.resolved ? at(c.relativeTime) : null,
            createdAt: at(c.relativeTime),
            updatedAt: at(c.relativeTime),
          })
          .onConflictDoNothing()
        for (const r of c.replies ?? []) {
          await tx
            .insert(t.comments)
            .values({
              id: r.id,
              pageId: p.id,
              parentId: c.id,
              authorId: r.authorId,
              body: r.body,
              createdAt: at(r.relativeTime),
              updatedAt: at(r.relativeTime),
            })
            .onConflictDoNothing()
        }
      }
    }

    await tx
      .insert(t.recentViews)
      .values(recentlyViewedSeed.map((r) => ({ userId: SEED_ADMIN_ID, pageId: r.pageId, viewedAt: at(r.relativeTime) })))
      .onConflictDoNothing()
  })
}
