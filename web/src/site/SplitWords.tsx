import type { ElementType, ReactNode } from 'react'

/**
 * Wraps each word in a mask so it can rise into view (see bindScrollEffects). Pass a list of parts to colour some
 * words, e.g. ['Enter the', { t: 'arena', className: 'text-hazard' }].
 */
export function SplitWords({
  parts,
  as: Tag = 'span',
  className = '',
  id,
}: {
  parts: (string | { t: string; className?: string })[]
  as?: ElementType
  className?: string
  id?: string
}) {
  const words: ReactNode[] = []
  parts.forEach((p, i) => {
    const { t, className: c } = typeof p === 'string' ? { t: p, className: '' } : p
    t.split(/\s+/)
      .filter(Boolean)
      .forEach((w, j) =>
        words.push(
          <span key={`${i}-${j}`} className="sw">
            <span className={c}>{w}</span>
          </span>,
        ),
      )
  })
  return (
    <Tag id={id} className={className} data-split>
      {words.map((w, i) => (
        <span key={i}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}
