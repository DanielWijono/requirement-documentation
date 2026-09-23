import { describe, expect, it, vi } from 'vitest'
import { TEST_DB, testDb, truncateAll } from './helpers/db.ts'

describe('test database harness', () => {
  it('connects each worker to its own database', async () => {
    const [{ name }] = await testDb().sql<{ name: string }[]>`select current_database() as name`
    expect(name).toBe(TEST_DB)
  })

  it('empties public tables between tests', async () => {
    const { sql } = testDb()
    await sql`create table if not exists harness_probe (id serial primary key)`
    await sql`insert into harness_probe default values`
    await truncateAll(sql)
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from harness_probe`
    expect(count).toBe(0)
    await sql`drop table harness_probe`
  })
})

describe('createDb', () => {
  it('keeps server notices out of the log', async () => {
    const spy = vi.spyOn(console, 'log')
    await testDb().sql`do $$ begin raise notice 'quiet please'; end $$`
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
