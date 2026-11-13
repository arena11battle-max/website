import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'red' | 'blue' | 'go'

const variants: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-[#ffd166] to-amber text-ink shadow-[0_0_24px_rgb(245_182_42/0.3),inset_0_1px_0_rgb(255_255_255/0.5)] hover:brightness-110',
  go: 'bg-gradient-to-b from-[#c4f58f] to-lime text-ink shadow-[0_0_24px_rgb(155_225_93/0.3),inset_0_1px_0_rgb(255_255_255/0.5)] hover:brightness-110',
  ghost: 'bg-gradient-to-b from-[#2a3122] to-[#1a1f15] text-text border border-line-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hover:border-khaki',
  danger: 'bg-gradient-to-b from-[#8a1a10] to-red-deep text-[#ffd9d4] border border-red/60 shadow-[0_0_18px_rgb(255_61_46/0.2)] hover:brightness-125',
  red: 'bg-gradient-to-b from-[#ff6a5c] to-red text-white hover:brightness-110',
  blue: 'bg-gradient-to-b from-[#7dbcff] to-blue text-white hover:brightness-110',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5', lg: 'px-3 py-3.5 text-sm sm:px-6 sm:text-lg' }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-display uppercase tracking-[0.1em] transition
        disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]
        [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]
        ${sizes[size]} ${variants[variant]} ${className}`}
    />
  )
}

export function Panel({
  children,
  className = '',
  accent,
  title,
  action,
}: {
  children: ReactNode
  className?: string
  accent?: 'red' | 'blue' | 'amber' | 'lime'
  title?: ReactNode
  action?: ReactNode
}) {
  const color = accent ? `var(--color-${accent})` : undefined
  return (
    <section className={`hud hud-corner ${className}`} style={color ? ({ '--hud-accent': color } as React.CSSProperties) : undefined}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="label">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input {...props} className={`field ${props.className ?? ''}`} />
      {hint && <span className="block text-xs text-dim">{hint}</span>}
    </label>
  )
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const el = (
    <select {...props} className={`field appearance-none ${props.className ?? ''}`}>
      {children}
    </select>
  )
  if (!label) return el
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {el}
    </label>
  )
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="border-l-2 border-red bg-red-deep/20 px-3 py-2 text-sm text-red">
      {error}
    </p>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="radar h-8 w-8" />
      <span className="label">{label}</span>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-sm tracking-[0.2em] text-muted uppercase">{title}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function TeamDot({ team }: { team: 'red' | 'blue' }) {
  return <span className={`inline-block h-2.5 w-2.5 rotate-45 ${team === 'red' ? 'bg-red' : 'bg-blue'}`} aria-label={`${team} team`} />
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    setup: 'text-muted border-line-2',
    live: 'text-lime border-lime/50 bg-lime/10',
    break: 'text-amber border-amber/50 bg-amber/10',
    paused: 'text-amber border-amber/50 bg-amber/10',
    finished: 'text-muted border-line-2 bg-panel-2',
  }
  const text: Record<string, string> = { setup: 'Ready', live: 'Live', break: 'Break', paused: 'Paused', finished: 'Finished' }
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.18em] ${styles[status]}`}>
      {status === 'live' && <span className="blink h-1.5 w-1.5 rounded-full bg-lime" />}
      {text[status] ?? status}
    </span>
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="hud hud-corner max-h-[90dvh] w-full overflow-y-auto sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hazard-thin" />
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-base tracking-wider uppercase">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-text" aria-label="Close">
            ×
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl tracking-wider uppercase sm:text-3xl">{title}</h1>
        <div className="mt-1.5 hazard-thin w-24" />
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
