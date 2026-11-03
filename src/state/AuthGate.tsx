import type { Session as SbSession } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Spinner } from '../components/Icon'
import { LocalRepository } from '../data/localRepository'
import { SupabaseRepository } from '../data/supabaseRepository'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { LoginPage } from '../pages/Login'
import { clearReportDraft, clearTaskDraft } from './drafts'
import { AppStore } from './store'
import { SessionProvider, type Session } from './StoreContext'

function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-8 w-8 text-brand-600" />
      <p className="text-sm">Đang tải dữ liệu…</p>
    </div>
  )
}

function useStartedStore(store: AppStore | null) {
  useEffect(() => {
    if (!store) return
    void store.start()
    return () => store.dispose()
  }, [store])
}

function DemoGate({ children }: { children: ReactNode }) {
  const store = useMemo(() => new AppStore(new LocalRepository(), 'demo'), [])
  useStartedStore(store)
  const session = useMemo<Session>(
    () => ({ store, mode: 'demo', scope: 'demo', email: null, signOut: async () => {} }),
    [store],
  )
  return <SessionProvider value={session}>{children}</SessionProvider>
}

function CloudGate({ children }: { children: ReactNode }) {
  const sb = getSupabase()
  const [auth, setAuth] = useState<SbSession | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    sb.auth.getSession().then(({ data }) => active && setAuth(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => setAuth(s))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [sb])

  const userId = auth?.user.id ?? null
  const email = auth?.user.email ?? null
  const store = useMemo(
    () => (userId ? new AppStore(new SupabaseRepository(sb, userId), `cloud:${userId}`) : null),
    [sb, userId],
  )
  useStartedStore(store)

  const session = useMemo<Session | null>(() => {
    if (!store || !userId) return null
    const scope = `cloud:${userId}`
    return {
      store,
      mode: 'cloud',
      scope,
      email,
      signOut: async () => {
        await sb.auth.signOut()
        // Xoá dữ liệu đệm trên thiết bị (dữ liệu gốc vẫn an toàn trên đám mây).
        store.clearLocalCache()
        clearReportDraft(scope)
        clearTaskDraft(scope)
      },
    }
  }, [store, userId, email, sb])

  if (auth === undefined) return <Splash />
  if (!session) return <LoginPage />
  return <SessionProvider value={session}>{children}</SessionProvider>
}

export function AuthGate({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? <CloudGate>{children}</CloudGate> : <DemoGate>{children}</DemoGate>
}
