const MAILPIT = process.env.TEST_MAILPIT_URL ?? 'http://localhost:8025'

interface MailpitMessage {
  Subject: string
  Text: string
  HTML: string
}

/** The newest email Mailpit caught for `to`, waiting briefly for SMTP delivery. */
export async function latestMailTo(to: string): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`)
    if (!search.ok) throw new Error(`Mailpit search failed (${search.status}). Is Mailpit running on ${MAILPIT}?`)
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages.length) return (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as MailpitMessage
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`No email for ${to} reached Mailpit`)
}

export function linkIn(text: string, pattern: RegExp): string {
  const match = pattern.exec(text)
  if (!match) throw new Error(`No link matching ${pattern} in:\n${text}`)
  return match[0]
}
