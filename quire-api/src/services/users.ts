import { initialsOf, type SiteRole, type UserDto } from '@quire/shared'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import type { Db, Queryable } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { conflict } from '../lib/errors.ts'

type UserRow = Pick<typeof t.user.$inferSelect, 'id' | 'name' | 'email' | 'colorSeed' | 'siteRole' | 'deactivatedAt'>

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    initials: initialsOf(row.name),
    colorSeed: row.colorSeed,
    siteRole: row.siteRole,
    deactivated: row.deactivatedAt !== null && row.deactivatedAt !== undefined,
  }
}

export const userColumns = {
  id: t.user.id,
  name: t.user.name,
  email: t.user.email,
  colorSeed: t.user.colorSeed,
  siteRole: t.user.siteRole,
  deactivatedAt: t.user.deactivatedAt,
}

/** Avatar colours cycle through eight seeds (see tokens.css). */
export function randomColorSeed() {
  return 1 + Math.floor(Math.random() * 8)
}

export interface NewAccount {
  email: string
  name: string
  password: string
  siteRole: SiteRole
  id?: string
  colorSeed?: number
}

/** Create a person with an email + password login. `tx` may be a transaction. */
export async function createUserWithPassword(tx: Queryable, input: NewAccount) {
  const email = input.email.toLowerCase()
  const [existing] = await tx.select({ id: t.user.id }).from(t.user).where(eq(t.user.email, email))
  if (existing) throw conflict('email_taken', 'An account with that email already exists')
  const id = input.id ?? crypto.randomUUID()
  const [row] = await tx
    .insert(t.user)
    .values({ id, email, name: input.name, emailVerified: true, siteRole: input.siteRole, colorSeed: input.colorSeed ?? randomColorSeed() })
    .returning()
  await tx.insert(t.account).values({ accountId: id, providerId: 'credential', userId: id, password: await hashPassword(input.password) })
  return row
}

/** First-run setup: create the first site admin. Refuses once any admin exists. */
export async function bootstrapAdmin(db: Db, input: Omit<NewAccount, 'siteRole'>) {
  return db.transaction(async (tx) => {
    const [admin] = await tx.select({ id: t.user.id }).from(t.user).where(eq(t.user.siteRole, 'admin')).limit(1)
    if (admin) throw conflict('admin_exists', 'A site admin already exists; invite more people from the app')
    return createUserWithPassword(tx, { ...input, siteRole: 'admin' })
  })
}
