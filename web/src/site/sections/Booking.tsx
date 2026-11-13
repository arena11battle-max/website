import { Link } from 'react-router-dom'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WEAPONS } from '../../three/data'
import { GAME_MODES, onBookingIntent, type GameModeId } from '../bookingIntent'
import { gsap, useGsap } from '../motion'
import { useSiteSettings } from '../settings'
import { SplitWords } from '../SplitWords'

interface Form {
  name: string
  phone: string
  email: string
  players: string
  date: string
  time: string
  notes: string
  mode: GameModeId | ''
  loadout: string
  website: string
}

const EMPTY: Form = { name: '', phone: '', email: '', players: '4', date: '', time: '', notes: '', mode: '', loadout: '', website: '' }

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function validateBooking(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.name.trim().length < 2) e.name = 'Enter your name.'
  if (!/^\+?[0-9][0-9\s-]{8,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number.'
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email or leave it blank.'
  const n = Number(f.players)
  if (!Number.isInteger(n) || n < 2 || n > 8) e.players = 'Between 2 and 8 players.'
  if (!f.date) e.date = 'Pick a date.'
  else if (f.date < today()) e.date = 'Pick today or a future date.'
  if (!f.time) e.time = 'Pick a time.'
  if (f.notes.length > 1000) e.notes = 'Keep it under 1000 characters.'
  return e
}

function Input({ label, error, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; id: string }) {
  return (
    <label htmlFor={id} className="bk-field block">
      <span className="label">{label}</span>
      <span className="field-wrap mt-1.5">
        <input id={id} {...props} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={`field ${error ? '!border-red' : ''}`} />
      </span>
      {error && (
        <span id={`${id}-err`} className="mt-1 block text-sm text-red">
          {error}
        </span>
      )}
    </label>
  )
}

function Choice<T extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: T | ''; options: { id: T; label: string }[]; onChange: (v: T | '') => void }) {
  return (
    <fieldset className="bk-field sm:col-span-2">
      <legend className="label">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {[{ id: '' as T | '', label: 'No preference' }, ...options].map((o) => (
          <label key={o.id || 'none'} className={`choice ${value === o.id ? 'is-on' : ''}`}>
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Animated "request logged" card: a ring draws, the tick strikes, and the reference types out. */
function Confirmation({ reference, summary, onAgain }: { reference: string; summary: string; onAgain: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLSpanElement>(null)
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    const tl = gsap.timeline()
    tl.from(el, { clipPath: 'inset(50% 0% 50% 0%)', duration: 0.7, ease: 'expo.inOut' })
      .fromTo(q('.cf-ring'), { strokeDashoffset: 176 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0.3)
      .fromTo(q('.cf-tick'), { strokeDashoffset: 40 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power3.out' }, 1.05)
      .from(q('.cf-stamp'), { scale: 1.8, opacity: 0, rotate: -8, duration: 0.5, ease: 'back.out(2)' }, 1.2)
      .from(q('.cf-rise'), { y: 18, opacity: 0, stagger: 0.1, duration: 0.6, ease: 'power3.out' }, 1.4)
    const obj = { n: 0 }
    tl.to(obj, { n: reference.length, duration: 0.8, ease: 'none', onUpdate: () => ref.current && (ref.current.textContent = reference.slice(0, Math.round(obj.n))) }, 1.5)
  })
  return (
    <div ref={root} className="plate mt-8 overflow-hidden p-8 sm:p-10" role="status">
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden>
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
          <circle className="cf-ring" cx="32" cy="32" r="28" fill="none" stroke="var(--color-hazard)" strokeWidth="2.5" strokeDasharray="176" transform="rotate(-90 32 32)" />
          <path className="cf-tick" d="M20 33l8 8 16-17" fill="none" stroke="var(--color-bone)" strokeWidth="3" strokeLinecap="square" strokeDasharray="40" />
        </svg>
        <div>
          <span className="cf-stamp inline-block border-2 border-hazard px-2 py-0.5 font-display text-sm uppercase tracking-[0.2em] text-hazard">Request logged</span>
          <p className="cf-rise mt-2 font-display text-2xl uppercase text-bone sm:text-3xl">Deployment request received</p>
        </div>
      </div>
      <p className="cf-rise mt-6 font-mono text-sm uppercase tracking-[0.2em] text-smoke">
        Reference <span ref={ref} className="digits text-bone">{reference}</span>
      </p>
      {summary && <p className="cf-rise mt-2 text-bone/80">{summary}</p>}
      <p className="cf-rise mt-4 text-smoke">This is an enquiry, not a confirmed booking. Our team will call you to confirm the slot.</p>
      <button type="button" className="cf-rise btn-ghost mt-8 text-xs" onClick={onAgain}>
        Send another enquiry
      </button>
    </div>
  )
}

export default function Booking() {
  const s = useSiteSettings()
  const root = useRef<HTMLElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [f, setF] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')
  const [serverError, setServerError] = useState('')
  const [done, setDone] = useState<{ reference: string; summary: string } | null>(null)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  // Cards elsewhere on the page can preselect a mode or loadout.
  useEffect(
    () =>
      onBookingIntent((intent) => {
        setDone(null)
        setF((cur) => ({ ...cur, mode: intent.mode ?? cur.mode, loadout: intent.loadout ?? cur.loadout }))
        const el = form.current
        if (el && matchMedia('(prefers-reduced-motion: no-preference)').matches)
          gsap.fromTo(el, { boxShadow: '0 0 0 1px rgb(255 90 31 / 0.9), 0 0 60px rgb(255 90 31 / 0.25)' }, { boxShadow: '0 0 0 1px rgb(255 90 31 / 0), 0 0 0 rgb(0 0 0 / 0)', duration: 1.8, delay: 1 })
      }),
    [],
  )

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.bk-field'), { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, scrollTrigger: { trigger: q('form')[0] ?? el, start: 'top 80%' } })
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateBooking(f)
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (form.current && matchMedia('(prefers-reduced-motion: no-preference)').matches) gsap.fromTo(form.current, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' })
      return
    }
    if (import.meta.env.VITE_PREVIEW) {
      setServerError('This is a preview of the website, so enquiries are not sent yet. Booking goes live once the site is hosted with its server.')
      setState('error')
      return
    }
    setState('sending')
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: f.name.trim(),
          phone: f.phone.trim(),
          email: f.email.trim() || undefined,
          players: Number(f.players),
          date: f.date,
          time: f.time,
          notes: f.notes.trim() || undefined,
          mode: f.mode || undefined,
          loadout: f.loadout || undefined,
          website: f.website,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not send your enquiry.')
      const mode = GAME_MODES.find((m) => m.id === f.mode)?.label
      setDone({
        reference: body.reference,
        summary: [`${f.players} players`, new Date(`${f.date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ` at ${f.time}`, mode, f.loadout && `${f.loadout} loadout`]
          .filter(Boolean)
          .join(' · '),
      })
      setF(EMPTY)
      setState('idle')
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not send your enquiry.')
      setState('error')
    }
  }

  return (
    <section ref={root} id="book" className="site-section bg-[#080808]" aria-labelledby="book-title">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <img src="/media/real/arena-field.webp" alt="" loading="lazy" data-parallax="0.25" className="h-[130%] w-full object-cover opacity-[0.12]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080808] via-transparent to-[#080808]" />
      </div>
      <div className="relative mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="kicker">12 // Deployment request</p>
          <SplitWords as="h2" id="book-title" className="headline mt-4 text-bone" parts={['Book your', { t: 'match', className: 'text-hazard' }]} />
          <p className="reveal mt-4 max-w-xl text-smoke">
            Send an enquiry and our team will call you to confirm the slot. Submitting this form does not confirm a booking.
          </p>

          {done ? (
            <Confirmation reference={done.reference} summary={done.summary} onAgain={() => setDone(null)} />
          ) : (
            <form ref={form} onSubmit={submit} noValidate className="plate mt-8 grid gap-5 p-6 transition-shadow sm:grid-cols-2 sm:p-8">
              <Input id="b-name" label="Name" autoComplete="name" value={f.name} onChange={set('name')} error={errors.name} required />
              <Input id="b-phone" label="Contact number" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} error={errors.phone} required />
              <Input id="b-email" label="Email (optional)" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} />
              <label htmlFor="b-players" className="bk-field block">
                <span className="label">Number of players</span>
                <span className="field-wrap mt-1.5">
                  <select id="b-players" value={f.players} onChange={set('players')} className="field">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </span>
                {errors.players && <span className="mt-1 block text-sm text-red">{errors.players}</span>}
              </label>
              <Input id="b-date" label="Preferred date" type="date" min={today()} value={f.date} onChange={set('date')} error={errors.date} required />
              <Input id="b-time" label="Preferred time" type="time" value={f.time} onChange={set('time')} error={errors.time} required />
              <Choice name="mode" label="Game mode" value={f.mode} options={GAME_MODES.map((m) => ({ id: m.id, label: m.label }))} onChange={(v) => setF({ ...f, mode: v })} />
              <Choice name="loadout" label="Preferred loadout" value={f.loadout} options={WEAPONS.map((w) => ({ id: w.name, label: w.name }))} onChange={(v) => setF({ ...f, loadout: v })} />
              <label htmlFor="b-notes" className="bk-field block sm:col-span-2">
                <span className="label">Special requests</span>
                <span className="field-wrap mt-1.5">
                  <textarea id="b-notes" rows={4} value={f.notes} onChange={set('notes')} className="field resize-y" placeholder="Birthday, corporate team, custom mission setup…" />
                </span>
                {errors.notes && <span className="mt-1 block text-sm text-red">{errors.notes}</span>}
              </label>
              {/* Honeypot for bots; hidden from people and screen readers. */}
              <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              {state === 'error' && <p className="text-sm text-red sm:col-span-2">{serverError}</p>}
              <button type="submit" disabled={state === 'sending'} className={`bk-field btn-hazard relative overflow-hidden sm:col-span-2 ${state === 'sending' ? 'is-sending' : ''}`}>
                <span className="relative">{state === 'sending' ? 'Transmitting…' : 'Send enquiry'}</span>
              </button>
              <p className="text-xs text-dim sm:col-span-2">
                We use your details only to respond to this enquiry. See the <Link to="/privacy" className="underline">privacy policy</Link>.
              </p>
            </form>
          )}
        </div>

        <aside className="reveal space-y-4" style={{ '--d': '150ms' } as React.CSSProperties}>
          <div className="plate p-6">
            <h3 className="label !text-hazard">Location</h3>
            <p className="mt-2 whitespace-pre-line text-lg">{s.address || 'Venue address to be announced.'}</p>
            {s.directions && <p className="mt-2 text-sm text-smoke">{s.directions}</p>}
            {s.mapsUrl && (
              <a href={s.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-4 text-xs">
                Get directions
              </a>
            )}
          </div>
          <div className="plate p-6">
            <h3 className="label !text-hazard">Contact</h3>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-smoke">Phone</dt>
                <dd>{s.phone ? <a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a> : <span className="text-dim">To be announced</span>}</dd>
              </div>
              {s.whatsapp && (
                <div className="flex justify-between gap-4">
                  <dt className="text-smoke">WhatsApp</dt>
                  <dd>
                    <a href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                      {s.whatsapp}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-smoke">Email</dt>
                <dd className="break-all text-right">{s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : <span className="text-dim">To be announced</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-smoke">Hours</dt>
                <dd className="text-right">{s.hours || <span className="text-dim">To be announced</span>}</dd>
              </div>
              {s.pricePerHead && (
                <div className="flex justify-between gap-4">
                  <dt className="text-smoke">Price</dt>
                  <dd>{s.pricePerHead}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="border border-amber/30 bg-amber/5 p-5 text-sm text-amber">
            Eye protection is mandatory for every player. Read the <Link to="/safety" className="underline">safety rules</Link> before your mission.
          </div>
        </aside>
      </div>
    </section>
  )
}
