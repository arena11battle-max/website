import { getApps, initializeApp } from 'firebase/app'
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSiteSettings } from '../settings'
import { SplitWords } from '../SplitWords'

interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

interface Customer {
  id: number
  mobile: string | null
  name: string | null
  email: string | null
}

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

interface CustomerBooking {
  id: number
  reference: string
  packageId: string | null
  packageName: string | null
  players: number
  date: string
  time: string
  amountInr: number
  status: string
}

const PACKAGES: PackageOption[] = [
  { id: '1v1', name: '1 vs 1 TDM Duel', players: 2, amountInr: 300, duration: '30–40 min', available: true },
  { id: '2v2', name: '2 vs 2 TDM Squad', players: 4, amountInr: 500, duration: '30–40 min', available: false },
]

const CUSTOMER_TOKEN_KEY = 'arena11_customer_token'
const WHATSAPP_NUMBER = '917981047612'

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function validateBooking(f: { name: string; date: string; time: string }) {
  const e: Record<string, string> = {}
  if (f.name.trim().length < 2) e.name = 'Enter your name.'
  if (!f.date || f.date < today()) e.date = 'Pick today or a future date.'
  if (!f.time) e.time = 'Pick an available time slot.'
  return e
}

export default function Booking() {
  const s = useSiteSettings()
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(CUSTOMER_TOKEN_KEY))
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [myBookings, setMyBookings] = useState<CustomerBooking[]>([])

  // Google Sign-In state
  const [firebaseCfg, setFirebaseCfg] = useState<FirebaseWebConfig | null>(null)
  const [mobile, setMobile] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  // Booking state
  const [pkgId, setPkgId] = useState<PackageOption['id']>('1v1')
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState('')

  // QR payment step state
  const [qrStep, setQrStep] = useState<{
    reference: string
    packageName: string
    players: number
    date: string
    time: string
    amountInr: number
    waUrl: string
  } | null>(null)
  const [qrMissing, setQrMissing] = useState(false)

  useEffect(() => {
    fetch('/api/customer/auth/config')
      .then((r) => (r.ok ? r.json() : { firebase: null }))
      .then(async (d) => {
        const cfg = d.firebase ?? null
        setFirebaseCfg(cfg)
        if (!cfg) return
        const app = getApps()[0] ?? initializeApp(cfg)
        const auth = getAuth(app)
        const res = await getRedirectResult(auth).catch(() => null)
        if (res?.user) {
          const idToken = await res.user.getIdToken()
          const vRes = await fetch('/api/customer/auth/firebase-verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idToken }),
          })
          const vData = await vRes.json().catch(() => ({}))
          if (vRes.ok && vData.token) {
            localStorage.setItem(CUSTOMER_TOKEN_KEY, vData.token)
            setToken(vData.token)
            setCustomer(vData.customer)
            if (vData.customer?.name) setName((prev) => prev || vData.customer.name)
            if (vData.customer?.email) setEmail((prev) => prev || vData.customer.email)
          }
        }
      })
      .catch(() => {})
  }, [])

  const loadCustomer = useCallback(async (tok: string) => {
    try {
      const res = await fetch('/api/customer/me', { headers: { authorization: `Bearer ${tok}` } })
      if (!res.ok) {
        localStorage.removeItem(CUSTOMER_TOKEN_KEY)
        setToken(null)
        setCustomer(null)
        return
      }
      const data = await res.json()
      setCustomer(data.customer)
      setMyBookings(data.bookings ?? [])
      if (data.customer?.name) setName((cur) => cur || data.customer.name)
      if (data.customer?.email) setEmail((cur) => cur || data.customer.email)
    } catch {
      // ignore transient network errors
    }
  }, [])

  useEffect(() => {
    if (token) loadCustomer(token)
  }, [token, loadCustomer])

  const loadSlots = useCallback(async (d: string) => {
    if (!d) return
    try {
      const res = await fetch(`/api/public/bookings/slots?date=${encodeURIComponent(d)}`)
      if (!res.ok) return
      const data = await res.json()
      setSlots(data.slots ?? [])
      setTime((cur) => (data.slots?.some((x: SlotOption) => x.time === cur && x.available) ? cur : ''))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadSlots(date)
  }, [date, loadSlots])

  async function signInWithGoogle() {
    if (!firebaseCfg) {
      setAuthError('Google Sign-In is not configured yet.')
      return
    }
    setAuthBusy(true)
    setAuthError('')
    try {
      const app = getApps()[0] ?? initializeApp(firebaseCfg)
      const auth = getAuth(app)
      const provider = new GoogleAuthProvider()
      const cred = await signInWithPopup(auth, provider)
      const idToken = await cred.user.getIdToken()
      const res = await fetch('/api/customer/auth/firebase-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAuthError(data.error || 'Google sign-in failed')
        return
      }
      localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token)
      setToken(data.token)
      setCustomer(data.customer)
      if (data.customer?.name && !name) setName(data.customer.name)
      if (data.customer?.email && !email) setEmail(data.customer.email)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      if (code === 'auth/popup-blocked') {
        const app = getApps()[0] ?? initializeApp(firebaseCfg)
        await signInWithRedirect(getAuth(app), new GoogleAuthProvider())
        return
      }
      const msg = err instanceof Error ? err.message : ''
      setAuthError(msg || 'Google sign-in was cancelled or failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  function logoutCustomer() {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    setToken(null)
    setCustomer(null)
    setMyBookings([])
    setQrStep(null)
  }

  const selectedPkg = PACKAGES.find((p) => p.id === pkgId)!

  async function createBookingForQr(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    const errs = validateBooking({ name, date, time })
    if (!customer?.mobile && !/^\+?[0-9][0-9\s-]{8,16}$/.test(mobile.trim())) {
      errs.phone = 'Enter a valid +91 mobile number.'
    }
    const firstErr = Object.values(errs)[0]
    if (firstErr) {
      setBookingError(firstErr)
      return
    }
    setBookingBusy(true)
    setBookingError('')
    try {
      const phone = customer?.mobile || mobile.trim()
      const res = await fetch('/api/customer/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          packageId: pkgId,
          date,
          time,
          name: name.trim(),
          phone: customer?.mobile ? undefined : phone,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBookingError(data.error || 'Could not create booking')
        loadSlots(date)
        return
      }
      const ref: string = data.booking.reference
      const msg = [
        `Hi ARENA11! I've booked a slot and paid ₹${selectedPkg.amountInr} via QR:`,
        `Ref: ${ref}`,
        `Package: ${selectedPkg.name} (${selectedPkg.players} players · ${selectedPkg.duration})`,
        `Slot: ${date} at ${time}`,
        `Name: ${name.trim()}`,
        `Phone: ${phone}`,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
        `Attaching payment screenshot here.`,
      ]
        .filter(Boolean)
        .join('\n')

      setQrStep({
        reference: ref,
        packageName: selectedPkg.name,
        players: selectedPkg.players,
        date,
        time,
        amountInr: selectedPkg.amountInr,
        waUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      })
      loadSlots(date)
      loadCustomer(token)
    } catch {
      setBookingError('Network error while creating booking.')
    } finally {
      setBookingBusy(false)
    }
  }

  return (
    <section id="book" className="relative overflow-hidden bg-[#080808] px-[var(--edge)] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div>
            <p className="kicker">Slot Booking // UPI QR</p>
            <SplitWords as="h2" className="headline mt-4 text-bone" parts={[{ t: 'Book your' }, { t: 'mission', className: 'text-hazard' }]} />
            <p className="mt-5 max-w-md text-lg text-bone/75">
              Sign in with Google, pick an available slot, pay via UPI QR, and send your payment screenshot on WhatsApp (+91 79810 47612) to confirm.
            </p>
            {s.hours && (
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-smoke">
                Arena Hours: <span className="text-bone">{s.hours}</span>
              </p>
            )}

            {customer && myBookings.length > 0 && (
              <div className="plate mt-8 p-5">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-hazard">Your Bookings</p>
                <ul className="mt-3 divide-y divide-white/10 text-sm">
                  {myBookings.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <div className="font-mono text-xs text-bone">{b.reference} · {b.packageName ?? `${b.players} players`}</div>
                        <div className="text-xs text-smoke">{b.date} at {b.time} · ₹{b.amountInr}</div>
                      </div>
                      <span className="border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase text-hazard">
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            {!customer ? (
              <div className="plate p-6 sm:p-8">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-hazard">Step 1 // Customer Sign In</p>
                <h3 className="mt-2 font-display text-2xl uppercase text-bone">Sign In With Google</h3>
                <p className="mt-3 text-sm text-smoke">
                  Sign in with your Google account to reserve your slot and pay via QR.
                </p>
                {authError && <p className="mt-4 text-sm text-red">{authError}</p>}
                <div className="mt-6">
                  <button type="button" disabled={authBusy || !firebaseCfg} onClick={signInWithGoogle} className="btn-hazard">
                    {authBusy ? 'Signing in…' : 'Continue with Google'}
                  </button>
                </div>
              </div>
            ) : qrStep ? (
              <div className="plate space-y-5 p-6 sm:p-8" role="status">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-hazard">Step 3 // Scan &amp; Pay ₹{qrStep.amountInr}</p>
                    <h3 className="font-display text-2xl uppercase text-bone">Pay via UPI QR</h3>
                  </div>
                  <span className="font-mono text-xs text-smoke">{qrStep.reference}</span>
                </div>

                <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div className="flex aspect-square w-full max-w-[220px] items-center justify-center border border-white/15 bg-white p-2">
                    {!qrMissing ? (
                      <img
                        src="/media/payment-qr.png"
                        alt="ARENA11 UPI Payment QR Code"
                        onError={() => setQrMissing(true)}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="p-3 text-center font-mono text-xs text-black/75">
                        QR image not uploaded yet. Pay to +91 79810 47612 and send screenshot on WhatsApp.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 text-sm text-smoke">
                    <p className="text-bone">
                      1. Scan the QR code using PhonePe, GPay, Paytm, or any UPI app and pay <strong className="text-hazard">₹{qrStep.amountInr}</strong>.
                    </p>
                    <p>
                      2. Take a screenshot of the payment confirmation.
                    </p>
                    <p>
                      3. Tap below to send your screenshot to <span className="font-mono text-bone">+91 79810 47612</span> on WhatsApp to confirm your slot (<span className="font-mono text-bone">{qrStep.date} at {qrStep.time}</span>).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
                  <a href={qrStep.waUrl} target="_blank" rel="noopener noreferrer" className="btn-hazard">
                    Send Screenshot on WhatsApp
                  </a>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setQrStep(null)}>
                    Book Another Slot
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={createBookingForQr} noValidate className="plate grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
                <div className="sm:col-span-2 flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-lime">
                      Verified: {customer.mobile || customer.email}
                    </p>
                    <p className="font-display text-xl uppercase text-bone">Step 2 // Select Package &amp; Slot</p>
                  </div>
                  <button type="button" onClick={logoutCustomer} className="font-mono text-xs uppercase text-smoke hover:text-bone">
                    Sign out
                  </button>
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

                {!customer.mobile && (
                  <label className="block sm:col-span-2">
                    <span className="label">Mobile Number (+91) *</span>
                    <span className="field-wrap mt-1.5">
                      <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 98765 43210" className="field" required />
                    </span>
                  </label>
                )}

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

                <label className="block">
                  <span className="label">Email (optional)</span>
                  <span className="field-wrap mt-1.5">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="field" />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Notes (optional)</span>
                  <span className="field-wrap mt-1.5">
                    <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests…" className="field" />
                  </span>
                </label>

                {bookingError && <p className="sm:col-span-2 text-sm text-red">{bookingError}</p>}

                <div className="sm:col-span-2 flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="font-mono text-sm text-smoke">
                    Total: <span className="digits text-xl font-bold text-hazard">₹{selectedPkg.amountInr}</span>
                  </div>
                  <button type="submit" disabled={bookingBusy} className="btn-hazard">
                    {bookingBusy ? 'Reserving Slot…' : `Continue to QR Pay ₹${selectedPkg.amountInr}`}
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
