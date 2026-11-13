import { Navigate, useParams } from 'react-router-dom'
import { useSiteSettings } from './settings'

// Starter policy text. Have it reviewed by a legal adviser before launch.
const PAGES: Record<string, { title: string; intro: string; sections: [string, string[]][] }> = {
  safety: {
    title: 'Safety rules',
    intro: 'Every player gets a safety briefing from a marshal before each mission. These rules apply at all times inside the arena.',
    sections: [
      ['Protective gear', [
        'Full-seal eye protection must be worn inside the arena at all times, including during breaks. It comes off only in the prep area.',
        'Wear closed shoes and clothing that covers your arms and legs. Gloves are recommended.',
        'Smart vests and helmets are issued by marshals and must be worn as fitted.',
      ]],
      ['Blaster handling', [
        'Blasters are recreational gel blasters issued and checked by marshals. Never bring your own equipment.',
        'Point blasters only at the arena and at opposing players. Never at faces, heads at close range, staff or spectators.',
        'Keep your finger off the trigger until you intend to fire. No blind firing over or around cover.',
        'Minimum engagement distance is 3 metres. Inside that distance, call the elimination instead of firing.',
        'Blasters stay in the arena. Leaving the arena means handing your blaster to a marshal.',
      ]],
      ['Conduct', [
        'Marshals’ calls are final. Stop immediately when you hear the stop whistle or see the red stop light.',
        'No running on raised structures, no climbing barricades, and no physical contact with other players.',
        'Players under the influence of alcohol or drugs will not be allowed to play.',
        'Tell a marshal straight away about any injury, faulty equipment or unsafe behaviour.',
      ]],
      ['Who can play', [
        'Minimum age and supervision rules are set by the arena and shown at booking. Minors need a parent or guardian’s consent.',
        'Let us know about any medical condition that could affect you during physical play.',
      ]],
    ],
  },
  terms: {
    title: 'Terms and conditions',
    intro: 'These terms apply to enquiries, bookings and play at ARENA11.',
    sections: [
      ['Enquiries and bookings', [
        'Submitting the booking form creates an enquiry only. A booking is confirmed only when our team confirms it with you directly.',
        'Prices, session lengths and availability are confirmed at the time of booking.',
      ]],
      ['Participation', [
        'All players must follow the safety rules and the instructions of marshals. We may stop play or remove a player who does not.',
        'Equipment remains the property of ARENA11. Deliberate damage may be charged.',
        'Physical play carries some risk of minor injury such as bruising. Players take part at their own risk within the limits allowed by law.',
      ]],
      ['Scores and media', [
        'Scores, nicknames and match statistics may be shown on screens in the arena and on this website. Use a nickname if you prefer not to show your name.',
        'Photos taken by staff may be used on this website and our social channels. Tell a marshal if you do not want to appear.',
      ]],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    intro: 'This explains what we collect and why.',
    sections: [
      ['What we collect', [
        'Booking enquiries: your name, contact number, optional email, group size, preferred date and time and any notes you add.',
        'Players: a name, an optional nickname and an optional phone number entered by staff, plus match statistics.',
      ]],
      ['How we use it', [
        'To respond to enquiries, run matches and show scores. We do not sell your data.',
        'Phone numbers are visible only to signed-in staff. Public screens and the website show nicknames and statistics only.',
      ]],
      ['Storage and security', [
        'Data is stored on our own server and protected with access controls. Staff actions are logged.',
        'Ask us to correct or delete your details at any time using the contact details below.',
      ]],
    ],
  },
}

export default function Legal() {
  const { page = 'safety' } = useParams()
  const s = useSiteSettings()
  const p = PAGES[page]
  if (!p) return <Navigate to="/" replace />
  return (
    <article className="mx-auto max-w-3xl px-[var(--edge)] pb-24 pt-32">
      <p className="kicker">ARENA11 // Information</p>
      <h1 className="headline-sm mt-4">{p.title}</h1>
      <p className="mt-6 text-lg text-muted">{p.intro}</p>
      {p.sections.map(([h, items]) => (
        <section key={h} className="mt-10">
          <h2 className="font-display text-xl uppercase tracking-[0.08em] text-hazard">{h}</h2>
          <ul className="mt-4 space-y-3">
            {items.map((t) => (
              <li key={t} className="flex gap-3 text-text/85">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-hazard" />
                {t}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-12 border-t border-white/10 pt-6 text-sm text-dim">
        Questions? {s.email ? <a href={`mailto:${s.email}`} className="underline">{s.email}</a> : 'Contact details will be published here soon.'}
      </p>
    </article>
  )
}
