import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BRAND, BrandLogo, LOGO } from '../../brand'
import { requestBooking } from '../bookingIntent'
import { useReducedMotion } from '../hooks'
import { gsap, scrollToHash, useGsap } from '../motion'

const HeroAtmosphere = lazy(() => import('./HeroAtmosphere'))

// Full-screen opening on the arena film (the original ARENA11 opening): black, the letterbox opens on the
// pre-rendered arena flythrough, then the logo scans on and the type stamps in. The film is rendered from the
// site's own 3D scenes (scripts/render-media.mjs) and labelled as a concept render.

function pickVideo(): { src: string; type: string }[] | null {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return null
  if (window.innerWidth >= 900)
    return [
      { src: '/media/hero-1600.webm', type: 'video/webm' },
      { src: '/media/hero-1600.mp4', type: 'video/mp4' },
    ]
  return [{ src: '/media/hero-960.mp4', type: 'video/mp4' }]
}

function ArenaFilm({ reduced }: { reduced: boolean }) {
  const sources = useMemo(() => (reduced ? null : pickVideo()), [reduced])
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = video.current
    if (!v) return
    v.play().catch(() => setPlaying(false))
    // Pause the film while the hero is off screen to save battery.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.05 })
    io.observe(v)
    return () => io.disconnect()
  }, [sources])
  return (
    <>
      <picture>
        <source media="(max-width: 899px)" srcSet="/media/hero-poster-sm.webp" />
        <img src="/media/hero-poster.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-80" fetchPriority="high" />
      </picture>
      {sources && (
        <video
          ref={video}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${playing ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/media/hero-poster.webp"
          onPlaying={() => setPlaying(true)}
          aria-hidden
        >
          {sources.map((x) => (
            <source key={x.src} src={x.src} type={x.type} />
          ))}
        </video>
      )}
    </>
  )
}

const LINE1 = 'This is not just a game.'
const LINE2 = 'This is ARENA11.'

export default function Hero() {
  const reduced = useReducedMotion()
  const root = useRef<HTMLElement>(null)
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
    intro
      .from(q('.hero-bar'), { height: '50%', duration: 1.8, ease: 'expo.inOut' }, 0.2)
      .from(q('.hero-media'), { scale: 1.3, filter: 'brightness(0) blur(6px)', duration: 3.4, ease: 'power2.out' }, 0.2)
      .from(q('.hero-hud'), { opacity: 0, duration: 1 }, 1.4)
      // Logo: a scan line wipes it on, a hard flicker, then a light sweep.
      .fromTo(
        q('.hero-logo'),
        { clipPath: 'inset(-30% 110% -30% -10%)' },
        { clipPath: 'inset(-30% -10% -30% -10%)', duration: 1.1, ease: 'power2.inOut', clearProps: 'clipPath' },
        1.3,
      )
      .fromTo(q('.hero-scan'), { left: '0%', opacity: 1 }, { left: '100%', duration: 1.1, ease: 'power2.inOut' }, 1.3)
      .to(q('.hero-scan'), { opacity: 0, duration: 0.2 }, 2.4)
      .to(q('.hero-logo'), { keyframes: { opacity: [1, 0.25, 1, 0.5, 1] }, duration: 0.45, ease: 'none' }, 2.4)
      .fromTo(q('.hero-sweep'), { xPercent: -160 }, { xPercent: 260, duration: 1.4, ease: 'power2.inOut' }, 2.7)
      .from(q('.hero-char'), { yPercent: 120, opacity: 0, filter: 'blur(10px)', duration: 1, stagger: { each: 0.045, from: 'random' } }, 2.7)
      .from(q('.hero-line'), { scaleX: 0, duration: 1.2, ease: 'expo.out' }, 3.2)
      .from(q('.hero-rise'), { y: 24, opacity: 0, duration: 0.9, stagger: 0.12 }, 3.4)

    // Scroll: the camera keeps "moving in" while the type lifts away and the frame fades to black.
    const out = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: '+=70%', scrub: 0.6, pin: true, anticipatePin: 1 } })
    out
      .to(q('.hero-media'), { scale: 1.18, yPercent: 6, ease: 'none' }, 0)
      .to(q('.hero-content'), { yPercent: -28, opacity: 0, filter: 'blur(6px)', ease: 'none' }, 0)
      .to(q('.hero-hud'), { opacity: 0, ease: 'none' }, 0)
      .to(q('.hero-fade'), { opacity: 1, ease: 'none' }, 0.25)
    return () => {
      intro.kill()
    }
  })

  return (
    <section ref={root} className="relative h-[100svh] overflow-hidden bg-black" aria-label="ARENA11">
      <div className="hero-media absolute inset-0 overflow-hidden will-change-transform">
        <ArenaFilm reduced={reduced} />
      </div>
      {!reduced && (
        <Suspense fallback={null}>
          <HeroAtmosphere />
        </Suspense>
      )}
      <div className="hero-rays pointer-events-none absolute inset-0" aria-hidden />
      <div className="grade absolute inset-0" />
      {/* Scrim behind the type so the film never competes with the logo. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_50%,rgb(0_0_0/0.62),transparent_75%)]" />
      <div className="vignette absolute inset-0" />
      <div className="hero-bar absolute inset-x-0 top-0 z-[3] h-[7%] bg-black" />
      <div className="hero-bar absolute inset-x-0 bottom-0 z-[3] h-[7%] bg-black" />

      <div className="hero-hud pointer-events-none absolute inset-x-[var(--edge)] bottom-[10%] top-[12%] z-[4] hidden sm:block">
        <div className="brackets" />
        <div className="absolute left-4 top-3 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/60">
          Sector 11 // Training ground <span className="blink text-hazard">● Rec</span>
        </div>
        <div className="absolute right-4 top-3 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/60">
          {BRAND.red} vs {BRAND.blue}
        </div>
      </div>

      <div className="hero-content relative z-[5] mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-[var(--edge)] pb-10 pt-20 text-center">
        <div className="relative drop-shadow-[0_14px_30px_rgb(0_0_0/0.9)]">
          <span className="pointer-events-none absolute -inset-x-[12%] -inset-y-[35%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.6),transparent)]" aria-hidden />
          <div
            className="hero-logo relative"
            style={{ WebkitMaskImage: `url(${LOGO.src})`, maskImage: `url(${LOGO.src})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }}
          >
            <BrandLogo size="xl" className="!drop-shadow-none" />
            <span className="hero-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[#fff3e0]/40 to-transparent mix-blend-overlay" aria-hidden />
          </div>
          <span className="hero-scan pointer-events-none absolute -inset-y-4 w-[2px] bg-hazard opacity-0 shadow-[0_0_24px_6px_rgb(255_90_31/0.5)]" aria-hidden />
        </div>

        <h1 className="mt-8 font-display uppercase leading-[0.95] sm:mt-10">
          <span className="sr-only">
            {LINE1} {LINE2}
          </span>
          <span aria-hidden className="block overflow-hidden text-[clamp(1.6rem,5vw,3.6rem)] text-bone">
            {LINE1.split(' ').map((w, i) => (
              <span key={i} className="hero-char mr-[0.25em] inline-block last:mr-0">
                {w}
              </span>
            ))}
          </span>
          <span aria-hidden className="block overflow-hidden text-[clamp(2rem,6.5vw,4.8rem)] text-hazard [text-shadow:0_0_40px_rgb(255_74_28/0.45)]">
            {LINE2.split(' ').map((w, i) => (
              <span key={i} className="hero-char mr-[0.25em] inline-block last:mr-0">
                {w}
              </span>
            ))}
          </span>
        </h1>
        <span className="hero-line mt-5 block h-px w-40 origin-center bg-gradient-to-r from-transparent via-hazard to-transparent" aria-hidden />
        <p className="hero-rise mt-6 max-w-xl text-lg text-bone/80 sm:text-xl">Enter the battlefield. Build your squad. Dominate the arena.</p>
        <div className="hero-rise mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <button type="button" className="btn-hazard" onClick={() => requestBooking({})}>
            Enter the arena
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <a
            href="#missions"
            className="btn-ghost"
            onClick={(e) => {
              if (scrollToHash('#missions')) e.preventDefault()
            }}
          >
            Explore game modes
          </a>
        </div>
      </div>

      <a
        href="#briefing"
        onClick={(e) => {
          if (scrollToHash('#briefing')) e.preventDefault()
        }}
        className="hero-rise absolute bottom-[9%] left-1/2 z-[5] flex -translate-x-1/2 flex-col items-center gap-2 text-bone/60 transition hover:text-bone"
        aria-label="Scroll to deploy"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.4em]">Scroll to deploy</span>
        <span className="relative h-9 w-5 rounded-full border border-current">
          <span className="scroll-cue absolute left-1/2 top-1.5 h-2 w-0.5 -translate-x-1/2 bg-hazard" />
        </span>
      </a>
      <span className="absolute bottom-[9%] right-[var(--edge)] z-[5] hidden font-mono text-[9px] uppercase tracking-[0.3em] text-bone/40 md:block">
        Concept render · not live footage
      </span>
      <div className="hero-fade pointer-events-none absolute inset-0 z-[6] bg-black opacity-0" />
    </section>
  )
}
