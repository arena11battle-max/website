import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, Modal, PageHeader, Panel, Select, Spinner } from '../components/ui'
import { get, patch, post, setAccessToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { GUN_DAMAGE, GUN_NAMES, type Kit, type User } from '../lib/types'
import { GalleryTab, WebsiteTab } from './Website'

interface Staff extends User {
  active: boolean
  createdAt: string
  sessions: number
}
interface Device {
  id: number
  name: string
  active: boolean
  lastSeenAt: string | null
  createdAt: string
}
interface Audit {
  id: number
  action: string
  detail: unknown
  createdAt: string
  user: string | null
}

export default function Settings() {
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [tab, setTab] = useState<'staff' | 'kits' | 'devices' | 'website' | 'gallery' | 'audit' | 'account'>(admin ? 'staff' : 'account')
  const tabs = admin
    ? ([
        ['staff', 'Staff'],
        ['kits', 'Kits'],
        ['devices', 'Hub devices'],
        ['website', 'Website'],
        ['gallery', 'Gallery'],
        ['audit', 'Activity log'],
        ['account', 'My password'],
      ] as const)
    : ([['account', 'My password']] as const)
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wider ${tab === key ? 'border-amber text-amber' : 'border-transparent text-muted hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'staff' && <StaffTab />}
      {tab === 'kits' && <KitsTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'website' && <WebsiteTab />}
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  )
}

function StaffTab() {
  const { user } = useAuth()
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    get<{ staff: Staff[] }>('/api/admin/staff')
      .then((r) => setStaff(r.staff))
      .catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function update(id: number, body: object) {
    setError(null)
    try {
      await patch(`/api/admin/staff/${id}`, body)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Panel
      title="Staff accounts"
      action={
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          + Add staff
        </Button>
      }
    >
      <div className="p-3">
        <ErrorText error={error} />
      </div>
      {!staff ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  {s.name} {s.id === user?.id && <span className="text-xs text-muted">(you)</span>}
                </div>
                <div className="truncate text-sm text-muted">{s.email}</div>
                <div className="font-mono text-[11px] text-dim">{s.sessions} active session{s.sessions === 1 ? '' : 's'}</div>
              </div>
              {s.sessions > 0 && s.id !== user?.id && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Sign ${s.name} out on every device?`)) return
                    await post(`/api/admin/staff/${s.id}/revoke`).then(load, (e) => setError(e.message))
                  }}
                >
                  End sessions
                </Button>
              )}
              <Select
                aria-label="Role"
                value={s.role}
                disabled={s.id === user?.id}
                onChange={(e) => update(s.id, { role: e.target.value })}
                className="!w-36 !py-1.5 text-sm"
              >
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </Select>
              <Button size="sm" variant={s.active ? 'danger' : 'go'} disabled={s.id === user?.id} onClick={() => update(s.id, { active: !s.active })}>
                {s.active ? 'Disable' : 'Enable'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-3 text-sm text-muted">
        Operators can add players and run matches. Admins can also manage staff, kits and hub devices.
      </p>
      <NewStaff
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          load()
        }}
      />
    </Panel>
  )
}

function NewStaff({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' })
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await post('/api/admin/staff', form)
      setForm({ name: '', email: '', password: '', role: 'operator' })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add staff member">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Field
          label="Temporary password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters. They can change it under Settings."
        />
        <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="operator">Operator</option>
          <option value="admin">Admin</option>
        </Select>
        <ErrorText error={error} />
        <Button variant="primary" className="w-full">
          Add staff
        </Button>
      </form>
    </Modal>
  )
}

function KitsTab() {
  const [kits, setKits] = useState<Kit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [gun, setGun] = useState(1)
  const load = useCallback(() => {
    get<{ kits: Kit[] }>('/api/admin/kits')
      .then((r) => setKits(r.kits))
      .catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function update(id: number, body: object) {
    setError(null)
    try {
      await patch(`/api/admin/kits/${id}`, body)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await post('/api/admin/kits', { label, gun })
      setLabel('')
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Panel title="Gun + vest kits">
      <p className="px-4 pt-3 text-sm text-muted">
        Each kit's label must match the TEAM and PLAYER_ID flashed into its ESP32 (R1 = Red player 1). The gun type sets damage when a vest
        doesn't report health.
      </p>
      <div className="p-3">
        <ErrorText error={error} />
      </div>
      {!kits ? (
        <Spinner />
      ) : (
        <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {kits.map((k) => (
            <li key={k.id} className={`flex items-center gap-3 px-4 py-2.5 sm:border-b sm:border-line ${k.active ? '' : 'opacity-50'}`}>
              <span className={`w-10 font-mono font-bold ${k.team === 'red' ? 'text-red' : 'text-blue'}`}>{k.label}</span>
              <Select aria-label="Gun" value={k.gun} onChange={(e) => update(k.id, { gun: Number(e.target.value) })} className="!py-1.5 text-sm">
                {GUN_NAMES.map((g, i) => (
                  <option key={g} value={i}>
                    {g} · {GUN_DAMAGE[i]} dmg
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={() => update(k.id, { active: !k.active })}>
                {k.active ? 'Disable' : 'Enable'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <div className="w-28">
          <Field label="New kit" value={label} onChange={(e) => setLabel(e.target.value.toUpperCase())} placeholder="R6" required pattern="[RBrb][0-9]{1,2}" />
        </div>
        <div className="w-44">
          <Select label="Gun" value={gun} onChange={(e) => setGun(Number(e.target.value))}>
            {GUN_NAMES.map((g, i) => (
              <option key={g} value={i}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary">Add kit</Button>
      </form>
    </Panel>
  )
}

function DevicesTab() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('Scoreboard hub')
  const [secret, setSecret] = useState<{ id: number; secret: string } | null>(null)
  const load = useCallback(() => {
    get<{ devices: Device[] }>('/api/admin/devices')
      .then((r) => setDevices(r.devices))
      .catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const r = await post<{ device: Device; secret: string }>('/api/admin/devices', { name })
      setSecret({ id: r.device.id, secret: r.secret })
      load()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  async function rotate(id: number) {
    const r = await post<{ id: number; secret: string }>(`/api/admin/devices/${id}/rotate`)
    setSecret(r)
  }
  async function toggle(d: Device) {
    await patch(`/api/admin/devices/${d.id}`, { active: !d.active })
    load()
  }

  return (
    <Panel title="Hub devices">
      <p className="px-4 pt-3 text-sm text-muted">
        The scoreboard hub (or the bridge program on the venue laptop) uses a device ID and secret to sign every hit it sends. A request with a
        wrong signature is rejected.
      </p>
      <div className="p-3">
        <ErrorText error={error} />
      </div>
      {!devices ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((d) => (
            <li key={d.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${d.active ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  {d.name} <span className="font-mono text-sm text-muted">ID {d.id}</span>
                </div>
                <div className="text-sm text-muted">{d.lastSeenAt ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}` : 'Never connected'}</div>
              </div>
              <Button size="sm" onClick={() => rotate(d.id)}>
                New secret
              </Button>
              <Button size="sm" variant={d.active ? 'danger' : 'go'} onClick={() => toggle(d)}>
                {d.active ? 'Disable' : 'Enable'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <div className="w-64">
          <Field label="Device name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button variant="primary">Register device</Button>
      </form>
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Device secret">
        <p className="text-sm text-muted">Copy this now. It is shown only once. Put it in the bridge's config (or the hub firmware).</p>
        <div className="mt-4 space-y-2 font-mono text-sm">
          <div>
            <span className="label">Device ID</span>
            <div className="field select-all">{secret?.id}</div>
          </div>
          <div>
            <span className="label">Secret</span>
            <div className="field break-all select-all">{secret?.secret}</div>
          </div>
        </div>
        <Button variant="primary" className="mt-5 w-full" onClick={() => navigator.clipboard?.writeText(secret?.secret ?? '')}>
          Copy secret
        </Button>
      </Modal>
    </Panel>
  )
}

function AuditTab() {
  const [rows, setRows] = useState<Audit[] | null>(null)
  useEffect(() => {
    get<{ audit: Audit[] }>('/api/admin/audit').then((r) => setRows(r.audit))
  }, [])
  return (
    <Panel title="Recent activity">
      {!rows ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-3 px-4 py-2">
              <span className="digits text-muted">{new Date(r.createdAt).toLocaleString()}</span>
              <span className="font-bold">{r.user ?? 'system'}</span>
              <span className="font-mono text-amber">{r.action}</span>
              {r.detail != null && <span className="truncate font-mono text-xs text-dim">{JSON.stringify(r.detail)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AccountTab() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    try {
      const r = await post<{ accessToken: string }>('/api/auth/password', { current, next })
      setAccessToken(r.accessToken)
      setCurrent('')
      setNext('')
      setMsg('Password changed. Other devices have been signed out.')
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <Panel title="Change my password" className="max-w-md">
      <form onSubmit={submit} className="space-y-4 p-4">
        <Field label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        <Field label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
        <ErrorText error={error} />
        {msg && <p className="text-sm text-lime">{msg}</p>}
        <Button variant="primary">Change password</Button>
      </form>
      <div className="border-t border-line p-4">
        <p className="text-sm text-muted">Lost a phone or used a shared computer? End every session for your account, including this one.</p>
        <Button
          className="mt-3"
          variant="danger"
          size="sm"
          type="button"
          onClick={async () => {
            if (!confirm('Sign out on every device, including this one?')) return
            await post('/api/auth/sessions/revoke')
            location.href = '/command'
          }}
        >
          Sign out everywhere
        </Button>
      </div>
    </Panel>
  )
}
