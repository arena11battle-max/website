import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useLayoutEffect, type DependencyList, type RefObject } from 'react'

// Cinematic motion for the public site: GSAP + ScrollTrigger on top of Lenis smooth scrolling.
// Every effect is wrapped in a "no-preference" media query, so visitors who ask for reduced motion get a still page.

gsap.registerPlugin(ScrollTrigger)
export { gsap, ScrollTrigger }

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
const HEADER = 56

let lenis: Lenis | null = null

/** Starts smooth wheel scrolling (touch keeps native scrolling). Returns a stop function. */
export function startSmoothScroll() {
  if (typeof window === 'undefined' || !matchMedia(MOTION_OK).matches) return () => {}
  const l = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9 })
  lenis = l
  l.on('scroll', ScrollTrigger.update)
  const tick = (t: number) => l.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => {
    gsap.ticker.remove(tick)
    l.destroy()
    if (lenis === l) lenis = null
  }
}

/** Scrolls to an in-page anchor such as "#book", smoothly when allowed. */
export function scrollToHash(hash: string) {
  const el = document.querySelector<HTMLElement>(hash)
  if (!el) return false
  if (lenis) lenis.scrollTo(el, { offset: -HEADER + 8, duration: 1.4 })
  else el.scrollIntoView({ behavior: matchMedia(MOTION_OK).matches ? 'smooth' : 'auto' })
  return true
}

/** Scrolls to a page offset in pixels, smoothly when allowed. */
export function scrollToY(y: number) {
  if (lenis) lenis.scrollTo(y, { duration: 1.2 })
  else window.scrollTo({ top: y, behavior: matchMedia(MOTION_OK).matches ? 'smooth' : 'auto' })
}

/**
 * Runs GSAP setup inside a context scoped to `scope`, only when motion is allowed, and reverts it on unmount.
 * The callback may return a cleanup function.
 */
export function useGsap(scope: RefObject<HTMLElement | null>, setup: (self: HTMLElement) => void | (() => void), deps: DependencyList = []) {
  useLayoutEffect(() => {
    const el = scope.current
    if (!el) return
    const mm = gsap.matchMedia(el)
    mm.add(MOTION_OK, () => setup(el))
    return () => mm.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * Page-wide scroll effects driven by data attributes, so sections only mark up what should move:
 *   data-split      words rise out of a mask (use <SplitWords>)
 *   data-parallax   moves at the given speed while the section scrolls (e.g. "0.2")
 *   data-clip       image wipes in from the bottom and settles from a zoom
 *   data-count      number counts up to its text value
 */
export function bindScrollEffects(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-split]')) {
    gsap.from(el.querySelectorAll('.sw > span'), {
      yPercent: 110,
      rotate: 4,
      duration: 1.1,
      ease: 'power4.out',
      stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 88%' },
    })
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-parallax]')) {
    const speed = Number(el.dataset.parallax) || 0.2
    gsap.fromTo(
      el,
      { yPercent: -speed * 50 },
      { yPercent: speed * 50, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: true } },
    )
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-clip]')) {
    const img = el.querySelector('img, video')
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%' } })
    tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' })
    if (img) tl.fromTo(img, { scale: 1.35 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, 0.2)
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-count]')) {
    const end = Number(el.dataset.count)
    if (!Number.isFinite(end)) continue
    const obj = { v: 0 }
    gsap.to(obj, {
      v: end,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => (el.textContent = String(Math.round(obj.v))),
    })
  }
}
