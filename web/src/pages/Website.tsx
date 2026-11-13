import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Empty, ErrorText, Field, Panel, Select, Spinner } from '../components/ui'
import { api, ApiError, del, get, getAccessToken as currentToken, patch, refreshSession } from '../lib/api'

// Admin-only: venue details shown on the public website, and real photos for the gallery.

type Settings = Record<string, string>

const FIELDS: { key: string; label: string; hint?: string; long?: boolean }[] = [
  { key: 'address', label: 'Venue address', long: true },
  { key: 'mapsUrl', label: 'Google Maps link', hint: 'https:// link used for "Get directions"' },
  { key: 'directions', label: 'Directions note', hint: 'e.g. Behind the bus stand, parking at gate 2' },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp number' },
  { key: 'email', label: 'Email' },
  { key: 'hours', label: 'Opening hours', hint: 'e.g. Tue–Sun 11:00–22:00' },
  { key: 'pricePerHead', label: 'Price', hint: 'e.g. ₹350 per player' },
  { key: 'instagram', label: 'Instagram link' },
  { key: 'facebook', label: 'Facebook link' },
  { key: 'youtube', label: 'YouTube link' },
  { key: 'hardwareStatus', label: 'Hardware status line', hint: 'Shown under "Every hit counts". Keep it honest.' },
]

export function WebsiteTab() {
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    get<{ settings: Settings }>('/api/admin/site').then((r) => setS(r.settings), (e) => setError(e.message))
  }, [])
  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      const r = await api<{ settings: Settings }>('PUT', '/api/admin/site', s)
      setS(r.settings)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  if (!s) return <Spinner />
  return (
    <Panel title="Public website details">
      <form onSubmit={save} className="grid gap-4 p-4 md:grid-cols-2">
        {FIELDS.map((f) =>
          f.long ? (
            <label key={f.key} className="block md:col-span-2">
              <span className="label">{f.label}</span>
              <textarea className="field mt-1" rows={2} value={s[f.key] ?? ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
            </label>
          ) : (
            <Field key={f.key} label={f.label} hint={f.hint} value={s[f.key] ?? ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
          ),
        )}
        <div className="flex items-center gap-4 md:col-span-2">
          <Button variant="primary">Save website details</Button>
          {saved && <span className="text-sm text-lime">Saved. The website shows the new details within a minute.</span>}
        </div>
        <div className="md:col-span-2">
          <ErrorText error={error} />
        </div>
      </form>
    </Panel>
  )
}

interface Photo {
  id: number
  caption: string
  category: string
  size: number
  published: boolean
  createdAt: string
}

const CATS = [
  ['arena', 'Arena'],
  ['arsenal', 'Arsenal'],
  ['teams', 'Teams'],
  ['gameplay', 'Gameplay'],
  ['bts', 'Behind the scenes'],
] as const

export function GalleryTab() {
  const [items, setItems] = useState<Photo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [category, setCategory] = useState('arena')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const load = useCallback(() => {
    get<{ items: Photo[] }>('/api/admin/gallery').then((r) => setItems(r.items), (e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function upload(e: FormEvent) {
    e.preventDefault()
    const f = file.current?.files?.[0]
    if (!f) return setError('Choose a photo first')
    if (f.size > 6 * 1024 * 1024) return setError('Photos must be under 6 MB. Export a smaller JPEG or WebP.')
    setBusy(true)
    setError(null)
    try {
      // The api() helper sends JSON; images go up as the raw request body.
      const send = (token?: string) =>
        fetch(`/api/admin/gallery?caption=${encodeURIComponent(caption)}&category=${category}`, {
          method: 'POST',
          headers: { 'content-type': f.type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: f,
          credentials: 'same-origin',
        })
      let res = await send(currentToken())
      if (res.status === 401 && (await refreshSession())) res = await send(currentToken())
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new ApiError(res.status, body.error ?? 'Upload failed')
      setCaption('')
      if (file.current) file.current.value = ''
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Panel title="Add a real photo">
        <form onSubmit={upload} className="space-y-4 p-4">
          <label className="block">
            <span className="label">Photo (JPEG, PNG or WebP, up to 6 MB)</span>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="field mt-1" required />
          </label>
          <Field label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} required maxLength={140} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <ErrorText error={error} />
          <Button variant="primary" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          <p className="text-xs text-muted">Only upload real photos you have permission to publish. They are labelled "Photo" on the website.</p>
        </form>
      </Panel>
      <Panel title="Gallery photos">
        {!items ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty title="No photos yet">The website shows labelled concept renders until real photos are added.</Empty>
        ) : (
          <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="border border-line bg-panel-2">
                <img src={`/api/public/gallery/${p.id}/image`} alt={p.caption} className={`aspect-video w-full object-cover ${p.published ? '' : 'opacity-40'}`} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="space-y-2 p-3">
                  <div className="font-bold">{p.caption}</div>
                  <div className="text-xs text-muted">
                    {CATS.find((c) => c[0] === p.category)?.[1]} · {(p.size / 1024).toFixed(0)} KB · {p.published ? 'Published' : 'Hidden'}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => patch(`/api/admin/gallery/${p.id}`, { published: !p.published }).then(load, (e) => setError(e.message))}>
                      {p.published ? 'Hide' : 'Publish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => confirm(`Delete "${p.caption}" permanently?`) && del(`/api/admin/gallery/${p.id}`).then(load, (e) => setError(e.message))}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
