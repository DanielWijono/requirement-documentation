import { afterAll, beforeEach } from 'vitest'
import { TEMPLATE_DB, TEST_DB, closeTestDb, recreateDatabase, testDb, truncateAll } from './helpers/db.ts'

await recreateDatabase(TEST_DB, TEMPLATE_DB)

beforeEach(() => truncateAll(testDb().sql))
afterAll(closeTestDb)
