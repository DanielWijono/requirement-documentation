import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { testQueryClient } from './testQueryClient'

/** For rendering a single component that reads the session or queries. */
export function TestProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => testQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
