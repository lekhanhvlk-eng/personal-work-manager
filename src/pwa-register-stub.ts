// Thay thế 'virtual:pwa-register' trong bản 1 tệp (khung nhúng không hỗ trợ service worker).
export function registerSW(_options?: unknown): () => Promise<void> {
  return async () => {}
}
