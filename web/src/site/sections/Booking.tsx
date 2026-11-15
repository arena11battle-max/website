import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSiteSettings } from '../settings'
import { SplitWords } from '../SplitWords'

interface Customer {
  id: number
  mobile: string
  name: string | null
  email: string | null
}

interface PackageOption {
  id: '1v1' | '2v2' | '3v3' | '4v4'
  name: string
  players: number
  amountInr: number
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
  { id: '1v1', name: '1 vs 1 Tactical Duel', players: 2, amountInr: 400 },
  { id: '2v2', name: '2 vs 2 Squad Skirmish', players: 4, amountInr: 800 },
  { id: '3v3', name: '3 vs 3 Arena Clash', players: 6, amountInr: 1200 },
  { id: '4v4', name: '4 vs 4 Full Arena', players: 8, amountInr: 1500 },
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

  // OTP Login state
  const [mobile, setMobile] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
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

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function sendOtp(e?: FormEvent) {
    e?.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await fetch('/api/customer/auth/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mobile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAuthError(data.error || 'Could not send OTP')
        if (data.retryAfterSeconds) setCooldown(data.retryAfterSeconds)
        return
      }
      setOtpSent(true)
      setCooldown(data.cooldownSeconds ?? 30)
      setDevOtpHint(data.devOtp ?? null)
    } catch {
      setAuthError('Network error while sending OTP.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await fetch('/api/customer/auth/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mobile, otp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAuthError(data.error || 'OTP verification failed')
        return
      }
      localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token)
      setToken(data.token)
      setCustomer(data.customer)
      setOtp('')
      setOtpSent(false)
      setDevOtpHint(null)
    } catch {
      setAuthError('Network error while verifying OTP.')
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
        body: JSON.stringify({ packageId: pkgId, date, time, name: name.trim(), email: email.trim() || undefined, notes: notes.trim() || undefined }),
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

  async function completeTestPayment() {
    if (!token || !activeOrder) return
    setPayBusy(true)
    setBookingError('')
    try {
      const paymentId = `pay_test_${Math.random().toString(16).slice(2, 10)}`
      const signature = await hmacSha256Hex('arena11-test-gateway', `${activeOrder.orderId}|${paymentId}`)
      const res = await fetch('/api/customer/payments/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: activeOrder.orderId, paymentId, signature, method: paymentMethod }),
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
              Sign in with your Indian mobile number (+91 OTP), pick an available slot, and pay online via UPI, Card, or Netbanking.
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
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-hazard">Step 1 // Mobile OTP Login</p>
                <h3 className="mt-2 font-display text-2xl uppercase text-bone">Verify Your Mobile Number</h3>

                {!otpSent ? (
                  <form onSubmit={sendOtp} className="mt-6 space-y-4">
                    <label className="block">
                      <span className="label">Indian Mobile Number (+91)</span>
                      <span className="field-wrap mt-1.5">
                        <input
                          type="tel"
                          required
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="field"
                        />
                      </span>
                    </label>
                    {authError && <p className="text-sm text-red">{authError}</p>}
                    <button type="submit" disabled={authBusy} className="btn-hazard">
                      {authBusy ? 'Sending OTP…' : 'Send OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={verifyOtp} className="mt-6 space-y-4">
                    <p className="text-sm text-smoke">
                      Enter the 6-digit OTP sent to <span className="font-mono text-bone">{mobile}</span>.
                    </p>
                    {devOtpHint && (
                      <p className="border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-xs text-amber">
                        Dev/Test OTP: <strong>{devOtpHint}</strong>
                      </p>
                    )}
                    <label className="block">
                      <span className="label">6-Digit OTP</span>
                      <span className="field-wrap mt-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="field font-mono tracking-[0.3em]"
                        />
                      </span>
                    </label>
                    {authError && <p className="text-sm text-red">{authError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={authBusy} className="btn-hazard">
                        {authBusy ? 'Verifying…' : 'Verify & Continue'}
                      </button>
                      <button type="button" disabled={cooldown > 0 || authBusy} onClick={() => sendOtp()} className="btn-ghost text-xs">
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                      </button>
                    </div>
                  </form>
                )}
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
                <div>
                  <span className="label">Payment Method (Razorpay)</span>
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
              </div>
            ) : (
              <form onSubmit={createBookingAndOrder} noValidate className="plate grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
                <div className="sm:col-span-2 flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-lime">Verified: {customer.mobile}</p>
                    <p className="font-display text-xl uppercase text-bone">Step 2 // Select Package &amp; Slot</p>
                  </div>
                  <button type="button" onClick={logoutCustomer} className="font-mono text-xs uppercase text-smoke hover:text-bone">
                    Sign out
                  </button>
                </div>

                <div className="sm:col-span-2">
                  <span className="label">Booking Package</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PACKAGES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPkgId(p.id)}
                        className={`choice justify-between px-4 py-3 text-left ${pkgId === p.id ? 'is-on' : ''}`}
                      >
                        <span>{p.name}</span>
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
