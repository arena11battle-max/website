import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSiteSettings } from '../settings'
import { SplitWords } from '../SplitWords'

interface PackageOption {
  id: '1v1' | '2v2'
  name: string
  players: number
  amountInr: number
  duration: string
  available: boolean
}

interface SlotOption {
  time: string
  available: boolean
}

const PACKAGES: PackageOption[] = [
  { id: '1v1', name: '1 vs 1 TDM Duel', players: 2, amountInr: 300, duration: '30–40 min', available: true },
  { id: '2v2', name: '2 vs 2 TDM Squad', players: 4, amountInr: 500, duration: '30–40 min', available: false },
]

const DEFAULT_WHATSAPP_NUMBER = '917981047612'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeWhatsAppPhone(raw: string | undefined) {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length >= 11) return digits
  return DEFAULT_WHATSAPP_NUMBER
}

export function validateBooking(f: { name: string; phone: string; date: string; time: string }) {
  const e: Record<string, string> = {}
  if (f.name.trim().length < 2) e.name = 'Enter your name.'
  if (!/^\+?[0-9][0-9\s-]{8,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid mobile number.'
  if (!f.date || f.date < today()) e.date = 'Pick today or a future date.'
  if (!f.time) e.time = 'Pick an available time slot.'
  return e
}

export default function Booking() {
  const s = useSiteSettings()
  const whatsappNumber = normalizeWhatsAppPhone(s.phone)

  const [pkgId, setPkgId] = useState<PackageOption['id']>('1v1')
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ reference: string; waUrl: string } | null>(null)

  const loadSlots = useCallback(async (d: string) => {
    if (!d) return
    try {
      const res = await fetch(`/api/public/bookings/slots?date=${encodeURIComponent(d)}`)
      if (!res.ok) return
      const data = await res.json()
      setSlots(data.slots ?? [])
      setTime((cur) => (data.slots?.some((x: SlotOption) => x.time === cur && x.available) ? cur : ''))
    } catch {
      // ignore transient network errors
    }
  }, [])

  useEffect(() => {
    loadSlots(date)
  }, [date, loadSlots])

  const selectedPkg = PACKAGES.find((p) => p.id === pkgId)!

  async function submitWhatsAppBooking(e: FormEvent) {
    e.preventDefault()
    const errs = validateBooking({ name, phone: mobile, date, time })
    const firstErr = Object.values(errs)[0]
    if (firstErr) {
      setError(firstErr)
      return
    }

    setBusy(true)
    setError('')
    let reference = ''

    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: mobile.trim(),
          players: selectedPkg.players,
          date,
          time,
          mode: 'tdm',
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.reference) reference = data.reference
    } catch {
      // Still allow WhatsApp redirect even if background logging fails.
    } finally {
      setBusy(false)
    }

    const lines = [
      `Hi ARENA11! I'd like to book a slot:`,
      reference ? `Ref: ${reference}` : null,
      `Package: ${selectedPkg.name} (${selectedPkg.players} players · ${selectedPkg.duration}) — ₹${selectedPkg.amountInr}`,
      `Date: ${date}`,
      `Time: ${time}`,
      `Name: ${name.trim()}`,
      `Phone: ${mobile.trim()}`,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ].filter(Boolean)

    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`
    setSent({ reference, waUrl })
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section id="book" className="relative overflow-hidden bg-[#080808] px-[var(--edge)] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div>
            <p className="kicker">WhatsApp Booking</p>
            <SplitWords as="h2" className="headline mt-4 text-bone" parts={[{ t: 'Book your' }, { t: 'mission', className: 'text-hazard' }]} />
            <p className="mt-5 max-w-md text-lg text-bone/75">
              Pick your TDM package, date, and available time slot, then confirm directly with our team on WhatsApp.
            </p>
            {s.hours && (
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-smoke">
                Arena Hours: <span className="text-bone">{s.hours}</span>
              </p>
            )}
            <div className="mt-6">
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi ARENA11! I'd like to book a TDM slot.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost inline-flex items-center gap-2 text-xs"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>

          <div>
            {sent ? (
              <div className="plate p-6 sm:p-8" role="status">
                <span className="inline-block border-2 border-lime px-2.5 py-0.5 font-display text-xs uppercase tracking-[0.2em] text-lime">
                  Redirected to WhatsApp
                </span>
                <h3 className="mt-3 font-display text-3xl uppercase text-bone">Confirm on WhatsApp</h3>
                <p className="mt-2 text-sm text-smoke">
                  {sent.reference ? (
                    <>
                      Reference <span className="font-mono text-bone">{sent.reference}</span> — send the pre-filled message in WhatsApp to confirm your slot.
                    </>
                  ) : (
                    'Send the pre-filled message in WhatsApp to confirm your slot.'
                  )}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href={sent.waUrl} target="_blank" rel="noopener noreferrer" className="btn-hazard">
                    Open WhatsApp Chat
                  </a>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setSent(null)}>
                    Book Another Slot
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitWhatsAppBooking} noValidate className="plate grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
                <div className="sm:col-span-2 border-b border-white/10 pb-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-hazard">Step 1 // Select Package &amp; Slot</p>
                  <p className="font-display text-xl uppercase text-bone">Book via WhatsApp</p>
                </div>

                <div className="sm:col-span-2">
                  <span className="label">Booking Package (TDM · 30–40 min)</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PACKAGES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!p.available}
                        onClick={() => setPkgId(p.id)}
                        className={`choice justify-between px-4 py-3 text-left ${pkgId === p.id ? 'is-on' : ''} ${!p.available ? 'cursor-not-allowed opacity-55' : ''}`}
                      >
                        <div>
                          <div>{p.name}</div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-smoke">
                            {p.players} players · {p.duration}
                            {!p.available && ' · Launching Soon'}
                          </div>
                        </div>
                        <span className="digits font-mono text-hazard">₹{p.amountInr}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="label">Date *</span>
                  <span className="field-wrap mt-1.5">
                    <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className="field" required />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Your Name *</span>
                  <span className="field-wrap mt-1.5">
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="field" required />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Mobile Number (+91) *</span>
                  <span className="field-wrap mt-1.5">
                    <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 98765 43210" className="field" required />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Notes (optional)</span>
                  <span className="field-wrap mt-1.5">
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests…" className="field" />
                  </span>
                </label>

                <div className="sm:col-span-2">
                  <span className="label">Available Time Slots ({date}) *</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {slots.map((sl) => (
                      <button
                        key={sl.time}
                        type="button"
                        disabled={!sl.available}
                        onClick={() => setTime(sl.time)}
                        className={`choice font-mono text-xs ${time === sl.time ? 'is-on' : ''} ${!sl.available ? 'cursor-not-allowed opacity-35 line-through' : ''}`}
                      >
                        {sl.time} {!sl.available && '(Booked)'}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="sm:col-span-2 text-sm text-red">{error}</p>}

                <div className="sm:col-span-2 flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="font-mono text-sm text-smoke">
                    Total: <span className="digits text-xl font-bold text-hazard">₹{selectedPkg.amountInr}</span>
                  </div>
                  <button type="submit" disabled={busy} className="btn-hazard">
                    {busy ? 'Opening WhatsApp…' : 'Book on WhatsApp'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
