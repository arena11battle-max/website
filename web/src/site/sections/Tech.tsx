import { useSiteSettings } from '../settings'
import { SplitWords } from '../SplitWords'

const CHAIN = ['Gun', 'Coded IR signal', 'Player vest', 'ESP32 hub', 'Server', 'Live scoreboard']

const FEATURES = [
  { t: 'ESP32 gun kits', d: 'Each blaster carries an ESP32 that sends a coded infrared burst on every trigger pull.' },
  { t: 'Smart hit-detection vests', d: 'Vest sensors register valid hits and the vest tracks the wearer’s health.' },
  { t: 'Coded IR transmission', d: 'Every shot carries the shooter’s team, kit number and weapon class, so the system knows who hit whom.' },
  { t: 'Wireless scoreboard hub', d: 'Kits report to an ESP32 hub over ESP-NOW radio. The hub forwards signed events to the server.' },
  { t: 'Real-time hit registration', d: 'The server checks each event, rejects duplicates and friendly fire, and updates scores within a fraction of a second.' },
  { t: 'Health and respawn tracking', d: 'Health, eliminations and the 8-second respawn are tracked per player, per round.' },
]

export default function Tech() {
  const s = useSiteSettings()
  return (
    <section className="site-section bg-[#040504]" aria-labelledby="tech-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="reveal grid gap-8 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="kicker">08 // Technology</p>
            <SplitWords as="h2" id="tech-title" className="headline mt-4 text-bone" parts={['Every hit', { t: 'counts.', className: 'text-hazard' }]} />
          </div>
          <p className="text-smoke lg:text-lg">
            Every kit has its own identity: R1 to R5 for Red, B1 to B5 for Blue. The system records the shooter, the victim, the weapon, every hit
            and every kill, and the server is the single authority on health, scores and the clock.
          </p>
        </div>

        {/* Signal chain */}
        <div className="reveal plate mt-14 overflow-x-auto p-6 sm:p-10" role="img" aria-label={`Signal path: ${CHAIN.join(', then ')}`}>
          <svg viewBox="0 0 1200 140" className="min-w-[760px]" aria-hidden>
            <defs>
              <linearGradient id="wire" x1="0" x2="1">
                <stop offset="0" stopColor="#ff4a1c" />
                <stop offset="1" stopColor="#f5b62a" />
              </linearGradient>
            </defs>
            <line x1="100" y1="60" x2="1100" y2="60" stroke="#2b3224" strokeWidth="2" />
            <line x1="100" y1="60" x2="1100" y2="60" stroke="url(#wire)" strokeWidth="2" className="dash-flow" />
            {CHAIN.map((c, i) => {
              const x = 100 + i * 200
              return (
                <g key={c}>
                  <rect x={x - 34} y={26} width="68" height="68" transform={`rotate(45 ${x} 60)`} fill="#0b0d09" stroke={i === 1 ? '#ff4a1c' : '#3d4632'} strokeWidth="2" />
                  <text x={x} y={66} textAnchor="middle" fill="#ff4a1c" fontFamily="Share Tech Mono" fontSize="16">
                    {String(i + 1).padStart(2, '0')}
                  </text>
                  <text x={x} y={128} textAnchor="middle" fill="#e8e4d4" fontFamily="Black Ops One" fontSize="15" letterSpacing="1.5">
                    {c.toUpperCase()}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.t} className="reveal border-l-2 border-hazard/60 bg-white/[0.02] p-5" style={{ '--d': `${i * 80}ms` } as React.CSSProperties}>
              <h3 className="font-display text-lg uppercase tracking-[0.06em]">{f.t}</h3>
              <p className="mt-2 text-sm text-smoke">{f.d}</p>
            </div>
          ))}
        </div>

        <div className="reveal mt-6 flex flex-col gap-2 border border-amber/30 bg-amber/5 p-4 font-mono text-xs uppercase tracking-[0.15em] text-amber sm:flex-row sm:items-center sm:gap-6">
          <span className="text-bone">System status</span>
          <span>Scoring server: operational</span>
          <span>Hardware kits: {s.hardwareStatus || 'prototype kits in field testing'}</span>
        </div>
      </div>
    </section>
  )
}
