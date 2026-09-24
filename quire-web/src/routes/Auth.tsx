import { MIN_PASSWORD_LENGTH, type InviteLookupDto } from '@quire/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { sessionKey, useSession, useSignIn } from '../hooks/useSession'
import { api, ApiError } from '../lib/apiClient'
import { safeNext } from '../lib/safeNext'

const inputClass = 't-ui-md w-full h-9 px-2 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-bg-canvas)'

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.offline) return err.message
    if (err.status === 429) return 'Too many attempts. Wait a minute and try again.'
  }
  return fallback
}

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-(--color-bg-subtle) px-4">
      <div className="w-full max-w-[380px] rounded-(--radius-md) border border-(--color-border-default) bg-(--color-bg-canvas) p-6 flex flex-col gap-4">
        <p className="t-ui-md-medium text-(--color-text-secondary)">Quire</p>
        <h1 className="t-content-h2">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="t-ui-sm-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="t-ui-sm text-(--color-text-secondary)">{hint}</p>}
    </div>
  )
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="t-ui-sm text-(--status-danger-text,#B83A2A)">
      {children}
    </p>
  )
}

export function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const session = useSession()
  const signIn = useSignIn()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (session.data) return <Navigate to={next} replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    signIn.mutate({ email, password }, { onSuccess: () => navigate(next, { replace: true }) })
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}</Field>
        <Field label="Password">
          {(id) => <input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />}
        </Field>
        {signIn.isError && <FormError>{messageFor(signIn.error, 'That email and password don’t match.')}</FormError>}
        <Button type="submit" variant="primary" size="touch" loading={signIn.isPending}>
          Sign in
        </Button>
      </form>
      <Link to="/forgot-password" className="t-ui-sm text-(--color-text-link) hover:underline self-start">
        Forgot your password?
      </Link>
    </AuthLayout>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<unknown>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      await api.post('/auth/request-password-reset', { email })
      setState('sent')
    } catch (err) {
      setError(err)
      setState('error')
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {state === 'sent' ? (
        // The same answer whether or not the address has an account, so it can't be used to probe.
        <p className="t-ui-md" role="status">
          If {email} has a Quire account, we sent it a link to choose a new password. The link works for an hour.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}</Field>
          {state === 'error' && <FormError>{messageFor(error, 'Something went wrong. Try again.')}</FormError>}
          <Button type="submit" variant="primary" size="touch" loading={state === 'sending'}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="t-ui-sm text-(--color-text-link) hover:underline self-start">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}

function NewPasswordFields({ password, setPassword, confirm, setConfirm }: { password: string; setPassword: (v: string) => void; confirm: string; setConfirm: (v: string) => void }) {
  return (
    <>
      <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        {(id) => <input id={id} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Confirm password">
        {(id) => <input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />}
      </Field>
    </>
  )
}

function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password !== confirm) return 'The passwords don’t match.'
  return null
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const local = passwordProblem(password, confirm)
    setProblem(local)
    if (local) return
    setState('saving')
    try {
      await api.post('/auth/reset-password', { newPassword: password, token })
      setState('done')
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 400 ? 'This reset link has expired or was already used. Ask for a new one.' : messageFor(err, 'Something went wrong. Try again.'))
      setState('idle')
    }
  }

  if (!token) return <Navigate to="/forgot-password" replace />
  return (
    <AuthLayout title="Choose a new password">
      {state === 'done' ? (
        <>
          <p className="t-ui-md" role="status">
            Your password is changed, and you’re signed out everywhere else.
          </p>
          <Link to="/login" className="t-ui-md text-(--color-text-link) hover:underline self-start">
            Sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <NewPasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
          {problem && <FormError>{problem}</FormError>}
          <Button type="submit" variant="primary" size="touch" loading={state === 'saving'}>
            Change password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function AcceptInvite() {
  const { token = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<InviteLookupDto>(`/invites/${encodeURIComponent(token)}`) })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const local = name.trim() ? passwordProblem(password, confirm) : 'Enter your name.'
    setProblem(local)
    if (local) return
    setSaving(true)
    try {
      await api.post(`/invites/${encodeURIComponent(token)}/accept`, { name: name.trim(), password })
      qc.clear()
      await qc.invalidateQueries({ queryKey: sessionKey })
      navigate('/', { replace: true })
    } catch (err) {
      setProblem(messageFor(err, err instanceof ApiError && err.status === 410 ? 'This invite has expired or was already used.' : 'Something went wrong. Try again.'))
      setSaving(false)
    }
  }

  if (invite.isPending) return <AuthLayout title="Join Quire">{null}</AuthLayout>
  if (invite.isError) {
    const gone = invite.error instanceof ApiError && (invite.error.status === 410 || invite.error.status === 404)
    return (
      <AuthLayout title="This invite can’t be used">
        <p className="t-ui-md">{gone ? 'It has expired, was already used, or the link is incomplete. Ask whoever invited you to send a new one.' : messageFor(invite.error, 'Something went wrong loading the invite.')}</p>
        <Link to="/login" className="t-ui-sm text-(--color-text-link) hover:underline self-start">
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Join Quire">
      <p className="t-ui-md text-(--color-text-secondary)">
        {invite.data.inviterName} invited {invite.data.email}.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Your name">{(id) => <input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}</Field>
        <NewPasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
        {problem && <FormError>{problem}</FormError>}
        <Button type="submit" variant="primary" size="touch" loading={saving}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
