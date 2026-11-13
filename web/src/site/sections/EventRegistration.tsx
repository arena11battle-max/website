import { useState, type FormEvent } from 'react'
import { SplitWords } from '../SplitWords'

interface AppliedCoupon {
  code: string
  discountType: 'flat' | 'percent'
  discountValue: number
  discountAmount: number
  finalPrice: number
}

interface RegistrationResult {
  reference: string
  eventName: string
  gameMode: string
  name: string
  clgRegNo: string
  mobileNumber: string
  email: string
  basePrice: number
  couponCode: string | null
  discountAmount: number
  finalPrice: number
  pdfUrl: string
}

const BASE_PRICE = 400

function triggerPdfDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function EventRegistration() {
  const [name, setName] = useState('')
  const [clgRegNo, setClgRegNo] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [email, setEmail] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [couponMsg, setCouponMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [done, setDone] = useState<RegistrationResult | null>(null)

  const finalPrice = coupon ? coupon.finalPrice : BASE_PRICE

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) {
      setCouponMsg({ type: 'err', text: 'Enter a coupon code first.' })
      return
    }
    setCheckingCoupon(true)
    setCouponMsg(null)
    try {
      const res = await fetch('/api/public/events/aloha-2026/validate-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCoupon(null)
        setCouponMsg({ type: 'err', text: data.error || 'Invalid coupon code.' })
        return
      }
      setCoupon(data)
      setCouponInput(data.code)
      setCouponMsg({
        type: 'ok',
        text: `${data.code} applied — ₹${data.discountAmount} off!`,
      })
    } catch {
      setCouponMsg({ type: 'err', text: 'Could not verify coupon right now.' })
    } finally {
      setCheckingCoupon(false)
    }
  }

  function removeCoupon() {
    setCoupon(null)
    setCouponInput('')
    setCouponMsg(null)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your full name.'
    if (clgRegNo.trim().length < 2) e.clgRegNo = 'Enter your college registration number.'
    if (!/^\+?[0-9][0-9\s-]{8,16}$/.test(mobileNumber.trim())) e.mobileNumber = 'Enter a valid mobile number.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.'
    return e
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    setServerError('')
    try {
      const res = await fetch('/api/public/events/aloha-2026/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          clgRegNo: clgRegNo.trim(),
          mobileNumber: mobileNumber.trim(),
          email: email.trim(),
          couponCode: coupon?.code,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(data.error || 'Could not complete registration.')
        return
      }
      const result: RegistrationResult = { ...data.registration, pdfUrl: data.pdfUrl }
      setDone(result)
      triggerPdfDownload(result.pdfUrl, `ALOHA-2026-${result.reference}.pdf`)
    } catch {
      setServerError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setDone(null)
    setName('')
    setClgRegNo('')
    setMobileNumber('')
    setEmail('')
    setCoupon(null)
    setCouponInput('')
    setCouponMsg(null)
    setErrors({})
    setServerError('')
  }

  return (
    <section id="aloha" className="relative overflow-hidden border-y border-white/10 bg-[#0b0c09] px-[var(--edge)] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
          <div>
            <p className="kicker">University event // SRMAP</p>
            <SplitWords
              as="h2"
              className="headline mt-4 text-bone"
              parts={[{ t: 'ALOHA 2026', className: 'text-hazard' }, { t: 'SRMAP UNIVERSITY' }]}
            />
            <p className="mt-5 max-w-md text-lg text-bone/75">
              Official tactical 1 vs 1 arena registration for ALOHA 2026 at SRMAP University. Register below and your pass will be saved as a PDF.
            </p>

            <div className="plate mt-8 space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-smoke">Game Format</span>
                <span className="font-display text-xl uppercase tracking-wider text-hazard">1 vs 1 Only</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-smoke">Standard Fee</span>
                <span className="digits font-display text-2xl text-bone">₹{BASE_PRICE}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-smoke">Pass Format</span>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-bone/80">Instant PDF Download</span>
              </div>
            </div>
          </div>

          <div>
            {done ? (
              <div className="plate p-8 sm:p-10" role="status">
                <span className="inline-block border-2 border-hazard px-2.5 py-0.5 font-display text-xs uppercase tracking-[0.2em] text-hazard">
                  Registered // 1 vs 1
                </span>
                <h3 className="mt-3 font-display text-3xl uppercase text-bone">ALOHA 2026 Pass Ready</h3>
                <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-smoke">
                  Reference <span className="digits text-bone">{done.reference}</span>
                </p>

                <dl className="mt-6 grid gap-3 border-y border-white/10 py-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">Name</dt>
                    <dd className="mt-0.5 font-semibold text-bone">{done.name}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">CLG Reg No</dt>
                    <dd className="mt-0.5 font-mono text-bone">{done.clgRegNo}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">Mobile Number</dt>
                    <dd className="mt-0.5 font-mono text-bone">{done.mobileNumber}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">Email</dt>
                    <dd className="mt-0.5 break-all text-bone">{done.email}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">Coupon</dt>
                    <dd className="mt-0.5 font-mono text-bone">
                      {done.couponCode ? `${done.couponCode} (-₹${done.discountAmount})` : 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">Final Fee</dt>
                    <dd className="digits mt-0.5 font-display text-xl text-hazard">₹{done.finalPrice}</dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-3">
                  <a href={done.pdfUrl} download={`ALOHA-2026-${done.reference}.pdf`} className="btn-hazard">
                    Download Registration PDF
                  </a>
                  <button type="button" className="btn-ghost text-xs" onClick={resetForm}>
                    Register another player
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="plate grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-hazard">ALOHA 2026 SRMAP UNIVERSITY</p>
                    <p className="font-display text-xl uppercase text-bone">1 vs 1 Event Registration</p>
                  </div>
                  <span className="border border-hazard/50 bg-hazard/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-hazard">
                    1 vs 1 • ₹400
                  </span>
                </div>

                <label htmlFor="aloha-name" className="block">
                  <span className="label">Name *</span>
                  <span className="field-wrap mt-1.5">
                    <input
                      id="aloha-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      className={`field ${errors.name ? '!border-red' : ''}`}
                    />
                  </span>
                  {errors.name && <span className="mt-1 block text-sm text-red">{errors.name}</span>}
                </label>

                <label htmlFor="aloha-reg" className="block">
                  <span className="label">CLG Reg No *</span>
                  <span className="field-wrap mt-1.5">
                    <input
                      id="aloha-reg"
                      type="text"
                      required
                      value={clgRegNo}
                      onChange={(e) => setClgRegNo(e.target.value.toUpperCase())}
                      placeholder="e.g. AP23110010001"
                      className={`field uppercase ${errors.clgRegNo ? '!border-red' : ''}`}
                    />
                  </span>
                  {errors.clgRegNo && <span className="mt-1 block text-sm text-red">{errors.clgRegNo}</span>}
                </label>

                <label htmlFor="aloha-mobile" className="block">
                  <span className="label">Mobile Number *</span>
                  <span className="field-wrap mt-1.5">
                    <input
                      id="aloha-mobile"
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      className={`field ${errors.mobileNumber ? '!border-red' : ''}`}
                    />
                  </span>
                  {errors.mobileNumber && <span className="mt-1 block text-sm text-red">{errors.mobileNumber}</span>}
                </label>

                <label htmlFor="aloha-email" className="block">
                  <span className="label">Email *</span>
                  <span className="field-wrap mt-1.5">
                    <input
                      id="aloha-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@srmap.edu.in"
                      className={`field ${errors.email ? '!border-red' : ''}`}
                    />
                  </span>
                  {errors.email && <span className="mt-1 block text-sm text-red">{errors.email}</span>}
                </label>

                <div className="sm:col-span-2">
                  <label htmlFor="aloha-coupon" className="label">
                    Coupon Code (optional)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <span className="field-wrap flex-1">
                      <input
                        id="aloha-coupon"
                        type="text"
                        value={couponInput}
                        disabled={!!coupon}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Enter coupon code"
                        className="field uppercase"
                      />
                    </span>
                    {coupon ? (
                      <button type="button" onClick={removeCoupon} className="btn-ghost shrink-0 text-xs">
                        Remove
                      </button>
                    ) : (
                      <button type="button" onClick={applyCoupon} disabled={checkingCoupon} className="btn-ghost shrink-0 text-xs">
                        {checkingCoupon ? 'Checking…' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {couponMsg && (
                    <p className={`mt-1.5 text-sm ${couponMsg.type === 'ok' ? 'text-lime' : 'text-red'}`}>{couponMsg.text}</p>
                  )}
                </div>

                <div className="sm:col-span-2 border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between text-sm text-smoke">
                    <span>1 vs 1 Match Fee</span>
                    <span className="digits">₹{BASE_PRICE}</span>
                  </div>
                  {coupon && (
                    <div className="mt-1.5 flex items-center justify-between text-sm text-lime">
                      <span>Coupon ({coupon.code})</span>
                      <span className="digits">-₹{coupon.discountAmount}</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="font-display text-base uppercase tracking-wider text-bone">Total Payable</span>
                    <span className="digits font-display text-3xl text-hazard">₹{finalPrice}</span>
                  </div>
                </div>

                {serverError && (
                  <p className="sm:col-span-2 border border-red/40 bg-red/10 px-4 py-2.5 text-sm text-red" role="alert">
                    {serverError}
                  </p>
                )}

                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-4 pt-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
                    Saves registration PDF immediately
                  </p>
                  <button type="submit" disabled={submitting} className="btn-hazard">
                    {submitting ? 'Registering…' : `Register & Save PDF (₹${finalPrice})`}
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
