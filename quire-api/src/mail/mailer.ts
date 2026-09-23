import nodemailer from 'nodemailer'
import type { Env } from '../env.ts'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Sends through any SMTP server: Mailpit in development, a real provider in production. */
export function smtpMailer(env: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'MAIL_FROM'>): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })
  return {
    async send(mail) {
      await transport.sendMail({ from: env.MAIL_FROM, ...mail })
    },
  }
}
