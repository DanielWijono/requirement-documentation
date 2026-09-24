import type { GroupDto, UserDto } from '@quire/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useSession } from '../hooks/useSession'
import { api } from '../lib/apiClient'

export const usersKey = ['users'] as const

/** Everyone active in the workspace (the API caps the list at 500). */
export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: () => api.get<UserDto[]>('/users'), staleTime: 5 * 60_000 })
}

export function useUserList(): UserDto[] {
  return useUsers().data ?? EMPTY
}

const EMPTY: UserDto[] = []

/** Shown for ids that are no longer in the list, e.g. someone deactivated. */
export function unknownUser(id: string): UserDto {
  return { id, name: 'Unknown person', email: '', initials: '?', colorSeed: 0, siteRole: 'member', deactivated: true }
}

/** Look people up by id. Always returns someone, so rendering never has to branch on loading. */
export function useUserLookup(): (id: string) => UserDto {
  const users = useUserList()
  const me = useSession().data
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  return useCallback((id: string) => byId.get(id) ?? (me && me.id === id ? me : unknownUser(id)), [byId, me])
}

/** Groups, for the permission matrix and share dialog. The members group comes first. */
export function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: () => api.get<GroupDto[]>('/groups'), staleTime: 5 * 60_000 })
}
