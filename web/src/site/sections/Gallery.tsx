import { useCallback, useEffect, useRef, useState } from 'react'
import { useNearView } from '../hooks'
import { SplitWords } from '../SplitWords'

import { WEAPONS } from '../../three/data'

export interface GalleryItem {
  id: string
  url: string
  thumb?: string
  caption: string
  category: Category
  kind: 'photo' | 'render' | 'supplied'
}

type Category = 'arena' | 'arsenal' | 'teams' | 'gameplay' | 'bts'

const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'arena', label: 'Arena' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'teams', label: 'Teams' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'bts', label: 'Behind the scenes' },
]

// ARENA11's own photos and footage stills, shown before the built-in concept renders.
const REAL: GalleryItem[] = [
  { id: 'p-aerial', url: '/media/real/arena-aerial-1086.webp', caption: 'The ARENA11 arena from above', category: 'arena', kind: 'photo' },
  { id: 'p-field', url: '/media/real/arena-field.webp', caption: 'The field: towers, sandbags, pallets and barrels', category: 'arena', kind: 'photo' },
  { id: 'p-gate', url: '/media/real/arena-gate.webp', caption: 'The main gate', category: 'arena', kind: 'photo' },
  { id: 'p-towers', url: '/media/real/arena-towers.webp', caption: 'Watch towers and the camo net', category: 'arena', kind: 'photo' },
  { id: 'p-pov', url: '/media/real/pov-poster.webp', caption: 'Player head camera', category: 'gameplay', kind: 'photo' },
  { id: 'p-vest-camo', url: '/media/real/vest-camo.webp', caption: 'Safety kit: camo vest', category: 'bts', kind: 'photo' },
  { id: 'p-vest-black', url: '/media/real/vest-black.webp', caption: 'Safety kit: black vest', category: 'bts', kind: 'photo' },
]

// Built-in concept renders from the site's 3D scenes. Real photos uploaded by staff are listed first and marked as photos.
const RENDERS: GalleryItem[] = [
  ...['wide', 'aerial', 'tower', 'cover', 'red', 'blue', 'lanes', 'entrance'].map((id) => ({
    id: `r-arena-${id}`,
    url: `/media/arena-${id}.webp`,
    caption: `Arena concept — ${id === 'cover' ? 'barricades' : id === 'red' ? 'red base' : id === 'blue' ? 'blue base' : id}`,
    category: 'arena' as const,
    kind: 'render' as const,
  })),
  ...WEAPONS.map((w) => ({
    id: `r-gun-${w.id}`,
    url: w.image,
    caption: w.supplied ? `Arsenal — ${w.name}` : `Arsenal concept — ${w.name}`,
    category: 'arsenal' as const,
    kind: w.supplied ? ('supplied' as const) : ('render' as const),
  })),
]

export default function Gallery() {
  const { ref, near } = useNearView<HTMLElement>('300px')
  const [photos, setPhotos] = useState<GalleryItem[]>([])
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [open, setOpen] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!near) return
    fetch('/api/public/gallery')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b) => setPhotos(b.items.map((i: GalleryItem) => ({ ...i, kind: 'photo' }))))
      .catch(() => {})
  }, [near])

  const items = [...photos, ...REAL, ...RENDERS].filter((i) => cat === 'all' || i.category === cat)
  const step = useCallback((d: number) => setOpen((o) => (o == null ? o : (o + d + items.length) % items.length)), [items.length])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open != null && !d.open) d.showModal()
    if (open == null && d.open) d.close()
  }, [open])

  useEffect(() => {
    if (open == null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, step])

  const current = open != null ? items[open] : null

  return (
    <section ref={ref} id="gallery" className="site-section" aria-labelledby="gallery-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="kicker">11 // Field archive</p>
            <SplitWords as="h2" id="gallery-title" className="headline mt-4 text-bone" parts={['The', { t: 'gallery', className: 'text-hazard' }]} />
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Gallery category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={cat === c.id}
                onClick={() => setCat(c.id)}
                className={`px-3 py-2 font-display text-[11px] uppercase tracking-[0.15em] transition ${
                  cat === c.id ? 'bg-hazard text-white' : 'border border-white/10 text-smoke hover:text-bone'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="plate mt-10 p-10 text-center">
            <p className="font-display text-2xl uppercase">Coming soon</p>
            <p className="mt-2 text-smoke">Real photos from the arena will appear here after the first missions.</p>
          </div>
        ) : (
          <div className="mt-10 columns-1 gap-3 sm:columns-2 lg:columns-3">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setOpen(i)}
                className="group relative mb-3 block w-full break-inside-avoid overflow-hidden bg-black text-left"
              >
                <img
                  src={it.thumb ?? it.url}
                  alt={it.caption}
                  loading="lazy"
                  className={`w-full object-cover transition duration-700 group-hover:scale-105 ${i % 3 === 1 ? 'aspect-[4/5]' : 'aspect-video'}`}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 transition group-hover:opacity-100" />
                <span className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-sm opacity-0 transition group-hover:opacity-100">
                  <span className="truncate font-display uppercase tracking-[0.08em]">{it.caption}</span>
                </span>
                <span className={`chip absolute left-3 top-3 bg-black/60 ${it.kind === 'render' ? 'text-amber' : 'text-lime'}`}>
                  {it.kind === 'photo' ? 'Photo' : it.kind === 'supplied' ? 'Product image' : 'Concept render'}
                </span>
              </button>
            ))}
          </div>
        )}
        {photos.length === 0 && (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-dim">
            Team photos, gameplay and behind-the-scenes footage will be added from real missions. Items marked Concept render are made from the site's 3D scenes, not photos.
          </p>
        )}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/95"
      >
        {current && (
          <figure className="relative flex h-[100dvh] w-screen flex-col items-center justify-center p-4 sm:p-10">
            <img src={current.url} alt={current.caption} className="max-h-[80dvh] max-w-full object-contain" />
            <figcaption className="mt-4 flex items-center gap-3 text-sm text-smoke">
              <span className={`chip ${current.kind === 'render' ? 'text-amber' : 'text-lime'}`}>{current.kind === 'photo' ? 'Photo' : current.kind === 'supplied' ? 'Product image' : 'Concept render'}</span>
              {current.caption}
            </figcaption>
            <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 p-3 text-2xl text-smoke hover:text-bone" aria-label="Close">
              ✕
            </button>
            <button type="button" onClick={() => step(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 p-4 text-3xl text-smoke hover:text-bone" aria-label="Previous">
              ‹
            </button>
            <button type="button" onClick={() => step(1)} className="absolute right-2 top-1/2 -translate-y-1/2 p-4 text-3xl text-smoke hover:text-bone" aria-label="Next">
              ›
            </button>
          </figure>
        )}
      </dialog>
    </section>
  )
}
