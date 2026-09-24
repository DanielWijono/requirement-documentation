import type { GroupDetailDto, InviteCreate, InviteDto, SiteRole, UserDto } from '@quire/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import { usersKey } from './users'

/** Site administration: people, invites and groups. The API only lets site admins change these. */

export const adminKeys = {
  people: ['admin', 'people'] as const,
  invites: ['admin', 'invites'] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
}

/** Everyone, deactivated people included. */
export const usePeople = () => useQuery({ queryKey: adminKeys.people, queryFn: () => api.get<UserDto[]>('/users?includeDeactivated=1') })
export const useInvites = () => useQuery({ queryKey: adminKeys.invites, queryFn: () => api.get<InviteDto[]>('/invites') })
export const useGroupDetail = (id: string | null) =>
  useQuery({ queryKey: adminKeys.group(id ?? ''), queryFn: () => api.get<GroupDetailDto>(`/groups/${id}`), enabled: Boolean(id) })

function useAdminMutation<V, R>(fn: (vars: V) => Promise<R>, keys: readonly (readonly unknown[])[]) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))) })
}

export const useSendInvite = () => useAdminMutation((input: InviteCreate) => api.post<InviteDto>('/invites', input), [adminKeys.invites])
export const useRevokeInvite = () => useAdminMutation((id: string) => api.delete(`/invites/${id}`), [adminKeys.invites])

export const useUpdatePerson = () =>
  useAdminMutation(
    ({ id, patch }: { id: string; patch: { siteRole?: SiteRole; deactivated?: boolean } }) => api.patch<UserDto>(`/users/${id}`, patch),
    [adminKeys.people, usersKey, adminKeys.groups],
  )

export const useCreateGroup = () => useAdminMutation((input: { name: string; description?: string }) => api.post<GroupDetailDto>('/groups', input), [adminKeys.groups])
export const useRenameGroup = () =>
  useAdminMutation(({ id, name, description }: { id: string; name?: string; description?: string }) => api.patch<GroupDetailDto>(`/groups/${id}`, { name, description }), [adminKeys.groups])
export const useDeleteGroup = () => useAdminMutation((id: string) => api.delete(`/groups/${id}`), [adminKeys.groups])
export const useSetGroupMembers = () =>
  useAdminMutation(({ id, userIds }: { id: string; userIds: string[] }) => api.put<GroupDetailDto>(`/groups/${id}/members`, { userIds }), [adminKeys.groups])

