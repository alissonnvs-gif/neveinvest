export default function GradientRing({ pct, size = 84 }: { pct: number; size?: number }) {
  const stroke = Math.max(6, size * 0.09)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, pct))
  const gradId = `ring-grad-${size}`
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="55%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#413764" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={`url(#${gradId})`} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-slate-100 font-black" style={{ fontSize: size * 0.2 }}>
        {clamped.toFixed(0)}%
      </text>
    </svg>
  )
}
