import { useEffect, useState } from 'react'

/** Venue details editable by admins under Command > Settings > Website. Empty means "not announced yet". */
export interface SiteSettings {
  address: string
  mapsUrl: string
  directions: string
  phone: string
  email: string
  whatsapp: string
  hours: string
  instagram: string
  facebook: string
  youtube: string
  pricePerHead: string
  hardwareStatus: string
}

export const EMPTY_SETTINGS: SiteSettings = {
  address: '',
  mapsUrl: '',
  directions: '',
  phone: '',
  email: '',
  whatsapp: '',
  hours: '',
  instagram: '',
  facebook: '',
  youtube: '',
  pricePerHead: '',
  hardwareStatus: '',
}

let cache: SiteSettings | null = null
let inflight: Promise<SiteSettings> | null = null

export function loadSiteSettings() {
  inflight ??= fetch('/api/public/site')
    .then((r) => (r.ok ? r.json() : { settings: EMPTY_SETTINGS }))
    .then((b) => (cache = { ...EMPTY_SETTINGS, ...b.settings }))
    .catch(() => EMPTY_SETTINGS)
  return inflight
}

export function useSiteSettings() {
  const [s, setS] = useState<SiteSettings>(cache ?? EMPTY_SETTINGS)
  useEffect(() => {
    let alive = true
    loadSiteSettings().then((v) => alive && setS(v))
    return () => {
      alive = false
    }
  }, [])
  return s
}
