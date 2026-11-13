import { SplitWords } from '../SplitWords'
const STEPS = [
  { n: '01', t: 'Squad up', d: 'Register and form your team. Book for 2 to 8 players.', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8' },
  { n: '02', t: 'Gear up', d: 'Receive your assigned gel blaster and smart vest, plus a safety briefing.', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 6v4m0 4h.01' },
  { n: '03', t: 'Enter the arena', d: 'Deploy from your base. The mission clock starts on the marshal’s call.', icon: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
  { n: '04', t: 'Dominate', d: 'Hits, health, kills and team scores are tracked live on the arena screen.', icon: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3' },
]

export default function HowItWorks() {
  return (
    <section className="site-section" aria-labelledby="how-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="reveal">
          <p className="kicker">07 // Procedure</p>
          <SplitWords as="h2" id="how-title" className="headline mt-4 text-bone" parts={['How it', { t: 'works', className: 'text-hazard' }]} />
        </div>
        <ol className="relative mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden h-px bg-gradient-to-r from-transparent via-hazard/50 to-transparent xl:block" aria-hidden />
          {STEPS.map((s, i) => (
            <li key={s.n} className="reveal group plate relative p-6 transition hover:-translate-y-1" style={{ '--d': `${i * 140}ms` } as React.CSSProperties}>
              <div className="relative flex h-16 w-16 items-center justify-center">
                <svg viewBox="0 0 64 64" className="absolute inset-0 text-hazard/60 transition group-hover:rotate-45 group-hover:text-hazard" aria-hidden>
                  <path d="M32 2 62 32 32 62 2 32Z" fill="#0b0d09" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <svg viewBox="0 0 24 24" className="relative h-6 w-6 text-bone" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={s.icon} />
                </svg>
              </div>
              <span className="absolute right-5 top-4 font-score text-6xl font-semibold text-white/5">{s.n}</span>
              <h3 className="mt-6 font-display text-2xl uppercase">{s.t}</h3>
              <p className="mt-2 text-smoke">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
