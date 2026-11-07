import { ZONAS } from '../lib/zonas.js'

const GEOM = {
  coronilla: { cx: 60, cy: 22, rx: 17, ry: 9 },
  frente: { cx: 60, cy: 42, rx: 21, ry: 11 },
  sien_izq: { cx: 26, cy: 52, rx: 8, ry: 13 },
  sien_der: { cx: 94, cy: 52, rx: 8, ry: 13 },
  ojo_izq: { cx: 44, cy: 56, rx: 8, ry: 4.8 },
  ojo_der: { cx: 76, cy: 56, rx: 8, ry: 4.8 },
  nuca: { cx: 60, cy: 46, rx: 15, ry: 11 },
  cuello: { cx: 60, cy: 94, rx: 14, ry: 11 }
}

const FRENTE = <path d="M60 12 C84 12 100 30 100 54 C100 72 90 84 78 92 C74 96 68 100 66 108 L54 108 C52 100 46 96 42 92 C30 84 20 72 20 54 C20 30 36 12 60 12 Z" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />

const PERFIL = (
  <>
    <path d="M58 16 C80 16 90 32 90 50 C90 66 78 80 66 86 C84 92 94 98 98 100 L98 104 C86 104 74 100 64 96 C64 102 64 107 66 110 L50 110 C52 100 54 92 54 84 C58 92 64 94 72 94 C76 94 80 92 82 90 C74 92 70 88 70 82 C70 74 78 70 80 62 C82 50 82 34 58 34 C44 34 34 42 32 52 C30 44 38 16 58 16 Z" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />
    <path d="M82 62 L92 64 L82 68 Z" fill="#475569" />
    <circle cx="72" cy="42" r="1.8" fill="#475569" />
  </>
)

const ATRAS = (
  <>
    <path d="M60 14 C82 14 94 30 94 52 C94 72 82 84 70 90 C68 96 66 100 66 108 L54 108 C54 100 52 96 50 90 C38 84 26 72 26 52 C26 30 38 14 60 14 Z" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />
    <ellipse cx="24" cy="52" rx="4.5" ry="8" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />
    <ellipse cx="96" cy="52" rx="4.5" ry="8" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />
    <path d="M30 120 C30 100 44 90 60 90 C76 90 90 100 90 120 Z" fill="#101b2e" stroke="#64748b" strokeWidth="1.6" />
  </>
)

function Zona({ z, onToggle, active }) {
  const g = GEOM[z.code]
  if (!g) return null
  const interactive = !!onToggle
  return (
    <g
      key={z.code}
      onClick={interactive ? () => onToggle(z.code) : undefined}
      role={interactive ? 'button' : undefined}
      aria-pressed={interactive ? active : undefined}
      aria-label={interactive ? z.label : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(z.code)
        }
      } : undefined}
      className={interactive ? 'cursor-pointer' : ''}
      style={interactive ? { outline: 'none' } : undefined}
    >
      <title>{z.label}</title>
      {active && (
        <ellipse cx={g.cx} cy={g.cy} rx={g.rx + 2.2} ry={g.ry + 2.2} fill="none" stroke="#fb7185" strokeWidth="3.6" strokeOpacity="0.3" />
      )}
      <ellipse
        cx={g.cx}
        cy={g.cy}
        rx={g.rx}
        ry={g.ry}
        fill={active ? 'rgba(251,113,133,0.35)' : 'transparent'}
        stroke={active ? '#fb7185' : 'rgba(148,163,184,0.45)'}
        strokeWidth={active ? 1.5 : 1}
      />
    </g>
  )
}

function Vista({ zonas = [], onToggle, view }) {
  const zonasView = ZONAS.filter((z) => z.view === view)
  const silueta = view === 'frontal' ? FRENTE : view === 'perfil' ? PERFIL : ATRAS
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto select-none" role="img" aria-label={view === 'frontal' ? 'Cabeza vista frontal' : view === 'perfil' ? 'Cabeza vista de costado' : 'Cabeza vista posterior'}>
      {silueta}
      {zonasView.map((z) => (
        <Zona key={z.code} z={z} onToggle={onToggle} active={zonas.includes(z.code)} />
      ))}
    </svg>
  )
}

export default function HeadMap({ zonas = [], onToggle, compact = false }) {
  return (
    <div className={`flex gap-3 ${compact ? 'max-w-[150px]' : ''}`}>
      {[{ v: 'frontal', label: 'Frente' }, { v: 'perfil', label: 'Costado' }, { v: 'atras', label: 'Atrás' }].map(({ v, label }) => (
        <div key={v} className="flex-1 min-w-0">
          <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
          <div className="max-w-[120px] mx-auto">
            <Vista zonas={zonas} onToggle={onToggle} view={v} />
          </div>
        </div>
      ))}
    </div>
  )
}