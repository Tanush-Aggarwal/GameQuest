import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const formattedMonth = label ? new Date(`${label}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : label;
    return (
      <div className="rounded-card border border-border bg-surface p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold text-text mb-1">{formattedMonth}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="flex items-center gap-2 font-medium" style={{ color: entry.color }}>
            <span className="capitalize">{entry.name}:</span>
            <span className="tabular-nums font-bold">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// The six-month added-vs-completed chart. Recharts is large, so this file is loaded only when a chart is drawn (Home loads it lazily).
export default function VelocityChart({ chartData }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorAdded" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--status-completed)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--status-completed)" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="formattedMonth" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
        <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="added"
          stroke="var(--accent)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorAdded)"
        />
        <Area
          type="monotone"
          dataKey="completed"
          stroke="var(--status-completed)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorCompleted)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
