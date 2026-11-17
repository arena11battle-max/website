import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Empty, ErrorText, Field, PageHeader, Panel, Select, Spinner } from '../components/ui'
import { del, get, getAccessToken, patch, post } from '../lib/api'
import { useAuth } from '../lib/auth'

interface Registration {
  id: number
  reference: string
  name: string
  clgRegNo: string
  mobileNumber: string
  email: string
  basePrice: number
  couponCode: string | null
  discountAmount: number
  finalPrice: number
  createdAt: string
}

interface Coupon {
  id: number
  code: string
  discountType: 'flat' | 'percent'
  discountValue: number
  maxUses: number | null
  usedCount: number
  active: boolean
  createdAt: string
}

export default function Events() {
  const { user } = useAuth()
  const admin = user?.role === 'admin'

  const [regs, setRegs] = useState<Registration[] | null>(null)
  const [summary, setSummary] = useState({ total: 0, couponsUsed: 0, totalRevenue: 0 })
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  // New coupon form
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat')
  const [discountValue, setDiscountValue] = useState('100')
  const [maxUses, setMaxUses] = useState('')
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    get<{ registrations: Registration[]; summary: { total: number; couponsUsed: number; totalRevenue: number } }>(
      '/api/events/aloha-2026/registrations',
    )
      .then((r) => {
        setRegs(r.registrations)
        setSummary(r.summary)
      })
      .catch((e) => setError(e.message))

    if (admin) {
      get<{ coupons: Coupon[] }>('/api/admin/events/aloha-2026/coupons')
        .then((r) => setCoupons(r.coupons))
        .catch((e) => setCouponError(e.message))
    }
  }, [admin])

  useEffect(load, [load])

  async function downloadAllPdf() {
    setDownloadingAll(true)
    setError(null)
    try {
      const token = getAccessToken()
      const res = await fetch('/api/events/aloha-2026/registrations/pdf', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('Could not generate PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ALOHA-2026-Registrations.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloadingAll(false)
    }
  }

  async function addCoupon(e: FormEvent) {
    e.preventDefault()
    setCouponError(null)
    setSavingCoupon(true)
    try {
      await post('/api/admin/events/aloha-2026/coupons', {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        maxUses: maxUses.trim() ? Number(maxUses) : null,
      })
      setCode('')
      setDiscountValue('100')
      setMaxUses('')
      load()
    } catch (err) {
      setCouponError((err as Error).message)
    } finally {
      setSavingCoupon(false)
    }
  }

  async function toggleCoupon(c: Coupon) {
    setCouponError(null)
    try {
      await patch(`/api/admin/events/aloha-2026/coupons/${c.id}`, { active: !c.active })
      load()
    } catch (err) {
      setCouponError((err as Error).message)
    }
  }

  async function removeCoupon(c: Coupon) {
    if (!confirm(`Delete coupon ${c.code}?`)) return
    setCouponError(null)
    try {
      await del(`/api/admin/events/aloha-2026/coupons/${c.id}`)
      load()
    } catch (err) {
      setCouponError((err as Error).message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Coupons"
        sub="Manage promo coupons & event registrations"
        action={
          <Button variant="primary" size="sm" onClick={downloadAllPdf} disabled={downloadingAll}>
            {downloadingAll ? 'Generating PDF…' : 'Download All PDF'}
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="dogtag p-4">
          <div className="label">Registrations</div>
          <div className="score mt-1 text-3xl">{summary.total}</div>
        </div>
        <div className="dogtag p-4">
          <div className="label">Coupons Used</div>
          <div className="score mt-1 text-3xl text-amber">{summary.couponsUsed}</div>
        </div>
        <div className="dogtag p-4">
          <div className="label">Total Fee Collected</div>
          <div className="score mt-1 text-3xl text-lime">₹{summary.totalRevenue}</div>
        </div>
      </div>

      <ErrorText error={error} />

      <div className="grid gap-6 lg:grid-cols-[7fr_5fr]">
        <Panel title="Registrations (1 vs 1)">
          {!regs ? (
            <Spinner />
          ) : regs.length === 0 ? (
            <Empty title="No registrations yet">Students can register on the public website under ALOHA 2026.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {regs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-amber">{r.reference}</span>
                      <span className="border border-line-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">
                        {r.clgRegNo}
                      </span>
                      {r.couponCode && (
                        <span className="border border-lime/40 bg-lime/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-lime">
                          {r.couponCode} (-₹{r.discountAmount})
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-display text-lg uppercase tracking-wide">{r.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                      <span>{r.mobileNumber}</span>
                      <span className="break-all">{r.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="score text-xl">₹{r.finalPrice}</div>
                      <div className="font-mono text-[10px] text-muted">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <a
                      href={`/api/public/events/aloha-2026/registrations/${r.reference}/pdf`}
                      download={`ALOHA-2026-${r.reference}.pdf`}
                      className="btn-ghost border border-line-2 px-2.5 py-1.5 font-mono text-xs uppercase hover:border-amber hover:text-amber"
                    >
                      PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {admin && (
          <div className="space-y-6">
            <Panel title="Add Coupon (Admin)">
              <form onSubmit={addCoupon} className="space-y-3 p-4">
                <ErrorText error={couponError} />
                <Field
                  label="Coupon Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ARENA100"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Discount Type"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as 'flat' | 'percent')}
                  >
                    <option value="flat">Flat ₹ off</option>
                    <option value="percent">Percent % off</option>
                  </Select>
                  <Field
                    label={discountType === 'flat' ? 'Amount (₹)' : 'Percent (%)'}
                    type="number"
                    min={1}
                    max={discountType === 'flat' ? 400 : 100}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    required
                  />
                </div>
                <Field
                  label="Max Uses (optional)"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                />
                <Button type="submit" variant="primary" disabled={savingCoupon} className="w-full">
                  {savingCoupon ? 'Creating…' : '+ Create Coupon'}
                </Button>
              </form>
            </Panel>

            <Panel title="Active & Past Coupons">
              {!coupons ? (
                <Spinner />
              ) : coupons.length === 0 ? (
                <Empty title="No coupons yet">Create a coupon above to discount the ₹400 entry fee.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {coupons.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-amber">{c.code}</span>
                          <span
                            className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                              c.active ? 'border-lime text-lime' : 'border-line-2 text-muted'
                            }`}
                          >
                            {c.active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {c.discountType === 'flat' ? `₹${c.discountValue} off` : `${c.discountValue}% off`} · Used{' '}
                          {c.usedCount}
                          {c.maxUses !== null ? ` / ${c.maxUses}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => toggleCoupon(c)}>
                          {c.active ? 'Pause' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeCoupon(c)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
