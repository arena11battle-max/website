// Renders the hero film, posters and fallback stills from the site's own 3D scenes.
// Usage: start `npm run dev` in web/, then `node scripts/render-media.mjs [job...]`.
// Needs Playwright (Chromium) and ffmpeg. Output goes to public/media/.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.DEV_URL ?? 'http://localhost:5173'
const OUT = new URL('../public/media/', import.meta.url).pathname
const TMP = process.env.TMPDIR_RENDER ?? '/tmp/arena11-render'
const FPS = Number(process.env.FPS ?? 24)
mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] })

async function open(scene, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.on('pageerror', (e) => console.error('pageerror', e.message))
  await page.goto(`${BASE}/render/index.html?scene=${scene}`)
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 })
  return page
}

async function frame(page, t) {
  const url = await page.evaluate((t) => window.__frame(t), t)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function clip(name, scene, from, to, w, h) {
  const dir = join(TMP, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const page = await open(scene, w, h)
  // Warm-up frames let particles and lights settle before the first real frame.
  for (let t = from - 0.5; t < from; t += 1 / FPS) await frame(page, t)
  const n = Math.round((to - from) * FPS)
  const started = Date.now()
  for (let i = 0; i < n; i++) {
    writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), await frame(page, from + i / FPS))
    if (i % 24 === 0) console.log(`${name} ${i}/${n} ${((Date.now() - started) / 1000).toFixed(0)}s`)
  }
  await page.close()
  return dir
}

async function still(file, scene, t, w, h) {
  const page = await open(scene, w, h)
  for (let k = t - 1; k < t; k += 0.1) await frame(page, k)
  const tmp = join(TMP, 'still.jpg')
  writeFileSync(tmp, await frame(page, t))
  await page.close()
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libwebp', '-quality', '80', join(OUT, `${file}.webp`)])
  console.log('still', file)
}

const jobs = process.argv.slice(2)
const want = (j) => jobs.length === 0 || jobs.includes(j)

if (want('hero')) {
  const W = 1600
  const H = 900
  // The gate shot is kept for the walkthrough only: in the hero, its ARENA11 board would sit behind the logo.
  const parts = [await clip('b', 'hero-advance', 0, 6, W, H), await clip('c', 'hero-wide', 0, 7, W, H)]
  const inputs = parts.flatMap((d) => ['-framerate', String(FPS), '-i', join(d, 'f%05d.jpg')])
  const filter = '[0:v]fade=t=in:st=0:d=1.6[a];[a][1:v]concat=n=2:v=1:a=0,format=yuv420p'
  const master = join(TMP, 'hero-master.mp4')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-c:v', 'libx264', '-crf', '14', master])
  const enc = (args, file) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-an', ...args, join(OUT, file)])
  enc(['-vf', 'scale=1600:900', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'], 'hero-1600.mp4')
  enc(['-vf', 'scale=1600:900', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1'], 'hero-1600.webm')
  enc(['-vf', 'scale=960:540', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'], 'hero-960.mp4')
  // Poster = inside the gate, so the board never sits behind the logo on first paint.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3.5', '-i', master, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', join(OUT, 'hero-poster.webp')])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3.5', '-i', master, '-frames:v', '1', '-vf', 'scale=800:-2', '-c:v', 'libwebp', '-quality', '72', join(OUT, 'hero-poster-sm.webp')])
}

// Short, small, looping previews for the game-mode cards.
if (want('modes'))
  for (const m of ['tdm', 'dom', 'last', 'custom']) {
    const dir = await clip(`mode-${m}`, `hero-mode-${m}`, 0, 5, 960, 540)
    const src = ['-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg')]
    const run = (args, file) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...src, '-an', ...args, join(OUT, file)])
    run(['-vf', 'scale=640:360', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'], `mode-${m}.mp4`)
    run(['-vf', 'scale=640:360', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1'], `mode-${m}.webm`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'f00060.jpg'), '-vf', 'scale=960:-2', '-c:v', 'libwebp', '-quality', '74', join(OUT, `mode-${m}.webp`)])
  }

// Walkthrough scenes, large and small.
if (want('scenes'))
  for (const id of ['gate', 'sandbags', 'tyres', 'pallets', 'camo', 'tower', 'bases']) {
    await still(`scene-${id}`, `hero-scene-${id}`, 4, 1600, 900)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(OUT, `scene-${id}.webp`), '-vf', 'scale=800:-2', '-c:v', 'libwebp', '-quality', '72', join(OUT, `scene-${id}-sm.webp`)])
  }

// gun-rifle.webp and gun-smg.webp are ARENA11's supplied images, so they are not re-rendered. gun-pistol/awm are unused renders kept for reference.
if (want('guns')) for (const g of ['pistol', 'awm']) await still(`gun-${g}`, `gun-${g}`, 9.2, 1280, 720)
if (want('tour')) for (const id of ['aerial', 'descent', 'wide', 'cover', 'tower', 'lanes', 'red', 'blue', 'prep', 'entrance']) await still(`arena-${id}`, `tour-${id}`, 4, 1280, 720)

await browser.close()
