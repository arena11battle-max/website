import { useEffect, useRef, useState } from 'react'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** True once the element has come within `margin` of the viewport (and stays true). */
export function useNearView<T extends Element>(margin = '300px') {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') return setNear(true)
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [margin, near])
  return { ref, near }
}

/** Live visibility, for pausing render loops when a 3D section scrolls out of view. */
export function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return visible
}

/** Adds `.in` to every `.reveal` element under the root as it scrolls into view. */
export function useRevealAll(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = el.querySelectorAll('.reveal')
    if (typeof IntersectionObserver === 'undefined') return items.forEach((i) => i.classList.add('in'))
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { rootMargin: '0px 0px -8% 0px' },
    )
    items.forEach((i) => io.observe(i))
    return () => io.disconnect()
  })
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
