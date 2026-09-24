import { relativeTime, type SpaceCreate, type SpaceDto, type SpaceGrantDto, type SpacePatch, type SpacePermission } from '@quire/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '../lib/apiClient'
import type { Space } from '../types'

export const spacesKey = ['spaces'] as const
export const spacePermissionsKey = (spaceId: string) => ['spaces', spaceId, 'permissions'] as const

/** The web's Space model from the API's DTO. */
export function toSpace(dto: SpaceDto): Space {
  return {
    id: dto.id,
    key: dto.key,
    name: dto.name,
    icon: dto.icon,
    description: dto.description,
    memberCount: dto.memberCount,
    pageCount: dto.pageCount,
    lastActivity: relativeTime(dto.lastActivityAt),
    starred: dto.starred,
    watched: dto.watched,
    archived: dto.archived,
    ownerId: dto.ownerId,
    myPermissions: dto.myPermissions,
  }
}

/** Every space the signed-in person can see, archived ones included. */
export function useSpaces() {
  return useQuery({ queryKey: spacesKey, queryFn: () => api.get<SpaceDto[]>('/spaces') })
}

export function useSpaceList(): Space[] {
  const { data } = useSpaces()
  return useMemo(() => (data ?? []).map(toSpace), [data])
}

/** One space by id or key, from the list: undefined while loading or when the person can't see it. */
export function useSpace(spaceId: string | undefined): Space | undefined {
  const spaces = useSpaceList()
  return useMemo(() => spaces.find((s) => s.id === spaceId || s.key === spaceId?.toUpperCase()), [spaces, spaceId])
}

export function useSpaceLoading() {
  return useSpaces().isPending
}

function useSpacesMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, optimistic?: (spaces: SpaceDto[], vars: TVars) => SpaceDto[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars) => {
      if (!optimistic) return undefined
      await qc.cancelQueries({ queryKey: spacesKey })
      const previous = qc.getQueryData<SpaceDto[]>(spacesKey)
      if (previous) qc.setQueryData(spacesKey, optimistic(previous, vars))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(spacesKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: spacesKey }),
  })
}

const patchOne = (spaces: SpaceDto[], id: string, patch: Partial<SpaceDto>) => spaces.map((s) => (s.id === id ? { ...s, ...patch } : s))

export function useToggleSpaceStar() {
  return useSpacesMutation(
    (space: Pick<Space, 'id' | 'starred'>) => (space.starred ? api.delete(`/spaces/${space.id}/star`) : api.put(`/spaces/${space.id}/star`)),
    (spaces, space) => patchOne(spaces, space.id, { starred: !space.starred }),
  )
}

export function useToggleSpaceWatch() {
  return useSpacesMutation(
    (space: Pick<Space, 'id' | 'watched'>) => (space.watched ? api.delete(`/spaces/${space.id}/watch`) : api.put(`/spaces/${space.id}/watch`)),
    (spaces, space) => patchOne(spaces, space.id, { watched: !space.watched }),
  )
}

export function useCreateSpace() {
  return useSpacesMutation((input: SpaceCreate) => api.post<SpaceDto>('/spaces', input))
}

export function useUpdateSpace() {
  return useSpacesMutation(({ id, patch }: { id: string; patch: SpacePatch }) => api.patch<SpaceDto>(`/spaces/${id}`, patch))
}

export function useSetSpaceArchived() {
  return useSpacesMutation(
    ({ id, archived }: { id: string; archived: boolean }) => api.post<SpaceDto>(`/spaces/${id}/${archived ? 'archive' : 'unarchive'}`),
    (spaces, { id, archived }) => patchOne(spaces, id, { archived }),
  )
}

export function useDeleteSpace() {
  return useSpacesMutation(
    (id: string) => api.delete(`/spaces/${id}`),
    (spaces, id) => spaces.filter((s) => s.id !== id),
  )
}

/** The permission matrix; only space admins may read it. */
export function useSpacePermissions(spaceId: string, enabled: boolean) {
  return useQuery({ queryKey: spacePermissionsKey(spaceId), queryFn: () => api.get<SpaceGrantDto[]>(`/spaces/${spaceId}/permissions`), enabled })
}

/** Turn one permission on or off for one principal, sending the whole matrix back. */
export function useSetSpacePermission(spaceId: string) {
  const qc = useQueryClient()
  const key = spacePermissionsKey(spaceId)
  return useMutation({
    mutationFn: (change: { principalType: 'user' | 'group'; principalId: string; permission: SpacePermission; granted: boolean }) => {
      const grants = qc.getQueryData<SpaceGrantDto[]>(key) ?? []
      return api.put<SpaceGrantDto[]>(`/spaces/${spaceId}/permissions`, { grants: applyChange(grants, change) })
    },
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<SpaceGrantDto[]>(key)
      if (previous) qc.setQueryData(key, applyChange(previous, change))
      return { previous }
    },
    onError: (_err, _change, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (grants) => qc.setQueryData(key, grants),
    onSettled: () => qc.invalidateQueries({ queryKey: spacesKey }),
  })
}

function applyChange(
  grants: SpaceGrantDto[],
  change: { principalType: 'user' | 'group'; principalId: string; permission: SpacePermission; granted: boolean },
): SpaceGrantDto[] {
  const existing = grants.find((g) => g.principalType === change.principalType && g.principalId === change.principalId)
  const perms = new Set(existing?.perms ?? [])
  if (change.granted) perms.add(change.permission)
  else perms.delete(change.permission)
  const row = { principalType: change.principalType, principalId: change.principalId, name: existing?.name ?? change.principalId, perms: [...perms] }
  return existing ? grants.map((g) => (g === existing ? row : g)) : [...grants, row]
}
