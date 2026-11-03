// Đóng gói ứng dụng thành MỘT tệp HTML (dữ liệu lưu trên máy) để mở trên điện thoại qua link.
// Chạy: npm run build:artifact  → dist-artifact/tro-ly-cong-viec.html
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'dist-artifact')
execSync('npx vite build --mode artifact', { cwd: root, stdio: 'inherit' })

const html = readFileSync(join(out, 'index.html'), 'utf8')
const jsPath = html.match(/<script type="module" crossorigin src="\/([^"]+\.js)"><\/script>/)?.[1]
const cssPath = html.match(/<link rel="stylesheet" crossorigin href="\/([^"]+\.css)">/)?.[1]
if (!jsPath || !cssPath) throw new Error('Không tìm thấy tệp JS/CSS trong bản build')

const js = readFileSync(join(out, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
const css = readFileSync(join(out, cssPath), 'utf8').replace(/<\/style/gi, '<\\/style')

const page = `<title>Trợ lý Công việc</title>
<meta name="theme-color" content="#1d5fed">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
const target = join(out, 'tro-ly-cong-viec.html')
writeFileSync(target, page)
console.log(`✓ ${target} (${Math.round(page.length / 1024)} KB)`)
