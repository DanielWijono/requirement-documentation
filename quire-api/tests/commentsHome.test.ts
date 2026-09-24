import { MEMBERS_GROUP_ID, type CommentDto, type LabelCountDto, type PageDto, type PageItemDto, type StarredDto } from '@quire/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as t from '../src/db/schema.ts'
import { signedIn, testApp, type Client } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'

type Person = Client & { user: { id: string } }

let app: ReturnType<typeof testApp>
let owner: Person
let member: Person

const body = async <T>(res: Response) => (await res.json()) as T
const db = () => testDb().db

beforeEach(async () => {
  app = testApp()
  await db().insert(t.groups).values({ id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true })
  owner = await signedIn(app, { name: 'Olive Owner' })
  member = await signedIn(app, { name: 'Max Member' })
  await owner.post('/api/spaces', { key: 'ENG', name: 'Engineering' })
})

async function page(who: Person = owner, over: Record<string, unknown> = {}, publish = true) {
  const created = await body<PageDto>(await who.post('/api/pages', { spaceKey: 'ENG', title: 'Plan', html: '<p>Body</p>', ...over }))
  if (!publish) return created
  return body<PageDto>(await who.post(`/api/pages/${created.id}/publish`, {}, { 'if-match': `${created.lockVersion}` }))
}

async function restrictToOwner(pageId: string) {
  await owner.put(`/api/pages/${pageId}/restrictions`, { view: [{ type: 'user', id: owner.user.id }], edit: [] })
}

describe('comments', () => {
  it('threads replies one level deep, even when replying to a reply', async () => {
    const p = await page()
    const top = await body<CommentDto>(await member.post(`/api/pages/${p.id}/comments`, { body: 'Question?', anchorText: 'Body' }))
    expect(top).toMatchObject({ body: 'Question?', anchorText: 'Body', parentId: null, resolved: false, edited: false, deleted: false })
    const reply = await body<CommentDto>(await owner.post(`/api/comments/${top.id}/replies`, { body: 'Answer' }))
    const nested = await body<CommentDto>(await member.post(`/api/comments/${reply.id}/replies`, { body: 'Thanks' }))
    expect(nested.parentId).toBe(top.id)
    const threads = await body<CommentDto[]>(await member.get(`/api/pages/${p.id}/comments`))
    expect(threads).toHaveLength(1)
    expect(threads[0].replies.map((r) => r.body)).toEqual(['Answer', 'Thanks'])
  })

  it('lets authors edit, and authors or space admins delete', async () => {
    const p = await page()
    const mine = await body<CommentDto>(await member.post(`/api/pages/${p.id}/comments`, { body: 'Typo' }))
    expect((await owner.patch(`/api/comments/${mine.id}`, { body: 'Hijack' })).status).toBe(403)
    const edited = await body<CommentDto>(await member.patch(`/api/comments/${mine.id}`, { body: 'Fixed' }))
    expect(edited).toMatchObject({ body: 'Fixed', edited: true })

    const theirs = await body<CommentDto>(await owner.post(`/api/pages/${p.id}/comments`, { body: 'Owner note' }))
    expect((await member.delete(`/api/comments/${theirs.id}`)).status).toBe(403)
    expect((await owner.delete(`/api/comments/${mine.id}`)).status).toBe(204)
    expect((await owner.delete(`/api/comments/${mine.id}`)).status).toBe(404)
    expect((await body<CommentDto[]>(await member.get(`/api/pages/${p.id}/comments`))).map((c) => c.body)).toEqual(['Owner note'])
  })

  it('keeps a deleted comment as a placeholder while it has replies', async () => {
    const p = await page()
    const top = await body<CommentDto>(await member.post(`/api/pages/${p.id}/comments`, { body: 'Start', anchorText: 'Body' }))
    const reply = await body<CommentDto>(await owner.post(`/api/comments/${top.id}/replies`, { body: 'Reply' }))
    await member.delete(`/api/comments/${top.id}`)
    const [thread] = await body<CommentDto[]>(await owner.get(`/api/pages/${p.id}/comments`))
    expect(thread).toMatchObject({ deleted: true, body: '', anchorText: null, replies: [expect.objectContaining({ body: 'Reply' })] })
    await owner.delete(`/api/comments/${reply.id}`)
    expect(await body<CommentDto[]>(await owner.get(`/api/pages/${p.id}/comments`))).toEqual([])
  })

  it('resolves and reopens threads, not replies', async () => {
    const p = await page()
    const top = await body<CommentDto>(await member.post(`/api/pages/${p.id}/comments`, { body: 'Done?' }))
    const reply = await body<CommentDto>(await owner.post(`/api/comments/${top.id}/replies`, { body: 'Yes' }))
    const resolved = await body<CommentDto>(await owner.post(`/api/comments/${top.id}/resolve`))
    expect(resolved).toMatchObject({ resolved: true, replies: [expect.objectContaining({ id: reply.id })] })
    expect((await body<CommentDto>(await owner.post(`/api/comments/${top.id}/reopen`))).resolved).toBe(false)
    expect(await (await owner.post(`/api/comments/${reply.id}/resolve`)).json()).toMatchObject({ code: 'reply' })
  })

  it('follows page permissions', async () => {
    const p = await page()
    const top = await body<CommentDto>(await owner.post(`/api/pages/${p.id}/comments`, { body: 'Hidden soon' }))
    await restrictToOwner(p.id)
    expect((await member.get(`/api/pages/${p.id}/comments`)).status).toBe(403)
    expect((await member.post(`/api/comments/${top.id}/replies`, { body: 'x' })).status).toBe(403)

    const open = await page()
    const c = await body<CommentDto>(await owner.post(`/api/pages/${open.id}/comments`, { body: 'Hi' }))
    await owner.put('/api/spaces/ENG/permissions', { grants: [{ principalType: 'group', principalId: MEMBERS_GROUP_ID, perms: ['View'] }] })
    expect((await member.get(`/api/pages/${open.id}/comments`)).status).toBe(200)
    expect((await member.post(`/api/pages/${open.id}/comments`, { body: 'x' })).status).toBe(403)
    expect((await member.post(`/api/comments/${c.id}/replies`, { body: 'x' })).status).toBe(403)
    expect((await member.post(`/api/comments/${c.id}/resolve`)).status).toBe(403)
    expect((await owner.post(`/api/pages/${open.id}/comments`, { body: '  ' })).status).toBe(400)
  })
})

describe('labels', () => {
  it('normalizes, dedupes and replaces a page’s labels', async () => {
    const p = await page()
    const res = await member.put(`/api/pages/${p.id}/labels`, { labels: ['Architecture', 'on call', 'architecture'] })
    expect(await res.json()).toEqual(['architecture', 'on-call'])
    expect((await body<PageDto>(await member.get(`/api/pages/${p.id}`))).labels).toEqual(['architecture', 'on-call'])
    expect((await member.put(`/api/pages/${p.id}/labels`, { labels: ['no!'] })).status).toBe(400)
    expect(await (await member.put(`/api/pages/${p.id}/labels`, { labels: [] })).json()).toEqual([])
  })

  it('suggests labels from pages the person can see', async () => {
    const a = await page()
    const b = await page()
    const hidden = await page()
    await owner.put(`/api/pages/${a.id}/labels`, { labels: ['infra', 'api'] })
    await owner.put(`/api/pages/${b.id}/labels`, { labels: ['infra'] })
    await owner.put(`/api/pages/${hidden.id}/labels`, { labels: ['secret', 'infra'] })
    await restrictToOwner(hidden.id)
    expect(await body<LabelCountDto[]>(await member.get('/api/labels'))).toEqual([
      { name: 'infra', count: 2 },
      { name: 'api', count: 1 },
    ])
    expect(await body<LabelCountDto[]>(await owner.get('/api/labels?q=IN'))).toEqual([{ name: 'infra', count: 3 }])
    expect(await body<LabelCountDto[]>(await member.get('/api/labels?q=_'))).toEqual([])
  })
})

describe('home lists', () => {
  it('lists recent views newest first, hiding pages that became invisible', async () => {
    const a = await page(owner, { title: 'A' })
    const b = await page(owner, { title: 'B' })
    expect((await member.post(`/api/pages/${a.id}/views`)).status).toBe(204)
    await member.post(`/api/pages/${b.id}/views`)
    await member.post(`/api/pages/${a.id}/views`)
    const recent = await body<PageItemDto[]>(await member.get('/api/me/recent'))
    expect(recent.map((r) => r.title)).toEqual(['A', 'B'])
    expect(recent[0]).toMatchObject({ spaceKey: 'ENG', spaceName: 'Engineering', status: 'published', hasDraft: false })
    expect(recent[0].viewedAt).not.toBeNull()
    await restrictToOwner(a.id)
    expect((await body<PageItemDto[]>(await member.get('/api/me/recent'))).map((r) => r.title)).toEqual(['B'])
  })

  it('lists starred spaces and pages the person can still see', async () => {
    const a = await page(owner, { title: 'A' })
    const b = await page(owner, { title: 'B' })
    await member.put(`/api/pages/${a.id}/star`)
    await member.put(`/api/pages/${b.id}/star`)
    await member.put('/api/spaces/ENG/star')
    await restrictToOwner(b.id)
    const starred = await body<StarredDto>(await member.get('/api/me/starred'))
    expect(starred.spaces.map((s) => s.key)).toEqual(['ENG'])
    expect(starred.pages.map((p) => p.title)).toEqual(['A'])
    await owner.post(`/api/pages/${a.id}/archive`)
    expect((await body<StarredDto>(await member.get('/api/me/starred'))).pages).toEqual([])
  })

  it('lists the person’s unpublished work', async () => {
    const draft = await page(member, { title: 'My draft' }, false)
    const pub = await page(owner, { title: 'Shared' })
    await member.put(`/api/pages/${pub.id}/draft`, { html: '<p>edit</p>' })
    await page(owner, { title: 'Owner draft' }, false)
    const drafts = await body<PageItemDto[]>(await member.get('/api/me/drafts'))
    expect(drafts.map((d) => [d.title, d.status, d.hasDraft])).toEqual([
      ['Shared', 'published', true],
      ['My draft', 'draft', false],
    ])
    await db().update(t.pageDrafts).set({ updatedById: owner.user.id }).where(eq(t.pageDrafts.pageId, pub.id))
    expect((await body<PageItemDto[]>(await member.get('/api/me/drafts'))).map((d) => d.id)).toEqual([draft.id])
  })
})
