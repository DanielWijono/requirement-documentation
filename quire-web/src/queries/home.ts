import type { LabelCountDto, PageItemDto, StarredDto } from '@quire/shared'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

/** Everything under ['home'] is refreshed whenever a page changes (see `refreshPage`). */
export const homeKeys = {
  recent: ['home', 'recent'] as const,
  starred: ['home', 'starred'] as const,
  drafts: ['home', 'drafts'] as const,
  labels: (spaceId?: string) => ['home', 'labels', spaceId ?? null] as const,
}

export const useRecentPages = () => useQuery({ queryKey: homeKeys.recent, queryFn: () => api.get<PageItemDto[]>('/me/recent') })
export const useStarred = () => useQuery({ queryKey: homeKeys.starred, queryFn: () => api.get<StarredDto>('/me/starred') })
export const useMyDrafts = () => useQuery({ queryKey: homeKeys.drafts, queryFn: () => api.get<PageItemDto[]>('/me/drafts') })
export const useLabels = (spaceId?: string) =>
  useQuery({ queryKey: homeKeys.labels(spaceId), queryFn: () => api.get<LabelCountDto[]>(spaceId ? `/labels?space=${encodeURIComponent(spaceId)}` : '/labels') })
