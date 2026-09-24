import type { UserDto } from '@quire/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/apiClient'

export const sessionKey = ['session'] as const

/** The signed-in person, or null when signed out. Errors other than 401 surface as query errors. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async (): Promise<UserDto | null> => {
      try {
        return await api.get<UserDto>('/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60_000,
  })
}

/** The signed-in person inside routes behind `RequireSession`. */
export function useCurrentUser(): UserDto {
  const { data } = useSession()
  if (!data) throw new Error('useCurrentUser used outside RequireSession')
  return data
}

export function useSignIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.post('/auth/sign-in/email', input),
    onSuccess: async () => {
      qc.clear()
      await qc.fetchQuery({ queryKey: sessionKey, queryFn: () => api.get<UserDto>('/me') })
    },
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/sign-out'),
    // Whatever the server said, forget everything this person could see.
    onSettled: () => {
      qc.clear()
      qc.setQueryData(sessionKey, null)
    },
  })
}
