import { MEMBERS_GROUP_ID } from '@quire/shared'
import { pagesContract, sessionContract, spacesContract, type ContractTarget } from '@quire/shared/contract'
import { beforeEach } from 'vitest'
import * as t from '../src/db/schema.ts'
import { createUserWithPassword } from '../src/services/users.ts'
import { captureMailer, client, PASSWORD, testApp } from './helpers/app.ts'
import { testDb } from './helpers/db.ts'

// The same suite runs against the web tests' fake backend (quire-web/tests/fakeApi).
let target: ContractTarget

beforeEach(async () => {
  const mailer = captureMailer()
  const app = testApp(mailer)
  await testDb().db.insert(t.groups).values({ id: MEMBERS_GROUP_ID, name: 'All members', isSystem: true })
  const admin = await createUserWithPassword(testDb().db, { email: 'ada@example.com', name: 'Ada Admin', password: PASSWORD, siteRole: 'admin' })
  target = {
    newClient: () => client(app),
    admin: { email: admin.email, password: PASSWORD },
    lastMailTo: async (to) => mailer.sent.findLast((m) => m.to === to)?.text ?? '',
  }
})

sessionContract(() => target)
spacesContract(() => target)
pagesContract(() => target)
