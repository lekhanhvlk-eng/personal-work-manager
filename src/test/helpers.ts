import { LocalRepository } from '../data/localRepository'
import { RepoError } from '../data/errors'
import type { Repository } from '../data/repository'

/** Bọc LocalRepository, cho phép giả lập mất mạng và "mất phản hồi sau khi commit". */
export class FlakyRepository implements Repository {
  readonly mode = 'cloud' as const
  offline = false
  /** Lần gọi confirmExport tiếp theo: máy chủ commit nhưng phản hồi bị mất. */
  dropNextExportResponse = false
  calls: string[] = []

  constructor(public readonly inner: LocalRepository = new LocalRepository('pwm:test:server')) {}

  private guard(name: string) {
    this.calls.push(name)
    if (this.offline) throw new RepoError('NETWORK')
  }

  fetchAll: Repository['fetchAll'] = async () => (this.guard('fetchAll'), this.inner.fetchAll())
  createTask: Repository['createTask'] = async (t) => (this.guard('createTask'), this.inner.createTask(t))
  updateTask: Repository['updateTask'] = async (id, p) => (this.guard('updateTask'), this.inner.updateTask(id, p))
  deleteTask: Repository['deleteTask'] = async (id) => (this.guard('deleteTask'), this.inner.deleteTask(id))
  createMember: Repository['createMember'] = async (m) => (this.guard('createMember'), this.inner.createMember(m))
  updateMember: Repository['updateMember'] = async (id, p) => (
    this.guard('updateMember'),
    this.inner.updateMember(id, p)
  )
  restoreTask: Repository['restoreTask'] = async (id, n) => (this.guard('restoreTask'), this.inner.restoreTask(id, n))
  importBackup: Repository['importBackup'] = async (b) => (this.guard('importBackup'), this.inner.importBackup(b))
  confirmExport: Repository['confirmExport'] = async (req) => {
    this.guard('confirmExport')
    const report = await this.inner.confirmExport(req)
    if (this.dropNextExportResponse) {
      this.dropNextExportResponse = false
      throw new RepoError('NETWORK')
    }
    return report
  }
  subscribe: Repository['subscribe'] = () => () => {}
}
