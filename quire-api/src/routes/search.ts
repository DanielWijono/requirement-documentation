import {
  parseSnippet,
  SEARCH_FILTERS,
  SEARCH_MODIFIED,
  searchQuerySchema,
  type QuickSearchDto,
  type SearchFilter,
  type SearchResponseDto,
  type Subject,
} from '@quire/shared'
import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../app.ts'
import * as t from '../db/schema.ts'
import { badRequest } from '../lib/errors.ts'
import { requireUser, sessionSubject } from '../middleware/session.ts'
import { visiblePagesSql, visibleSpacesSql } from '../services/access.ts'

type SearchInput = z.infer<typeof searchQuerySchema>

const likeEscape = (q: string) => q.replace(/[\\%_]/g, (ch) => `\\${ch}`)
const tsQuery = (q: string) => sql`websearch_to_tsquery('english', ${q})`

/** Full-text match on title and body, or a fuzzy / substring match on the title. */
function textMatch(q: string): SQL {
  return sql`(${t.pages.search} @@ ${tsQuery(q)} or ${t.pages.title} ilike ${`%${likeEscape(q)}%`} or similarity(${t.pages.title}, ${q}) > 0.3)`
}

/** Everything that narrows the results, minus `omit` (used to count what each filter removes). */
function conditions(subject: Subject, input: SearchInput, omit?: SearchFilter): SQL {
  const f = (key: SearchFilter) => key !== omit && input[key] !== undefined
  return and(
    eq(t.pages.status, 'published'),
    visiblePagesSql(subject),
    input.q ? textMatch(input.q) : undefined,
    f('space') ? eq(t.spaces.key, input.space!.toUpperCase()) : undefined,
    f('type') ? eq(t.pages.isBlogPost, input.type === 'blog') : undefined,
    f('contributor') ? or(eq(t.pages.updatedById, input.contributor!), eq(t.pages.ownerId, input.contributor!)) : undefined,
    f('modified') ? sql`${t.pages.updatedAt} >= now() - make_interval(days => ${SEARCH_MODIFIED[input.modified!]})` : undefined,
    f('label') ? sql`exists (select 1 from page_labels l where l.page_id = ${t.pages.id} and l.name = ${input.label!.toLowerCase()})` : undefined,
  )!
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  const offset = Number(Buffer.from(cursor, 'base64url').toString())
  if (!Number.isInteger(offset) || offset < 0) throw badRequest('invalid_cursor', 'That page of results is no longer available')
  return offset
}

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url')

const HEADLINE_OPTIONS = sql`concat('StartSel=', chr(1), ', StopSel=', chr(2), ', MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "')`

export const search = new Hono<AppEnv>()
  .get('/', requireUser, async (c) => {
    const { db } = c.var
    const parsed = searchQuerySchema.safeParse(c.req.query())
    if (!parsed.success) throw badRequest('invalid_request', parsed.error.issues[0].message)
    const input = parsed.data
    const subject = await sessionSubject(c)
    const offset = decodeCursor(input.cursor)

    const countWhere = async (omit?: SearchFilter) => {
      const [row] = await db
        .select({ n: count() })
        .from(t.pages)
        .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
        .where(conditions(subject, input, omit))
      return row.n
    }

    const rank = input.q ? sql<number>`ts_rank(${t.pages.search}, ${tsQuery(input.q)}) + similarity(${t.pages.title}, ${input.q})` : sql<number>`0`
    const snippet = input.q
      ? sql<string>`ts_headline('english', ${t.pages.bodyText}, ${tsQuery(input.q)}, ${HEADLINE_OPTIONS})`
      : sql<string>`left(${t.pages.bodyText}, 240)`
    const order = input.sort === 'relevance' && input.q ? [desc(rank), desc(t.pages.updatedAt), asc(t.pages.id)] : [desc(t.pages.updatedAt), asc(t.pages.id)]

    const active = SEARCH_FILTERS.filter((key) => input[key] !== undefined)
    const [rows, total, relaxedCounts] = await Promise.all([
      db
        .select({
          id: t.pages.id,
          title: t.pages.title,
          icon: t.pages.icon,
          spaceKey: t.spaces.key,
          spaceName: t.spaces.name,
          isBlogPost: t.pages.isBlogPost,
          ownerId: t.pages.ownerId,
          updatedById: t.pages.updatedById,
          updatedAt: t.pages.updatedAt,
          snippet,
        })
        .from(t.pages)
        .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
        .where(conditions(subject, input))
        .orderBy(...order)
        .limit(input.limit)
        .offset(offset),
      countWhere(),
      Promise.all(active.map(async (key) => [key, await countWhere(key)] as const)),
    ])

    const labels = rows.length
      ? await db
          .select()
          .from(t.pageLabels)
          .where(
            inArray(
              t.pageLabels.pageId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(t.pageLabels.name))
      : []
    const dto: SearchResponseDto = {
      results: rows.map((r) => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
        labels: labels.filter((l) => l.pageId === r.id).map((l) => l.name),
        snippet: parseSnippet(r.snippet),
      })),
      total,
      nextCursor: offset + rows.length < total ? encodeCursor(offset + rows.length) : null,
      relaxed: Object.fromEntries(relaxedCounts),
    }
    return c.json(dto)
  })

  /** The command palette: a handful of title matches and spaces, drafts the person can see included. */
  .get('/quick', requireUser, async (c) => {
    const { db } = c.var
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    if (!q) return c.json<QuickSearchDto>({ pages: [], spaces: [] })
    const subject = await sessionSubject(c)
    const like = `%${likeEscape(q)}%`
    const [pages, spaces] = await Promise.all([
      db
        .select({ id: t.pages.id, title: t.pages.title, icon: t.pages.icon, spaceKey: t.spaces.key, spaceName: t.spaces.name })
        .from(t.pages)
        .innerJoin(t.spaces, eq(t.spaces.id, t.pages.spaceId))
        .where(
          and(
            inArray(t.pages.status, ['draft', 'published']),
            visiblePagesSql(subject),
            sql`(${t.pages.title} ilike ${like} or similarity(${t.pages.title}, ${q}) > 0.3)`,
          ),
        )
        .orderBy(desc(sql`${t.pages.title} ilike ${`${likeEscape(q)}%`}`), desc(sql`similarity(${t.pages.title}, ${q})`), desc(t.pages.updatedAt))
        .limit(8),
      db
        .select({ key: t.spaces.key, name: t.spaces.name, icon: t.spaces.icon })
        .from(t.spaces)
        .where(and(visibleSpacesSql(subject), sql`(${t.spaces.name} ilike ${like} or ${t.spaces.key} ilike ${like})`))
        .orderBy(asc(t.spaces.name))
        .limit(5),
    ])
    return c.json<QuickSearchDto>({ pages, spaces })
  })
