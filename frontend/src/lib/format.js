export function formatMYR(value) {
  const n = Number(value ?? 0);
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}RM ${formatted}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString("en-MY", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function formatPct(v) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)}%`;
}

/** Returns Tailwind classes for a discount pill based on sign. */
export function discountPillClass(pct) {
  const n = Number(pct ?? 0);
  if (n > 0) return "text-emerald-700 bg-emerald-50 border-emerald-100";
  if (n < 0) return "text-rose-700 bg-rose-50 border-rose-100";
  return "text-slate-600 bg-slate-50 border-slate-200";
}
