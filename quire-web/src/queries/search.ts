import type { QuickSearchDto, SearchQuery, SearchResponseDto } from '@quire/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/apiClient'

export function useSearch(params: SearchQuery) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  return useQuery({
    queryKey: ['search', 'full', qs.toString()],
    queryFn: ({ signal }) => api.get<SearchResponseDto>(`/search?${qs}`, { signal }),
    // Keep showing the last results while the next ones load, so typing doesn't flash empty.
    placeholderData: keepPreviousData,
  })
}

export function useQuickSearch(q: string, spaceId?: string | null) {
  const query = q.trim()
  const scope = spaceId ? `&space=${encodeURIComponent(spaceId)}` : ''
  return useQuery({
    queryKey: ['search', 'quick', query, spaceId ?? null],
    queryFn: ({ signal }) => api.get<QuickSearchDto>(`/search/quick?q=${encodeURIComponent(query)}${scope}`, { signal }),
    enabled: query !== '',
    placeholderData: keepPreviousData,
  })
}
