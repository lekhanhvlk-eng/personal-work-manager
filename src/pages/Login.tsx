import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Button, Field, inputClass } from '../components/ui'
import { getSupabase } from '../lib/supabase'

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu không đúng.'
  if (/email not confirmed/i.test(message)) return 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.'
  if (/already registered|already exists/i.test(message)) return 'Email này đã được đăng ký. Vui lòng đăng nhập.'
  if (/password should be at least/i.test(message)) return 'Mật khẩu phải có ít nhất 6 ký tự.'
  if (/rate limit/i.test(message)) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.'
  if (/fetch|network/i.test(message)) return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.'
  return 'Không thể xác thực: ' + message
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    const sb = getSupabase()
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) setInfo('Đã tạo tài khoản. Vui lòng mở email để xác nhận, sau đó đăng nhập.')
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('Đã gửi email hướng dẫn đặt lại mật khẩu (nếu email tồn tại).')
      }
    } catch (err) {
      setError(translateAuthError((err as Error).message ?? String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
          <Icon name="report" className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">Trợ lý Công việc</h1>
        <p className="mt-1 text-sm text-slate-500">Ghi nhận nhanh · Điều phối đội nhóm · Báo cáo thông minh</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@congty.vn"
          />
        </Field>
        {mode !== 'reset' && (
          <Field label="Mật khẩu">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
            />
          </Field>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            {info}
          </p>
        )}
        <Button type="submit" block size="lg" loading={loading}>
          {mode === 'login' ? 'Đăng nhập' : mode === 'signup' ? 'Tạo tài khoản' : 'Gửi email đặt lại mật khẩu'}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        {mode === 'login' ? (
          <>
            <p>
              Chưa có tài khoản?{' '}
              <button type="button" className="font-semibold text-brand-700" onClick={() => setMode('signup')}>
                Đăng ký
              </button>
            </p>
            <button type="button" className="text-slate-500" onClick={() => setMode('reset')}>
              Quên mật khẩu?
            </button>
          </>
        ) : (
          <button type="button" className="font-semibold text-brand-700" onClick={() => setMode('login')}>
            ← Quay lại đăng nhập
          </button>
        )}
      </div>
    </div>
  )
}
