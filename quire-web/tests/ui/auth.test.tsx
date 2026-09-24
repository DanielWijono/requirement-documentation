import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { SEED_PASSWORD } from '@quire/shared/seed'
import { safeNext } from '../../src/lib/safeNext'
import { fakeDb, SEED_ADMIN_ID } from '../fakeApi/db'
import { server } from '../fakeApi/server'
import { renderApp } from '../renderApp'

const adminEmail = () => fakeDb.users.get(SEED_ADMIN_ID)!.email

describe('signing in', () => {
  it('sends signed-out people to sign in, then back where they were going', async () => {
    const { user } = renderApp('/spaces/sp.eng', { signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(window.location.search).toBe(`?next=${encodeURIComponent('/spaces/sp.eng')}`)

    await user.type(screen.getByLabelText('Email'), adminEmail())
    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), SEED_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('tree')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/spaces/sp.eng')
  })

  it('goes home from the login page when already signed in', async () => {
    renderApp('/login')
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('explains rate limits and lost connections', async () => {
    server.use(http.post('*/api/auth/sign-in/email', () => HttpResponse.json({ code: 'RATE_LIMITED', message: 'Too many' }, { status: 429 })))
    const { user } = renderApp('/login', { signedIn: false })
    await user.type(await screen.findByLabelText('Email'), adminEmail())
    await user.type(screen.getByLabelText('Password'), SEED_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
    server.use(http.post('*/api/auth/sign-in/email', () => HttpResponse.error()))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach Quire'))
  })

  it('logs out from the account menu', async () => {
    const { user } = renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fakeDb.sessions.size).toBe(0)
  })

  it('offers a retry when the session can’t be checked', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.error()))
    const { user } = renderApp('/', { signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Can’t reach Quire' })).toBeInTheDocument()
    server.resetHandlers()
    // Signed out now, so the retry lands on sign in.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('only follows next links inside the app', () => {
    expect(safeNext('/spaces/sp.eng?x=1')).toBe('/spaces/sp.eng?x=1')
    expect(safeNext('//evil.example/')).toBe('/')
    expect(safeNext('https://evil.example/')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})

describe('accepting an invite', () => {
  it('creates the account and signs in', async () => {
    const token = fakeDb.createInvite('nia@example.com', 'member', SEED_ADMIN_ID)
    const { user } = renderApp(`/invite/${token}`, { signedIn: false })
    expect(await screen.findByText(`${fakeDb.users.get(SEED_ADMIN_ID)!.name} invited nia@example.com.`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name.')
    await user.type(screen.getByLabelText('Your name'), 'Nia New')
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters.')
    await user.clear(screen.getByLabelText('New password'))
    await user.type(screen.getByLabelText('New password'), 'long enough password')
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'long enough passwerd')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords don’t match.')
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'long enough password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(within(screen.getByRole('button', { name: 'Account menu' })).getByText('NN')).toBeInTheDocument()
  })

  it('explains a used or unknown invite', async () => {
    const token = fakeDb.createInvite('used@example.com', 'member', SEED_ADMIN_ID)
    fakeDb.invites.get(token)!.acceptedAt = Date.now()
    renderApp(`/invite/${token}`, { signedIn: false })
    expect(await screen.findByRole('heading', { name: 'This invite can’t be used' })).toBeInTheDocument()
  })

  it('reports a failed accept', async () => {
    const token = fakeDb.createInvite('late@example.com', 'member', SEED_ADMIN_ID)
    const { user } = renderApp(`/invite/${token}`, { signedIn: false })
    await user.type(await screen.findByLabelText('Your name'), 'Late Larry')
    await user.type(screen.getByLabelText('New password'), 'long enough password')
    await user.type(screen.getByLabelText('Confirm password'), 'long enough password')
    fakeDb.invites.get(token)!.acceptedAt = Date.now()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has expired or was already used.')
  })
})

describe('resetting a password', () => {
  it('asks for an email and gives the same answer either way', async () => {
    const { user } = renderApp('/forgot-password', { signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If nobody@example.com has a Quire account')
  })

  it('shows a failure to send', async () => {
    server.use(http.post('*/api/auth/request-password-reset', () => HttpResponse.json({ code: 'x', message: 'x' }, { status: 500 })))
    const { user } = renderApp('/forgot-password', { signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('sets a new password from the emailed link', async () => {
    fakeDb.requestReset(adminEmail())
    const token = /token=(\w+)/.exec(fakeDb.mail.at(-1)!.text)![1]
    const { user } = renderApp(`/reset-password?token=${token}`, { signedIn: false })
    await user.type(await screen.findByLabelText('New password'), 'a brand new password')
    await user.type(screen.getByLabelText('Confirm password'), 'a brand new password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your password is changed')
    expect(fakeDb.users.get(SEED_ADMIN_ID)!.password).toBe('a brand new password')
  })

  it('explains an expired link and sends a missing token back', async () => {
    const { user } = renderApp('/reset-password?token=stale', { signedIn: false })
    await user.type(await screen.findByLabelText('New password'), 'a brand new password')
    await user.type(screen.getByLabelText('Confirm password'), 'a brand new password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link has expired or was already used.')
  })

  it('needs a token', async () => {
    renderApp('/reset-password', { signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
  })
})
