import { NavLink, Outlet } from 'react-router-dom'
import { BrandLogo } from '../brand'
import { useAuth } from '../lib/auth'

const icon = {
  live: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  players: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  plus: 'M12 5v14M5 12h14',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l4 2',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  ticket: 'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Zm10-4v14',
}

export function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex flex-col leading-none">
      <BrandLogo size="sm" />
      <div className={`mt-1 font-mono tracking-[0.42em] text-amber ${small ? 'text-[8px]' : 'text-[9px]'}`}>COMMAND</div>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = [
    { to: '/command', label: 'Live', d: icon.live, end: true },
    ...(user?.role === 'admin' ? [{ to: '/command/dashboard', label: 'Dashboard', d: icon.trophy }] : []),
    { to: '/command/players', label: 'Players', d: icon.players },
    { to: '/command/matches/new', label: 'New match', d: icon.plus },
    { to: '/command/bookings', label: 'Bookings', d: icon.calendar },
    { to: '/command/coupons', label: 'Coupons', d: icon.ticket },
    { to: '/command/history', label: 'History', d: icon.history },
    { to: '/command/leaderboard', label: 'Leaders', d: icon.trophy },
    { to: '/command/settings', label: 'Settings', d: icon.settings },
  ]
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 font-display text-sm uppercase tracking-[0.12em] transition border-l-4 ${
      isActive
        ? 'border-amber bg-gradient-to-r from-amber/20 to-transparent text-amber'
        : 'border-transparent text-muted hover:text-text hover:bg-panel-2'
    }`

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[72px_1fr] lg:grid-cols-[232px_1fr]">
      {/* Sidebar: icons only on tablets, full on laptops. */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line-2 bg-gradient-to-b from-[#1a1f15]/95 to-[#0e110b]/95 backdrop-blur md:flex">
        <div className="flex h-16 items-center justify-center border-b border-line px-4 lg:justify-start">
          <span className="hidden lg:block">
            <Logo />
          </span>
          <span className="font-display text-lg text-hazard lg:hidden" aria-label="ARENA11">11</span>
        </div>
        <nav className="flex-1 space-y-1 py-4">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} title={n.label}>
              <Icon d={n.d} />
              <span className="hidden lg:inline">{n.label}</span>
            </NavLink>
          ))}
          <a href="/display" target="_blank" rel="noreferrer" className={linkCls({ isActive: false })} title="Open the TV scoreboard">
            <Icon d={icon.tv} />
            <span className="hidden lg:inline">TV display</span>
          </a>
        </nav>
        <div className="border-t border-line p-3 text-sm">
          <div className="hidden truncate font-bold lg:block">{user?.name}</div>
          <div className="hidden text-xs text-muted uppercase lg:block">{user?.role}</div>
          <button onClick={logout} className="mt-2 text-xs font-bold tracking-widest text-muted uppercase hover:text-red" title="Sign out">
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink/90 px-4 backdrop-blur md:hidden">
          <Logo small />
          <div className="flex items-center gap-3">
            <a href="/display" target="_blank" rel="noreferrer" className="text-muted" aria-label="TV display">
              <Icon d={icon.tv} />
            </a>
            <button onClick={logout} className="text-xs font-bold tracking-widest text-muted uppercase">
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-3 pt-4 pb-28 sm:px-6 md:pb-10 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid border-t-2 border-line-2 bg-[#0e110b]/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 font-display text-[9px] tracking-wider uppercase ${isActive ? 'text-amber bg-gradient-to-t from-amber/15 to-transparent' : 'text-muted'}`
            }
          >
            <Icon d={n.d} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
