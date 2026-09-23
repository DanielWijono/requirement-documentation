import { describe, expect, it } from 'vitest'
import { runMigrations } from '../src/db/migrate.ts'
import { testDb } from './helpers/db.ts'

describe('runMigrations', () => {
  it('can run again on an already migrated database', async () => {
    await expect(runMigrations(testDb().db)).resolves.toBeUndefined()
  })
})
