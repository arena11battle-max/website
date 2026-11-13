import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BRAND, BrandLogo } from '../brand'
import { scrollToHash } from './motion'
import { setSound, useSound } from './sound'
import { useSiteSettings } from './settings'

export const NAV = [
  { href: '/#battlefield', label: 'Arena' },
  { href: '/#arsenal', label: 'Arsenal' },
  { href: '/#missions', label: 'Game modes' },
  { href: '/#safety', label: 'Safety' },
  { href: '/#live', label: 'Live' },
  { href: '/#leaderboard', label: 'Leaderboard' },
  { href: '/#gallery', label: 'Gallery' },
  { href: '/#aloha', label: 'ALOHA 2026' },
]

export function SoundToggle({ className = '' }: { className?: string }) {
  const on = useSound()
  return (
    <button
      type="button"
      onClick={() => setSound(!on)}
      aria-pressed={on}
      className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted transition hover:text-text ${className}`}
    >
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[0.5, 1, 0.7, 0.35].map((h, i) => (
          <span key={i} className={`w-[2px] bg-current transition-all ${on ? 'animate-pulse' : ''}`} style={{ height: on ? `${h * 100}%` : '20%', animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
      Sound {on ? 'on' : 'off'}
    </button>
  )
}

function Header() {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => setOpen(false), [loc])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${solid || open ? 'border-b border-white/5 bg-[#070707]/85 backdrop-blur-md' : 'bg-transparent'}`}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-[var(--edge)]">
        <Link to="/" className="shrink-0" aria-label="ARENA11 home">
          <BrandLogo size="sm" />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="font-display text-xs uppercase tracking-[0.18em] text-muted transition hover:text-text">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <SoundToggle className="hidden sm:flex" />
          <a href="/#book" className="btn-hazard hidden !px-4 !py-2.5 text-xs sm:inline-flex">
            Book your match
          </a>
          <button
            type="button"
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span className={`h-0.5 w-6 bg-text transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`h-0.5 w-6 bg-text transition ${open ? 'opacity-0' : ''}`} />
            <span className={`h-0.5 w-6 bg-text transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-white/5 px-[var(--edge)] pb-6 pt-2 lg:hidden" aria-label="Mobile">
          {[...NAV, { href: '/#book', label: 'Book your match' }].map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-white/5 py-3.5 font-display text-lg uppercase tracking-[0.14em]">
              {n.label}
            </a>
          ))}
          <SoundToggle className="mt-4" />
        </nav>
      )}
    </header>
  )
}

function Footer() {
  const s = useSiteSettings()
  const socials = [
    { label: 'Instagram', url: s.instagram },
    { label: 'Facebook', url: s.facebook },
    { label: 'YouTube', url: s.youtube },
  ].filter((x) => x.url)
  const col = 'font-display text-[11px] uppercase tracking-[0.25em] text-hazard mb-4'
  const link = 'block py-1 text-muted transition hover:text-text'
  return (
    <>
    {import.meta.env.VITE_PREVIEW && (
      <p className="pointer-events-none fixed bottom-3 left-3 z-[60] border border-amber/40 bg-black/80 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-amber backdrop-blur">
        Preview · booking and live scores go live with the server
      </p>
    )}
    <footer className="relative border-t border-white/5 bg-[#050505] px-[var(--edge)] pb-10 pt-16">
      <div className="hazard-thin absolute inset-x-0 top-0" />
      <div className="mx-auto grid max-w-[1440px] gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
        <div>
          <BrandLogo size="md" />
          <p className="mt-6 max-w-xs font-display text-sm uppercase tracking-[0.2em] text-text">{BRAND.slogan}</p>
          <p className="mt-3 max-w-xs text-sm text-muted">Supervised, real-life tactical gel blaster missions with electronic hit tracking.</p>
        </div>
        <div>
          <h3 className={col}>Navigate</h3>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={link}>
              {n.label}
            </a>
          ))}
          <a href="/#book" className={link}>
            Book
          </a>
        </div>
        <div>
          <h3 className={col}>Game modes</h3>
          {['Team Deathmatch', 'Domination', 'Last Squad', 'Custom Match'].map((m) => (
            <a key={m} href="/#missions" className={link}>
              {m}
            </a>
          ))}
          <h3 className={`${col} mt-8`}>Info</h3>
          <Link to="/safety" className={link}>
            Safety rules
          </Link>
          <Link to="/terms" className={link}>
            Terms and conditions
          </Link>
          <Link to="/privacy" className={link}>
            Privacy policy
          </Link>
        </div>
        <div>
          <h3 className={col}>Contact</h3>
          {s.phone ? (
            <a href={`tel:${s.phone.replace(/\s/g, '')}`} className={link}>
              {s.phone}
            </a>
          ) : (
            <span className="block py-1 text-dim">Phone: to be announced</span>
          )}
          {s.email ? (
            <a href={`mailto:${s.email}`} className={`${link} break-all`}>
              {s.email}
            </a>
          ) : (
            <span className="block py-1 text-dim">Email: to be announced</span>
          )}
          {socials.length > 0 && (
            <>
              <h3 className={`${col} mt-8`}>Follow</h3>
              {socials.map((x) => (
                <a key={x.label} href={x.url} target="_blank" rel="noopener noreferrer" className={link}>
                  {x.label}
                </a>
              ))}
            </>
          )}
        </div>
        <div>
          <h3 className={col}>Location</h3>
          <p className="whitespace-pre-line text-muted">{s.address || 'Venue address to be announced.'}</p>
          {s.mapsUrl && (
            <a href={s.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-display text-xs uppercase tracking-[0.2em] text-amber hover:underline">
              Get directions →
            </a>
          )}
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-[1440px] flex-col gap-3 border-t border-white/5 pt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-dim sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} ARENA11 · {BRAND.tagline}</span>
        <span className="flex gap-6">
          <Link to="/display" className="hover:text-text">
            Arena TV
          </Link>
          <Link to="/command" className="hover:text-text">
            Staff login
          </Link>
        </span>
      </div>
    </footer>
    </>
  )
}

export default function SiteLayout() {
  const { hash, pathname } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // In-page links ("/#book") glide to their section instead of jumping.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as Element).closest?.('a[href^="/#"], a[href^="#"]') as HTMLAnchorElement | null
      if (!a || location.pathname !== '/') return
      const h = a.getAttribute('href')!.replace(/^\//, '')
      if (h.length > 1 && scrollToHash(h)) {
        e.preventDefault()
        history.replaceState(null, '', h)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="site min-h-dvh bg-[#070707]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:p-3">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
