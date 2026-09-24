import { relativeTime, type CommentCreate, type CommentDto } from '@quire/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/apiClient'
import type { Comment } from '../types'

export const commentsKey = (pageId: string) => ['page', pageId, 'comments'] as const

/** The web's Comment model: a deleted thread keeps its replies with an empty placeholder body. */
export function toComment(dto: CommentDto): Comment & { deleted: boolean; edited: boolean } {
  return {
    id: dto.id,
    authorId: dto.authorId,
    body: dto.body,
    relativeTime: relativeTime(dto.createdAt),
    resolved: dto.resolved,
    anchorText: dto.anchorText ?? undefined,
    replies: dto.replies.map(toComment),
    deleted: dto.deleted,
    edited: dto.edited,
  }
}

export function useComments(pageId: string) {
  return useQuery({ queryKey: commentsKey(pageId), queryFn: () => api.get<CommentDto[]>(`/pages/${pageId}/comments`), select: (rows) => rows.map(toComment) })
}

function useCommentMutation<V>(pageId: string, fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: commentsKey(pageId) }) })
}

export const useAddComment = (pageId: string) => useCommentMutation(pageId, (input: CommentCreate) => api.post<CommentDto>(`/pages/${pageId}/comments`, input))
export const useReply = (pageId: string) =>
  useCommentMutation(pageId, ({ commentId, body }: { commentId: string; body: string }) => api.post<CommentDto>(`/comments/${commentId}/replies`, { body }))
export const useResolveComment = (pageId: string) =>
  useCommentMutation(pageId, ({ commentId, resolved }: { commentId: string; resolved: boolean }) => api.post<CommentDto>(`/comments/${commentId}/${resolved ? 'resolve' : 'reopen'}`))
export const useEditComment = (pageId: string) =>
  useCommentMutation(pageId, ({ commentId, body }: { commentId: string; body: string }) => api.patch<CommentDto>(`/comments/${commentId}`, { body }))
export const useDeleteComment = (pageId: string) => useCommentMutation(pageId, (commentId: string) => api.delete(`/comments/${commentId}`))
