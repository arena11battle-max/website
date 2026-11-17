import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, ErrorText, PageHeader, Panel, Spinner } from '../components/ui'
import { get, patch } from '../lib/api'

// Booking enquiries from the website. An enquiry becomes a booking only when staff confirm it with the customer.

type Status = 'new' | 'pending' | 'payment_successful' | 'contacted' | 'confirmed' | 'declined' | 'cancelled'

interface Booking {
  id: number
  reference: string
  name: string
  phone: string
  email: string | null
  players: number
  date: string
  time: string
  notes: string | null
  mode: string | null
  loadout: string | null
  status: Status
  staffNotes: string | null
  handledBy: string | null
  createdAt: string
}

const MODE_NAMES: Record<string, string> = { tdm: 'Team Deathmatch', domination: 'Domination', last_squad: 'Last Squad', custom: 'Custom Match' }

const STATUS: { id: Status; label: string; cls: string }[] = [
  { id: 'new', label: 'New', cls: 'text-amber border-amber' },
  { id: 'pending', label: 'Pending QR', cls: 'text-amber border-amber' },
  { id: 'payment_successful', label: 'Paid', cls: 'text-lime border-lime' },
  { id: 'contacted', label: 'Contacted', cls: 'text-blue border-blue' },
  { id: 'confirmed', label: 'Confirmed', cls: 'text-lime border-lime' },
  { id: 'declined', label: 'Declined', cls: 'text-muted border-line-2' },
  { id: 'cancelled', label: 'Cancelled', cls: 'text-red border-red' },
]

function BookingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [notes, setNotes] = useState(b.staffNotes ?? '')
  const [error, setError] = useState<string | null>(null)
  const st = STATUS.find((s) => s.id === b.status) ?? STATUS[0]
  const set = async (status: Status) => {
    if ((status === 'declined' || status === 'cancelled') && !confirm(`Mark ${b.reference} as ${status}?`)) return
    setError(null)
    try {
      await patch(`/api/bookings/${b.id}`, { status, staffNotes: notes })
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const when = new Date(`${b.date}T${b.time}`)
  return (
    <li className="dogtag p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted">{b.reference}</span>
            <span className={`border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-widest ${st.cls}`}>{st.label}</span>
          </div>
          <div className="mt-1 font-display text-xl uppercase tracking-wide">{b.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
            <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="text-amber hover:underline">
              {b.phone}
            </a>
            {b.email && (
              <a href={`mailto:${b.email}`} className="text-muted hover:text-text">
                {b.email}
              </a>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="score text-3xl">{b.players}</div>
          <div className="label">players</div>
        </div>
      </div>
      <div className="mt-3 font-mono text-sm">
        {when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {b.time}
      </div>
      {(b.mode || b.loadout) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {b.mode && <span className="border border-line-2 px-2 py-0.5 uppercase tracking-wider">{MODE_NAMES[b.mode] ?? b.mode}</span>}
          {b.loadout && <span className="border border-line-2 px-2 py-0.5 uppercase tracking-wider text-muted">Loadout: {b.loadout}</span>}
        </div>
      )}
      {b.notes && <p className="mt-2 border-l-2 border-line-2 pl-3 text-sm text-muted">{b.notes}</p>}
      <label className="mt-3 block">
        <span className="label">Staff notes</span>
        <textarea className="field mt-1 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Called at 4pm, wants the custom mission…" />
      </label>
      <ErrorText error={error} />
      <div className="mt-3 flex flex-wrap gap-2">
        {b.status !== 'contacted' && (b.status === 'new' || b.status === 'pending') && (
          <Button size="sm" onClick={() => set('contacted')}>
            Mark contacted
          </Button>
        )}
        {b.status !== 'confirmed' && (
          <Button size="sm" variant="go" onClick={() => set('confirmed')}>
            Confirm booking
          </Button>
        )}
        {b.status !== 'declined' && b.status !== 'confirmed' && (
          <Button size="sm" onClick={() => set('declined')}>
            Decline
          </Button>
        )}
        {b.status === 'confirmed' && (
          <Button size="sm" variant="danger" onClick={() => set('cancelled')}>
            Cancel booking
          </Button>
        )}
        {notes !== (b.staffNotes ?? '') && (
          <Button size="sm" variant="primary" onClick={() => set(b.status)}>
            Save notes
          </Button>
        )}
      </div>
      <div className="mt-2 text-xs text-dim">
        Received {new Date(b.createdAt).toLocaleString()}
        {b.handledBy && ` · last handled by ${b.handledBy}`}
      </div>
    </li>
  )
}

export default function Bookings() {
  const [filter, setFilter] = useState<Status | 'all'>('new')
  const [data, setData] = useState<{ bookings: Booking[]; counts: Partial<Record<Status, number>> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    get<{ bookings: Booking[]; counts: Partial<Record<Status, number>> }>(`/api/bookings${filter === 'all' ? '' : `?status=${filter}`}`).then(setData, (e) => setError(e.message))
  }, [filter])
  useEffect(load, [load])

  return (
    <div>
      <PageHeader title="Bookings" sub="Enquiries from the website. Call the customer, then confirm or decline." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {[{ id: 'all' as const, label: 'All' }, ...STATUS.filter((s) => s.id !== 'pending' && s.id !== 'payment_successful')].map((s) => {
          const count = s.id === 'new' ? (data?.counts.new ?? 0) + (data?.counts.pending ?? 0) : s.id !== 'all' ? (data?.counts[s.id] ?? 0) : 0
          return (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wider ${filter === s.id ? 'border-amber text-amber' : 'border-transparent text-muted hover:text-text'}`}
            >
              {s.label}
              {s.id !== 'all' && count > 0 ? <span className="ml-1.5 text-xs text-dim">{count}</span> : null}
            </button>
          )
        })}
      </div>
      <ErrorText error={error} />
      <Panel>
        {!data ? (
          <Spinner />
        ) : data.bookings.length === 0 ? (
          <Empty title={filter === 'new' ? 'No new enquiries' : 'Nothing here'} />
        ) : (
          <ul className="grid gap-3 p-3 lg:grid-cols-2">
            {data.bookings.map((b) => (
              <BookingCard key={`${b.id}-${b.status}`} b={b} onChange={load} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
