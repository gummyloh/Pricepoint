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
