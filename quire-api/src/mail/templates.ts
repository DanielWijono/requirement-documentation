import type { Mail } from './mailer.ts'

function escape(text: string) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function layout(paragraphs: string[], action: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')
  return `<div style="font-family:system-ui,sans-serif;max-width:480px">${body}<p><a href="${escape(action.url)}">${escape(action.label)}</a></p></div>`
}

export function inviteEmail(to: string, inviterName: string, url: string): Mail {
  const lines = [`${inviterName} invited you to Quire, your team's documentation space.`, 'The link works for 7 days.']
  return {
    to,
    subject: `${inviterName} invited you to Quire`,
    text: `${lines.join('\n\n')}\n\nAccept the invite: ${url}\n`,
    html: layout(lines, { label: 'Accept the invite', url }),
  }
}

export function resetPasswordEmail(to: string, name: string, url: string): Mail {
  const lines = [`Hi ${name},`, 'Someone asked to reset the password for your Quire account. If it was not you, ignore this email.', 'The link works for 1 hour.']
  return {
    to,
    subject: 'Reset your Quire password',
    text: `${lines.join('\n\n')}\n\nChoose a new password: ${url}\n`,
    html: layout(lines, { label: 'Choose a new password', url }),
  }
}
