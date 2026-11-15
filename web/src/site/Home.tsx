import { useEffect, useLayoutEffect, useRef } from 'react'
import { BRAND } from '../brand'
import { requestBooking } from './bookingIntent'
import { useRevealAll } from './hooks'
import { bindScrollEffects, gsap, MOTION_OK, ScrollTrigger, scrollToHash, startSmoothScroll } from './motion'
import ArenaWalkthrough from './sections/ArenaWalkthrough'
import Arsenal from './sections/Arsenal'
import Booking from './sections/Booking'
import Briefing from './sections/Briefing'
import Gallery from './sections/Gallery'
import Hero from './sections/Hero'
import HowItWorks from './sections/HowItWorks'
import LeaderboardSection from './sections/LeaderboardSection'
import LiveIntel from './sections/LiveIntel'
import Missions from './sections/Missions'
import Safety from './sections/Safety'
import BattleZone from './sections/BattleZone'
import PlayerPov from './sections/PlayerPov'
import Tech from './sections/Tech'
import { SplitWords } from './SplitWords'

function FinalCall() {
  return (
    <section className="relative flex min-h-[80svh] items-center justify-center overflow-hidden px-[var(--edge)] py-28 text-center">
      <div className="absolute inset-0" aria-hidden>
        <img src="/media/real/arena-gate.webp" alt="" loading="lazy" data-parallax="0.3" className="h-[130%] w-full object-cover opacity-45" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#080808] via-black/40 to-black" />
      <div className="relative">
        <p className="kicker">Final call</p>
        <SplitWords as="p" className="headline mt-5 text-bone" parts={[{ t: 'Squad up.' }, { t: 'Enter.', className: 'text-hazard' }, 'Dominate.']} />
        <button type="button" className="btn-hazard mt-10" onClick={() => requestBooking({})}>
          Book your match
        </button>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.35em] text-smoke">{BRAND.tagline}</p>
      </div>
    </section>
  )
}

export default function Home() {
  const root = useRef<HTMLDivElement>(null)
  useRevealAll(root)

  useEffect(() => startSmoothScroll(), [])

  // Page-wide data-attribute effects; registered after the sections so their pins come first in scroll order.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const mm = gsap.matchMedia(el)
    mm.add(MOTION_OK, () => bindScrollEffects(el))
    // Images and fonts change section heights; re-measure the pins once everything has loaded.
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('load', refresh)
    document.fonts?.ready.then(refresh)
    return () => {
      window.removeEventListener('load', refresh)
      mm.revert()
    }
  }, [])

  // Deep links such as /#book: jump after the pins have been measured.
  useEffect(() => {
    if (!location.hash) return
    const id = setTimeout(() => scrollToHash(location.hash), 400)
    return () => clearTimeout(id)
  }, [])

  return (
    <div ref={root}>
      <Hero />
      <BattleZone />
      <Briefing />
      <ArenaWalkthrough />
      <Arsenal />
      <Missions />
      <Safety />
      <PlayerPov />
      <HowItWorks />
      <Tech />
      <LiveIntel />
      <LeaderboardSection />
      <Gallery />
      <Booking />
      <FinalCall />
    </div>
  )
}
