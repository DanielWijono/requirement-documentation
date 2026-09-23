import { z } from 'zod'

/** Every API error body: a stable machine code plus a message safe to show to people. */
export const apiErrorSchema = z.object({ code: z.string(), message: z.string() })
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const healthSchema = z.object({ ok: z.boolean(), db: z.enum(['up', 'down']) })
export type Health = z.infer<typeof healthSchema>

// ---------------------------------------------------------------------------
// People

export const SITE_ROLES = ['admin', 'member'] as const
export type SiteRole = (typeof SITE_ROLES)[number]
export const MIN_PASSWORD_LENGTH = 10
/** Every active user belongs to this group without a membership row. */
export const MEMBERS_GROUP_ID = 'group.members'

export interface UserDto {
  id: string
  name: string
  email: string
  initials: string
  colorSeed: number
  siteRole: SiteRole
  deactivated: boolean
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)
  return letters.toUpperCase()
}

const email = z.email().transform((v) => v.toLowerCase())
const displayName = z.string().trim().min(1).max(80)
const password = z.string().min(MIN_PASSWORD_LENGTH).max(200)

export const inviteCreateSchema = z.object({ email, siteRole: z.enum(SITE_ROLES).default('member') })
export type InviteCreate = z.input<typeof inviteCreateSchema>

export const inviteAcceptSchema = z.object({ name: displayName, password })
export type InviteAccept = z.infer<typeof inviteAcceptSchema>

export interface InviteDto {
  id: string
  email: string
  siteRole: SiteRole
  invitedBy: string
  expiresAt: string
}

/** What the accept-invite screen shows before the person picks a name and password. */
export interface InviteLookupDto {
  email: string
  inviterName: string
  expiresAt: string
}

export const userUpdateSchema = z
  .object({ siteRole: z.enum(SITE_ROLES).optional(), deactivated: z.boolean().optional() })
  .refine((v) => v.siteRole !== undefined || v.deactivated !== undefined, 'Nothing to update')
export type UserUpdate = z.infer<typeof userUpdateSchema>

const groupDescription = z.string().trim().max(500)
export const groupInputSchema = z.object({ name: displayName, description: groupDescription.default('') })
export type GroupInput = z.input<typeof groupInputSchema>
/** A partial update: fields left out stay as they are. */
export const groupPatchSchema = z.object({ name: displayName.optional(), description: groupDescription.optional() })
export type GroupPatch = z.infer<typeof groupPatchSchema>

export const groupMembersSchema = z.object({ userIds: z.array(z.string().min(1)).max(1000) })

export interface GroupDto {
  id: string
  name: string
  description: string
  isSystem: boolean
  memberCount: number
}

export interface GroupDetailDto extends GroupDto {
  members: UserDto[]
}
