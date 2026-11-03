import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Page, SyncIndicator } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, Card, ConfirmDialog, SectionTitle, inputClass } from '../components/ui'
import { LocalRepository } from '../data/localRepository'
import { copyText } from '../lib/clipboard'
import { formatDateTimeVN, todayVN } from '../lib/dates'
import { IS_ARTIFACT } from '../lib/env'
import { BackupValidationError, buildBackup, downloadText, parseBackup, tasksToCSV } from '../lib/exporters'
import { buildSampleData } from '../lib/sampleData'
import type { BackupFile } from '../lib/types'
import { clearReportDraft, clearTaskDraft } from '../state/drafts'
import { useData } from '../state/selectors'
import { useAppState, useSession } from '../state/StoreContext'

export function SettingsPage() {
  const { store, mode, email, scope, signOut } = useSession()
  const { pending, lastSyncedAt, online } = useAppState()
  const data = useData()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const stamp = todayVN().replace(/-/g, '')

  const runImport = async (backup: BackupFile, successPrefix: string) => {
    setBusy(true)
    try {
      const r = await store.importBackup(backup)
      toast(
        `${successPrefix}: ${r.tasks} công việc, ${r.team_members} thành viên, ${r.reports} báo cáo${r.skipped ? ` (bỏ qua ${r.skipped} bản ghi đã có)` : ''}.`,
      )
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
      setRestoreFile(null)
    }
  }

  return (
    <Page title="Cài đặt & dữ liệu" back="/" actions={<SyncIndicator />}>
      <Card className="p-4">
        <p className="text-sm text-slate-500">Tài khoản</p>
        <p className="font-semibold text-slate-900">
          {mode === 'cloud' ? email : IS_ARTIFACT ? 'Lưu trên điện thoại này' : 'Chế độ dùng thử (không đăng nhập)'}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {mode === 'cloud' ? (
            <>
              Lưu trữ: Supabase (đám mây) · {online ? 'Trực tuyến' : 'Ngoại tuyến'}
              <br />
              Đồng bộ gần nhất: {lastSyncedAt ? formatDateTimeVN(lastSyncedAt) : '—'}
              {pending.length > 0 && (
                <>
                  <br />
                  <span className="font-semibold text-amber-700">{pending.length} thay đổi đang chờ đồng bộ</span>
                </>
              )}
            </>
          ) : IS_ARTIFACT ? (
            'Dữ liệu nằm trong trình duyệt của điện thoại này, không cần tài khoản. Nếu xoá dữ liệu trình duyệt sẽ mất, nên thỉnh thoảng sao chép bản sao lưu.'
          ) : (
            'Dữ liệu chỉ lưu trên trình duyệt của thiết bị này. Để đồng bộ nhiều thiết bị, hãy cấu hình Supabase (xem README).'
          )}
        </p>
        {mode === 'cloud' && (
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={() => void store.sync().then(() => toast('Đã đồng bộ.'))}
            >
              Đồng bộ ngay
            </Button>
            <Button variant="secondary" size="sm" icon="logout" onClick={() => setLogoutOpen(true)}>
              Đăng xuất
            </Button>
          </div>
        )}
      </Card>

      <SectionTitle>Sao lưu & xuất dữ liệu</SectionTitle>
      <Card className="divide-y divide-slate-100">
        <button
          type="button"
          className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-50"
          onClick={async () => {
            const json = JSON.stringify(buildBackup(data))
            if (IS_ARTIFACT) {
              // Trang mở qua link không cho tải tệp: sao chép để dán vào Zalo "Cloud của tôi".
              const ok = await copyText(json)
              toast(
                ok
                  ? 'Đã sao chép bản sao lưu. Hãy dán vào Zalo “Cloud của tôi” để giữ an toàn.'
                  : 'Không thể sao chép.',
                ok ? 'success' : 'error',
              )
              return
            }
            downloadText(`sao-luu-cong-viec-${stamp}.json`, json, 'application/json')
            toast('Đã tải tệp sao lưu JSON.')
          }}
        >
          <Icon name={IS_ARTIFACT ? 'copy' : 'download'} className="h-6 w-6 text-brand-700" />
          <span className="flex-1">
            <span className="block font-semibold text-slate-900">
              {IS_ARTIFACT ? 'Sao chép bản sao lưu' : 'Sao lưu JSON'}
            </span>
            <span className="block text-xs text-slate-500">Toàn bộ công việc, thành viên, báo cáo và nhật ký</span>
          </span>
        </button>
        {!IS_ARTIFACT && (
          <button
            type="button"
            className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-50"
            onClick={() => {
              downloadText(
                `cong-viec-${stamp}.csv`,
                tasksToCSV(data.tasks, data.members, data.reports),
                'text/csv;charset=utf-8',
              )
              toast('Đã xuất tệp CSV.')
            }}
          >
            <Icon name="list" className="h-6 w-6 text-brand-700" />
            <span className="flex-1">
              <span className="block font-semibold text-slate-900">Xuất CSV (Excel)</span>
              <span className="block text-xs text-slate-500">Danh sách công việc kèm trạng thái và mã báo cáo</span>
            </span>
          </button>
        )}
        {IS_ARTIFACT && (
          <button
            type="button"
            className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-50"
            onClick={() => setPasteOpen(true)}
            disabled={busy}
          >
            <Icon name="restore" className="h-6 w-6 text-brand-700" />
            <span className="flex-1">
              <span className="block font-semibold text-slate-900">Dán bản sao lưu để khôi phục</span>
              <span className="block text-xs text-slate-500">
                Chỉ thêm bản ghi còn thiếu, không xoá dữ liệu hiện có
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-50"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Icon name="upload" className="h-6 w-6 text-brand-700" />
          <span className="flex-1">
            <span className="block font-semibold text-slate-900">Khôi phục từ tệp sao lưu</span>
            <span className="block text-xs text-slate-500">
              Chỉ thêm bản ghi còn thiếu — không ghi đè, không xoá dữ liệu hiện có
            </span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              setRestoreFile(parseBackup(await file.text()))
            } catch (err) {
              toast(err instanceof BackupValidationError ? err.message : 'Không đọc được tệp.', 'error')
            }
          }}
        />
      </Card>

      {mode === 'demo' && (
        <>
          <SectionTitle>{IS_ARTIFACT ? 'Dữ liệu' : 'Dữ liệu dùng thử'}</SectionTitle>
          <Card className="space-y-3 p-4">
            <p className="text-sm text-slate-600">
              {IS_ARTIFACT
                ? 'Tạo vài công việc mẫu để xem thử cách dùng (có thể xoá sau).'
                : 'Dữ liệu mẫu chỉ dành cho chế độ dùng thử và không bao giờ trộn vào tài khoản đám mây thật.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon="bolt"
                loading={busy}
                onClick={() => runImport(buildSampleData(), 'Đã tạo dữ liệu mẫu')}
              >
                Tạo dữ liệu mẫu
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="trash"
                className="!text-red-700"
                onClick={() => setResetOpen(true)}
              >
                {IS_ARTIFACT ? 'Xoá toàn bộ dữ liệu' : 'Xoá toàn bộ dữ liệu dùng thử'}
              </Button>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Thông tin</SectionTitle>
      <Card className="p-4 text-sm text-slate-600">
        <p>Múi giờ: Asia/Ho_Chi_Minh (GMT+7)</p>
        <p>
          Dữ liệu: {data.tasks.length} công việc · {data.members.length} thành viên · {data.reports.length} báo cáo
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Công việc không bao giờ tự động bị xoá sau khi báo cáo. Có thể cài ứng dụng lên màn hình chính từ menu trình
          duyệt (“Thêm vào màn hình chính”).
        </p>
      </Card>

      <ConfirmDialog
        open={Boolean(restoreFile)}
        title="Khôi phục dữ liệu?"
        loading={busy}
        confirmLabel="Khôi phục"
        onCancel={() => setRestoreFile(null)}
        onConfirm={() => restoreFile && runImport(restoreFile, 'Đã khôi phục')}
        message={
          restoreFile && (
            <>
              Tệp sao lưu lúc {formatDateTimeVN(restoreFile.exported_at)} gồm {restoreFile.tasks.length} công việc,{' '}
              {restoreFile.team_members.length} thành viên, {restoreFile.reports.length} báo cáo. Bản ghi đã tồn tại sẽ
              được bỏ qua — dữ liệu hiện có không bị ghi đè hay xoá.
            </>
          )
        }
      />
      <ConfirmDialog
        open={pasteOpen}
        title="Dán bản sao lưu"
        message="Dán nội dung bản sao lưu đã sao chép trước đó vào ô dưới."
        confirmLabel="Tiếp tục"
        onCancel={() => {
          setPasteOpen(false)
          setPasteText('')
        }}
        onConfirm={() => {
          try {
            setRestoreFile(parseBackup(pasteText.trim()))
            setPasteOpen(false)
            setPasteText('')
          } catch (err) {
            toast(err instanceof BackupValidationError ? err.message : 'Bản sao lưu không hợp lệ.', 'error')
          }
        }}
      >
        <textarea
          id="paste-backup"
          rows={5}
          className={`${inputClass} mt-3 resize-none font-mono text-xs`}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder='{"app":"personal-work-manager", ...}'
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={logoutOpen}
        title="Đăng xuất?"
        danger={pending.length > 0}
        confirmLabel="Đăng xuất"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={async () => {
          setLogoutOpen(false)
          await signOut()
        }}
        message={
          pending.length > 0
            ? `Còn ${pending.length} thay đổi CHƯA đồng bộ lên máy chủ và sẽ bị mất nếu đăng xuất. Hãy kết nối mạng và đồng bộ trước.`
            : 'Dữ liệu đệm trên thiết bị sẽ được xoá. Dữ liệu của bạn vẫn an toàn trên đám mây.'
        }
      />
      <ConfirmDialog
        open={resetOpen}
        danger
        title={IS_ARTIFACT ? 'Xoá toàn bộ dữ liệu?' : 'Xoá toàn bộ dữ liệu dùng thử?'}
        message="Mọi công việc, thành viên và báo cáo trong chế độ dùng thử trên thiết bị này sẽ bị xoá vĩnh viễn."
        confirmLabel="Xoá tất cả"
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          if (store.repo instanceof LocalRepository) store.repo.reset()
          store.clearLocalCache()
          clearReportDraft(scope)
          clearTaskDraft(scope)
          await store.refresh()
          setResetOpen(false)
          toast('Đã xoá dữ liệu dùng thử.')
        }}
      />
    </Page>
  )
}
