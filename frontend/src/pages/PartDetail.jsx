import { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  TrendingDown,
  Package,
  Copy,
} from "lucide-react";
import { formatMYR, formatDate, formatPct, discountPillClass } from "@/lib/format";
import { toast } from "sonner";
import { PART } from "@/constants/testIds/farg";
import EditRecordDialog from "@/components/EditRecordDialog";
import ExportButton from "@/components/ExportButton";
import DuplicateCPQDialog from "@/components/DuplicateCPQDialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const AXIS_TICK = { fontSize: 11 };
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

export default function PartDetail() {
  const { partNo } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [dupTarget, setDupTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/price-records/by-part/${encodeURIComponent(partNo)}`
      );
      setData(data);
    } catch (err) {
      toast.error(formatApiError(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [partNo]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this price record?")) return;
    try {
      await api.delete(`/price-records/${id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-16 text-center">
        <p className="eyebrow mb-2 text-slate-500">Not found</p>
        <p className="text-slate-700">Part &quot;{partNo}&quot; has no records.</p>
        <Button variant="outline" className="mt-6" onClick={() => nav("/")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to lookup
        </Button>
      </div>
    );
  }

  const chartData = [...data.records]
    .filter((r) => r.cpq_date)
    .sort((a, b) => a.cpq_date.localeCompare(b.cpq_date))
    .map((r) => ({
      date: r.cpq_date,
      "CPQ Price": r.cpq_price,
      "List Price": r.unit_price,
    }));

  const minCpq = Math.min(...data.records.map((r) => r.cpq_price));
  const bestRecord = data.records.find((r) => r.cpq_price === minCpq);

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10 lg:py-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-950 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to lookup
      </Link>

      <div className="flex items-center justify-end mb-4">
        <ExportButton
          testId="part-export-btn"
          label="Export part history"
          params={{ part_no: data.part_no }}
        />
      </div>

      {/* Hero: bento grid */}
      <div
        data-testid={PART.header}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10"
      >
        <Card className="lg:col-span-2 border-slate-200 rounded-lg p-8 bg-white shadow-none">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-md bg-slate-950 text-white flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="eyebrow text-slate-500">Part No</p>
              <h1 className="font-mono-price text-3xl md:text-4xl font-bold text-slate-950 tracking-tight">
                {data.part_no}
              </h1>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4">
            <div>
              <p className="eyebrow text-slate-500">Current List Price</p>
              <p
                data-testid={PART.currentPrice}
                className="font-mono-price text-4xl md:text-5xl font-bold text-slate-950 mt-1"
              >
                {formatMYR(data.latest_unit_price)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Latest recorded on {formatDate(data.latest_cpq_date)}
              </p>
            </div>
            <div className="border-l border-slate-200 pl-10">
              <p className="eyebrow text-slate-500">CPQ history</p>
              <p className="font-mono-price text-2xl font-semibold text-slate-950 mt-1">
                {data.records.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Across {new Set(data.records.map((r) => r.customer)).size} customer(s)
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-slate-200 rounded-lg p-6 bg-slate-950 text-white shadow-none">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-emerald-400" />
            <p className="eyebrow text-white/60">Best Ever CPQ Price</p>
          </div>
          <p className="font-mono-price text-3xl font-bold mt-3">
            {formatMYR(minCpq)}
          </p>
          {bestRecord && (
            <div className="mt-4 text-sm text-white/70 space-y-1">
              <p>
                <span className="text-white/50">CPQ #</span>{" "}
                <span className="font-mono-price text-white">
                  {bestRecord.cpq_number}
                </span>
              </p>
              <p>
                <span className="text-white/50">Customer</span>{" "}
                <span className="text-white">{bestRecord.customer}</span>
              </p>
              <p>
                <span className="text-white/50">Discount</span>{" "}
                <span className="text-emerald-400 font-mono-price">
                  {formatPct(bestRecord.discount_pct)}
                </span>
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <Card className="border-slate-200 rounded-lg p-6 bg-white shadow-none mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow text-slate-500">Price trend</p>
              <p className="font-display text-lg font-semibold text-slate-950">
                List vs CPQ over time
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  tick={AXIS_TICK}
                />
                <YAxis stroke="#64748b" tick={AXIS_TICK} />
                <RTooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => formatMYR(v)}
                />
                <Line
                  type="monotone"
                  dataKey="List Price"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="CPQ Price"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* History table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="eyebrow text-slate-600">CPQ History</p>
            <Badge
              variant="secondary"
              className="rounded-full bg-slate-950 text-white hover:bg-slate-900"
            >
              {data.records.length}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">Newest first</p>
        </div>
        <div className="overflow-x-auto">
          <Table data-testid={PART.historyTable}>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="eyebrow text-slate-600">CPQ#</TableHead>
                <TableHead className="eyebrow text-slate-600">Date</TableHead>
                <TableHead className="eyebrow text-slate-600">Customer</TableHead>
                <TableHead className="eyebrow text-slate-600">Description</TableHead>
                <TableHead className="eyebrow text-slate-600 text-right">
                  Qty
                </TableHead>
                <TableHead className="eyebrow text-slate-600 text-right">
                  List
                </TableHead>
                <TableHead className="eyebrow text-slate-600 text-right">
                  CPQ Price
                </TableHead>
                <TableHead className="eyebrow text-slate-600 text-right">
                  Discount
                </TableHead>
                <TableHead className="eyebrow text-slate-600">Notes</TableHead>
                <TableHead className="text-right eyebrow text-slate-600">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.records.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid={PART.row(r.id)}
                  className="border-slate-100"
                >
                  <TableCell className="font-mono-price font-medium text-slate-950">
                    {r.cpq_number}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {formatDate(r.cpq_date)}
                  </TableCell>
                  <TableCell className="text-slate-700">{r.customer}</TableCell>
                  <TableCell className="text-slate-600 max-w-[220px] truncate">
                    {r.description || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono-price text-slate-600">
                    {r.qty ?? 1}
                  </TableCell>
                  <TableCell className="text-right font-mono-price text-slate-600">
                    {formatMYR(r.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price font-semibold text-slate-950">
                    {formatMYR(r.cpq_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${discountPillClass(r.discount_pct)}`}
                    >
                      {formatPct(r.discount_pct)}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600 max-w-[280px] truncate">
                    {r.notes || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Duplicate CPQ to another customer"
                        data-testid={`part-duplicate-${r.id}`}
                        onClick={() =>
                          setDupTarget({
                            cpqNumber: r.cpq_number,
                            sourceCustomer: r.customer,
                          })
                        }
                        className="h-8 w-8"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={PART.editBtn(r.id)}
                        onClick={() => setEditing(r)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={PART.deleteBtn(r.id)}
                        onClick={() => onDelete(r.id)}
                        className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {editing && (
        <EditRecordDialog
          record={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {dupTarget && (
        <DuplicateCPQDialog
          open={!!dupTarget}
          cpqNumber={dupTarget.cpqNumber}
          sourceCustomer={dupTarget.sourceCustomer}
          onClose={() => setDupTarget(null)}
          onDone={() => {
            setDupTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}
