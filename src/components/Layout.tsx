import { useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { IS_ARTIFACT } from '../lib/env'
import { useAppState, useSession } from '../state/StoreContext'
import { Icon, Spinner, type IconName } from './Icon'
import { useToast } from './Toast'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Tổng quan', icon: 'home', end: true },
  { to: '/tasks', label: 'Công việc', icon: 'list' },
  { to: '/add', label: 'Thêm mới', icon: 'plus' },
  { to: '/team', label: 'Đội nhóm', icon: 'users' },
  { to: '/reports', label: 'Báo cáo', icon: 'report' },
]

/** Các màn hình tập trung (có thanh thao tác riêng) sẽ ẩn thanh điều hướng dưới. */
const FOCUSED = [/^\/reports\/new/, /^\/tasks\/[^/]+$/]

export function Layout() {
  const { pathname } = useLocation()
  const { store } = useSession()
  const toast = useToast()
  const focused = FOCUSED.some((r) => r.test(pathname))

  useEffect(() => store.onError((msg) => toast(msg, 'error')), [store, toast])
  useEffect(() => {
    // Lưu ý: không trả về giá trị — Chromium mới trả về Promise từ scrollTo.
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg">
      <div className={focused ? 'pb-6' : 'pb-28'}>
        <Outlet />
      </div>
      {!focused && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur pb-safe"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map((item) =>
          item.to === '/add' ? (
            <li key={item.to} className="flex justify-center">
              <NavLink
                to={item.to}
                className="-mt-5 flex flex-col items-center gap-0.5 text-[11px] font-semibold text-brand-700"
                aria-label="Thêm mới công việc"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-white active:bg-brand-700">
                  <Icon name="plus" className="h-7 w-7" strokeWidth={2.4} />
                </span>
                {item.label}
              </NavLink>
            </li>
          ) : (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    isActive ? 'text-brand-700' : 'text-slate-500'
                  }`
                }
              >
                <Icon name={item.icon} className="h-6 w-6" />
                {item.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}

export function SyncIndicator() {
  const { mode, store } = useSession()
  const { online, pending, syncing } = useAppState()
  const toast = useToast()
  if (mode === 'demo') {
    if (IS_ARTIFACT) return null
    return (
      <span
        className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
        title="Dữ liệu chỉ lưu trên thiết bị này"
      >
        Dùng thử
      </span>
    )
  }
  let label = 'Đã đồng bộ'
  let cls = 'bg-emerald-50 text-emerald-700'
  let icon: ReactNode = <Icon name="cloud" className="h-4 w-4" />
  if (syncing) {
    label = 'Đang đồng bộ'
    cls = 'bg-blue-50 text-blue-700'
    icon = <Spinner className="h-4 w-4" />
  } else if (!online) {
    label = pending.length ? `Ngoại tuyến · ${pending.length} chờ` : 'Ngoại tuyến'
    cls = 'bg-slate-200 text-slate-700'
    icon = <Icon name="cloudOff" className="h-4 w-4" />
  } else if (pending.length) {
    label = `${pending.length} chờ đồng bộ`
    cls = 'bg-amber-50 text-amber-800'
  }
  return (
    <button
      type="button"
      onClick={async () => {
        await store.sync()
        const s = store.getState()
        toast(
          s.pending.length ? 'Chưa thể đồng bộ, sẽ tự thử lại khi có mạng.' : 'Dữ liệu đã được đồng bộ.',
          s.pending.length ? 'info' : 'success',
        )
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
      aria-label={`Trạng thái đồng bộ: ${label}. Chạm để đồng bộ lại`}
    >
      {icon}
      {label}
    </button>
  )
}

/** Khung trang với tiêu đề cố định phía trên. */
export function Page({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/95 backdrop-blur pt-safe">
        <div className="flex min-h-[56px] items-center gap-2 px-4">
          {back && (
            <button
              type="button"
              onClick={() =>
                typeof back === 'string' ? navigate(back) : location.key !== 'default' ? navigate(-1) : navigate('/')
              }
              className="-ml-2 rounded-full p-2 text-slate-700 active:bg-slate-200"
              aria-label="Quay lại"
            >
              <Icon name="back" className="h-6 w-6" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="-mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      </header>
      <main className="px-4 pt-3">{children}</main>
    </>
  )
}
