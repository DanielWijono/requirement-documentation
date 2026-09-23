import { z } from 'zod'

/** Every API error body: a stable machine code plus a message safe to show to people. */
export const apiErrorSchema = z.object({ code: z.string(), message: z.string() })
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const healthSchema = z.object({ ok: z.boolean(), db: z.enum(['up', 'down']) })
export type Health = z.infer<typeof healthSchema>
