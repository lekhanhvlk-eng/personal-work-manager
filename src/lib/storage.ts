/** Bọc localStorage an toàn (chế độ riêng tư / bộ nhớ đầy không làm hỏng ứng dụng). */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // bỏ qua
    }
  },
}
