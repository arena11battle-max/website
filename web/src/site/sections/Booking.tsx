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

interface RazorpayHandlerResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open: () => void
  on: (event: string, cb: (resp: { error?: { description?: string; reason?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
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
  receiptNo: string | null
  paymentId: string | null
  paymentStatus: string | null
  paymentMethod: string | null
}

const PACKAGES: PackageOption[] = [
  { id: '1v1', name: '1 vs 1 TDM Duel', players: 2, amountInr: 300, duration: '30–40 min', available: true },
  { id: '2v2', name: '2 vs 2 TDM Squad', players: 4, amountInr: 500, duration: '30–40 min', available: false },
]

const CUSTOMER_TOKEN_KEY = 'arena11_customer_token'

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

async function hmacSha256Hex(secret: string, data: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

  // Payment state
  const [activeOrder, setActiveOrder] = useState<{
    bookingId: number
    reference: string
    orderId: string
    amountInr: number
    receiptNo: string
    mode: 'live' | 'test'
    keyId: string
  } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [payBusy, setPayBusy] = useState(false)
  const [receipt, setReceipt] = useState<{ receiptNo: string; pdfUrl: string } | null>(null)

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
    setActiveOrder(null)
    setReceipt(null)
  }

  async function createBookingAndOrder(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    const errs = validateBooking({ name, date, time })
    if (Object.keys(errs).length) {
      setBookingError(Object.values(errs)[0])
      return
    }
    setBookingBusy(true)
    setBookingError('')
    setReceipt(null)
    try {
      const bRes = await fetch('/api/customer/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          packageId: pkgId,
          date,
          time,
          name: name.trim(),
          phone: customer?.mobile ? undefined : mobile.trim(),
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const bData = await bRes.json().catch(() => ({}))
      if (!bRes.ok) {
        setBookingError(bData.error || 'Could not create booking')
        loadSlots(date)
        return
      }
      const oRes = await fetch('/api/customer/payments/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: bData.booking.id }),
      })
      const oData = await oRes.json().catch(() => ({}))
      if (!oRes.ok) {
        setBookingError(oData.error || 'Could not create payment order')
        return
      }
      setActiveOrder({
        bookingId: bData.booking.id,
        reference: bData.booking.reference,
        orderId: oData.orderId,
        amountInr: oData.amountInr,
        receiptNo: oData.receiptNo,
        mode: oData.mode,
        keyId: oData.keyId,
      })
      loadSlots(date)
      loadCustomer(token)
    } catch {
      setBookingError('Network error while creating booking.')
    } finally {
      setBookingBusy(false)
    }
  }

  async function verifyPaymentWithServer(orderId: string, paymentId: string, signature: string, method?: string) {
    if (!token) return
    setPayBusy(true)
    setBookingError('')
    try {
      const res = await fetch('/api/customer/payments/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, paymentId, signature, method }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBookingError(data.error || 'Payment verification failed')
        return
      }
      setReceipt({ receiptNo: data.receiptNo, pdfUrl: data.receiptPdfUrl })
      setActiveOrder(null)
      loadCustomer(token)
    } catch {
      setBookingError('Network error during payment verification.')
    } finally {
      setPayBusy(false)
    }
  }

  function openRazorpayCheckout() {
    if (!token || !activeOrder) return
    if (!window.Razorpay) {
      setBookingError('Razorpay checkout script failed to load. Please refresh and try again.')
      return
    }
    setBookingError('')
    setPayBusy(true)
    const rzp = new window.Razorpay({
      key: activeOrder.keyId,
      amount: activeOrder.amountInr * 100,
      currency: 'INR',
      name: 'ARENA11',
      description: `${selectedPkg.name} (${activeOrder.reference})`,
      order_id: activeOrder.orderId,
      prefill: {
        name: name.trim(),
        email: (email || customer?.email || '').trim(),
        contact: (customer?.mobile || mobile).trim(),
      },
      theme: { color: '#ff5a1f' },
      handler: (response: RazorpayHandlerResponse) => {
        void verifyPaymentWithServer(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
          'razorpay',
        )
      },
      modal: {
        ondismiss: () => {
          setPayBusy(false)
          setBookingError('Payment cancelled. Click Pay to try again.')
        },
      },
    })
    rzp.on('payment.failed', (resp) => {
      setPayBusy(false)
      const reason = resp.error?.description || 'Payment failed'
      setBookingError(reason)
      void fetch('/api/customer/payments/fail', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: activeOrder.orderId, reason }),
      }).catch(() => {})
    })
    rzp.open()
  }

  async function completeTestPayment() {
    if (!token || !activeOrder) return
    const paymentId = `pay_test_${Math.random().toString(16).slice(2, 10)}`
    const signature = await hmacSha256Hex('arena11-test-gateway', `${activeOrder.orderId}|${paymentId}`)
    await verifyPaymentWithServer(activeOrder.orderId, paymentId, signature, paymentMethod)
  }

  async function failTestPayment() {
    if (!token || !activeOrder) return
    setPayBusy(true)
    try {
      await fetch('/api/customer/payments/fail', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: activeOrder.orderId, reason: 'customer_cancelled' }),
      })
      setBookingError('Payment failed or was cancelled. Your booking remains pending.')
      setActiveOrder(null)
      loadCustomer(token)
    } finally {
      setPayBusy(false)
    }
  }

  const selectedPkg = PACKAGES.find((p) => p.id === pkgId)!

  return (
    <section id="book" className="relative overflow-hidden bg-[#080808] px-[var(--edge)] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div>
            <p className="kicker">Online Booking &amp; Payment</p>
            <SplitWords as="h2" className="headline mt-4 text-bone" parts={[{ t: 'Book your' }, { t: 'mission', className: 'text-hazard' }]} />
            <p className="mt-5 max-w-md text-lg text-bone/75">
              Sign in with your Google account, pick an available slot, and pay online via UPI, Card, or Netbanking.
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
                      <div className="flex items-center gap-2">
                        <span className="border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase text-hazard">
                          {b.status.replace(/_/g, ' ')}
                        </span>
                        {b.receiptNo && b.paymentStatus === 'paid' && (
                          <a href={`/api/customer/payments/${b.receiptNo}/pdf`} className="font-mono text-xs text-lime underline">
                            Receipt
                          </a>
                        )}
                      </div>
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
                  Use your Google account to book your slot, pay online, and access your receipts.
                </p>
                {authError && <p className="mt-4 text-sm text-red">{authError}</p>}
                <div className="mt-6">
                  <button type="button" disabled={authBusy || !firebaseCfg} onClick={signInWithGoogle} className="btn-hazard">
                    {authBusy ? 'Signing in…' : 'Continue with Google'}
                  </button>
                </div>
              </div>
            ) : receipt ? (
              <div className="plate p-6 sm:p-8" role="status">
                <span className="inline-block border-2 border-lime px-2.5 py-0.5 font-display text-xs uppercase tracking-[0.2em] text-lime">
                  Payment Successful
                </span>
                <h3 className="mt-3 font-display text-3xl uppercase text-bone">Booking Confirmed</h3>
                <p className="mt-2 font-mono text-sm text-smoke">
                  Receipt <span className="text-bone">{receipt.receiptNo}</span>
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href={receipt.pdfUrl} download={`${receipt.receiptNo}.pdf`} className="btn-hazard">
                    Download Payment Receipt PDF
                  </a>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setReceipt(null)}>
                    Book Another Slot
                  </button>
                </div>
              </div>
            ) : activeOrder ? (
              <div className="plate space-y-5 p-6 sm:p-8">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-hazard">Step 3 // Online Payment</p>
                    <h3 className="font-display text-2xl uppercase text-bone">Pay ₹{activeOrder.amountInr}</h3>
                  </div>
                  <span className="font-mono text-xs text-smoke">{activeOrder.reference}</span>
                </div>
                {activeOrder.mode === 'live' ? (
                  <>
                    <p className="text-sm text-smoke">
                      Click below to open Razorpay Checkout and pay via UPI, Card, Netbanking, or Wallet.
                    </p>
                    {bookingError && <p className="text-sm text-red">{bookingError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button type="button" disabled={payBusy} onClick={openRazorpayCheckout} className="btn-hazard">
                        {payBusy ? 'Opening Razorpay…' : `Pay ₹${activeOrder.amountInr} Now`}
                      </button>
                      <button type="button" disabled={payBusy} onClick={failTestPayment} className="btn-ghost text-xs text-red">
                        Cancel Booking
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="label">Payment Method (Dev Test Mode)</span>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(['upi', 'card', 'netbanking'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            className={`choice justify-center uppercase ${paymentMethod === m ? 'is-on' : ''}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    {bookingError && <p className="text-sm text-red">{bookingError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button type="button" disabled={payBusy} onClick={completeTestPayment} className="btn-hazard">
                        {payBusy ? 'Processing…' : `Pay ₹${activeOrder.amountInr} (${paymentMethod.toUpperCase()})`}
                      </button>
                      <button type="button" disabled={payBusy} onClick={failTestPayment} className="btn-ghost text-xs text-red">
                        Cancel / Simulate Failure
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={createBookingAndOrder} noValidate className="plate grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
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
                  <span className="label">Email (for receipt)</span>
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
                    {bookingBusy ? 'Reserving Slot…' : `Confirm & Pay ₹${selectedPkg.amountInr}`}
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
