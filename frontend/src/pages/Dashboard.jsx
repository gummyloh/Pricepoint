import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search as SearchIcon, ArrowUpRight, Copy } from "lucide-react";
import { formatMYR, formatDate, formatPct } from "@/lib/format";
import { SEARCH } from "@/constants/testIds/farg";
import ExportButton from "@/components/ExportButton";
import DuplicateCPQDialog from "@/components/DuplicateCPQDialog";

export default function Dashboard() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [dupTarget, setDupTarget] = useState(null);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/price-records", {
          params: q ? { q } : {},
        });
        setRows(data);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const empty = !loading && rows.length === 0;

  const reload = async () => {
    try {
      const { data } = await api.get("/price-records", {
        params: q ? { q } : {},
      });
      setRows(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10 lg:py-14">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {[
          { k: "Records", v: stats?.total_records ?? "—" },
          { k: "Parts", v: stats?.distinct_parts ?? "—" },
          { k: "Customers", v: stats?.distinct_customers ?? "—" },
          { k: "CPQs", v: stats?.distinct_cpq ?? "—" },
        ].map((s) => (
          <Card
            key={s.k}
            className="border-slate-200 rounded-lg p-4 shadow-none bg-white"
          >
            <p className="eyebrow text-slate-500">{s.k}</p>
            <p className="font-mono-price text-2xl font-semibold text-slate-950 mt-1">
              {s.v}
            </p>
          </Card>
        ))}
      </div>

      {/* Hero search */}
      <div className="mb-8">
        <p className="eyebrow text-slate-500 mb-3">Lookup</p>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight text-slate-950 mb-8 max-w-3xl">
          Find any part, CPQ, or customer.
        </h1>
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            data-testid={SEARCH.input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Part No, CPQ#, or Customer…"
            className="h-16 pl-12 pr-4 text-lg md:text-xl border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-950 rounded-lg"
          />
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <p className="eyebrow text-slate-600">
              {q ? "Results" : "Latest price records"}
            </p>
            {!loading && (
              <Badge
                variant="secondary"
                className="rounded-full bg-slate-950 text-white hover:bg-slate-900"
              >
                {rows.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500 hidden md:block">
              Sorted by CPQ date · newest first
            </p>
            <ExportButton
              testId="dashboard-export-btn"
              label="Export Excel"
              params={q ? { q } : {}}
            />
          </div>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : empty ? (
          <div
            data-testid={SEARCH.emptyState}
            className="p-16 text-center text-slate-500"
          >
            <p className="eyebrow mb-2">Nothing here</p>
            <p className="text-sm">
              No matching records. Try a different search term, or add a CPQ.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid={SEARCH.resultsTable}>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="eyebrow text-slate-600">Part No</TableHead>
                  <TableHead className="eyebrow text-slate-600">CPQ#</TableHead>
                  <TableHead className="eyebrow text-slate-600">Date</TableHead>
                  <TableHead className="eyebrow text-slate-600">Customer</TableHead>
                  <TableHead className="eyebrow text-slate-600 text-right">
                    List Price
                  </TableHead>
                  <TableHead className="eyebrow text-slate-600 text-right">
                    CPQ Price
                  </TableHead>
                  <TableHead className="eyebrow text-slate-600 text-right">
                    Discount
                  </TableHead>
                  <TableHead className="eyebrow text-slate-600 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    data-testid={SEARCH.row(r.id)}
                    className="border-slate-100"
                  >
                    <TableCell className="font-mono-price font-medium">
                      <Link
                        to={`/part/${encodeURIComponent(r.part_no)}`}
                        data-testid={SEARCH.partLink(r.part_no)}
                        className="text-slate-950 hover:underline underline-offset-4 decoration-slate-400 inline-flex items-center gap-1"
                      >
                        {r.part_no}
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono-price text-slate-700">
                      {r.cpq_number}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {formatDate(r.cpq_date)}
                    </TableCell>
                    <TableCell className="text-slate-700">{r.customer}</TableCell>
                    <TableCell className="text-right font-mono-price text-slate-600">
                      {formatMYR(r.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-mono-price font-semibold text-slate-950">
                      {formatMYR(r.cpq_price)}
                    </TableCell>
                    <TableCell className="text-right font-mono-price">
                      <DiscountBadge pct={r.discount_pct} />
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        title="Duplicate to another customer"
                        data-testid={`duplicate-row-${r.id}`}
                        onClick={() =>
                          setDupTarget({
                            cpqNumber: r.cpq_number,
                            sourceCustomer: r.customer,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dupTarget && (
        <DuplicateCPQDialog
          open={!!dupTarget}
          cpqNumber={dupTarget.cpqNumber}
          sourceCustomer={dupTarget.sourceCustomer}
          onClose={() => setDupTarget(null)}
          onDone={() => {
            setDupTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DiscountBadge({ pct }) {
  const n = Number(pct ?? 0);
  const cls =
    n > 0
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : n < 0
      ? "text-rose-700 bg-rose-50 border-rose-100"
      : "text-slate-600 bg-slate-50 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${cls}`}
    >
      {formatPct(n)}
    </span>
  );
}
