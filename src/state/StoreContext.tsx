import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { AppStore, StoreState } from './store'

export interface Session {
  store: AppStore
  mode: 'cloud' | 'demo'
  /** Khoá phạm vi lưu trữ cục bộ (theo người dùng). */
  scope: string
  email: string | null
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession phải nằm trong SessionProvider')
  return s
}

export function useStore(): AppStore {
  return useSession().store
}

export function useAppState(): StoreState {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
