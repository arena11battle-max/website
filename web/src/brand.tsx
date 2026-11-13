// ARENA11 brand asset: ARENA11's own logo with its stone backing plate cut away at Jose's request (transparent PNG
// master in the project's brand/ folder; web sizes in public/brand/). Scaled with its aspect ratio kept, never redrawn.
export const LOGO = {
  src: '/brand/arena11-logo-1200.webp',
  srcSet: '/brand/arena11-logo-320.webp 320w, /brand/arena11-logo-600.webp 600w, /brand/arena11-logo-1200.webp 1200w, /brand/arena11-logo-2400.webp 2400w',
  width: 3152,
  height: 851,
}

export const BRAND = {
  name: 'ARENA11',
  tagline: 'REAL-LIFE TACTICAL GAMING',
  slogan: 'SQUAD UP. ENTER. DOMINATE.',
  red: 'RED WOLVES',
  blue: 'BLUE FALCONS',
}

// Widths per size; height follows the logo's own 3.7:1 ratio.
const WIDTH = {
  sm: { className: 'w-[132px]', sizes: '132px' },
  md: { className: 'w-[240px]', sizes: '240px' },
  lg: { className: 'w-[min(80vw,560px)]', sizes: '(max-width: 700px) 80vw, 560px' },
  xl: { className: 'w-[min(88vw,860px)]', sizes: '(max-width: 980px) 88vw, 860px' },
}

/** The ARENA11 logo (transparent). `showTagline` is kept for callers; the tagline is part of the artwork. */
export function BrandLogo({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; showTagline?: boolean; className?: string }) {
  const w = WIDTH[size]
  return (
    <img
      src={LOGO.src}
      srcSet={LOGO.srcSet}
      sizes={w.sizes}
      width={LOGO.width}
      height={LOGO.height}
      alt="ARENA11 — Real-life tactical gaming"
      decoding="async"
      fetchPriority={size === 'xl' ? 'high' : undefined}
      className={`block h-auto max-w-full select-none ${size === 'sm' ? 'drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)]' : 'drop-shadow-[0_10px_24px_rgb(0_0_0/0.85)]'} ${w.className} ${className}`}
      draggable={false}
    />
  )
}
