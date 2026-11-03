import { describe, expect, it } from 'vitest'
import { newMember, newTask } from '../data/factory'
import { EMPTY_FILTER, filterTasks, foldVietnamese } from './filters'

const lan = newMember({ name: 'Nguyễn Thị Lan' })
const tasks = [
  { ...newTask({ description: 'Kiểm tra cửa hàng Vinamilk', work_date: '2026-11-03', category: 'store_audit' }) },
  {
    ...newTask({
      description: 'Đào tạo nhân viên mới',
      work_date: '2026-11-02',
      category: 'training',
      team_member_id: lan.id,
      status: 'in_progress',
    }),
  },
  { ...newTask({ description: 'Họp tháng trước', work_date: '2026-10-15' }), report_status: 'reported' as const },
]

describe('filterTasks', () => {
  const today = '2026-11-03'
  it('lọc theo khoảng thời gian', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTER, range: 'today' }, [lan], today)).toHaveLength(1)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, range: 'week' }, [lan], today)).toHaveLength(2)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, range: 'month' }, [lan], today)).toHaveLength(2)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, range: 'all' }, [lan], today)).toHaveLength(3)
  })

  it('tìm kiếm không dấu, theo cả tên thành viên', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTER, keyword: 'dao tao' }, [lan], today)).toHaveLength(1)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, keyword: 'lan' }, [lan], today)).toHaveLength(1)
  })

  it('lọc theo phân loại, thành viên, trạng thái và trạng thái báo cáo', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTER, category: 'store_audit' }, [lan], today)).toHaveLength(1)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, memberId: lan.id }, [lan], today)).toHaveLength(1)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, status: 'in_progress' }, [lan], today)).toHaveLength(1)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, reportStatus: 'unreported' }, [lan], today)).toHaveLength(2)
    expect(filterTasks(tasks, { ...EMPTY_FILTER, date: '2026-10-15' }, [lan], today)).toHaveLength(1)
  })

  it('foldVietnamese', () => {
    expect(foldVietnamese('Đôn Đốc KHẮC phục')).toBe('don doc khac phuc')
  })
})
