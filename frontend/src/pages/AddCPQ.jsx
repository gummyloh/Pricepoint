import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { CPQ_FORM } from "@/constants/testIds/farg";
import { formatMYR, formatPct } from "@/lib/format";

function emptyLine() {
  return {
    _id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `l-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    part_no: "",
    unit_price: "",
    customer: "",
    cpq_price: "",
    qty: 1,
    description: "",
    notes: "",
  };
}

export default function AddCPQ() {
  const nav = useNavigate();
  const [cpqNumber, setCpqNumber] = useState("");
  const [cpqDate, setCpqDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (i, k, v) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  };

  const removeLine = (i) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!cpqNumber.trim() || !cpqDate) {
      toast.error("CPQ number and date required");
      return;
    }
    for (const [i, l] of lines.entries()) {
      if (!l.part_no || l.unit_price === "" || !l.customer || l.cpq_price === "") {
        toast.error(`Line ${i + 1}: fill Part No, Unit Price, Customer, CPQ Price`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        cpq_number: cpqNumber.trim(),
        cpq_date: cpqDate,
        lines: lines.map((l) => ({
          part_no: l.part_no.trim(),
          unit_price: Number(l.unit_price),
          customer: l.customer.trim(),
          cpq_price: Number(l.cpq_price),
          qty: l.qty === "" ? 1 : Number(l.qty),
          description: l.description || "",
          notes: l.notes || "",
        })),
      };
      const { data } = await api.post("/price-records/batch", payload);
      toast.success(`${data.inserted} record(s) added`);
      nav("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-10 lg:py-14">
      <p className="eyebrow text-slate-500 mb-3">New entry</p>
      <h1 className="font-display text-4xl font-bold tracking-tight text-slate-950 mb-8">
        Add CPQ pricing
      </h1>
      <form onSubmit={submit} className="space-y-6">
        {/* CPQ header */}
        <Card className="border-slate-200 rounded-lg p-6 bg-white shadow-none">
          <p className="eyebrow text-slate-500 mb-4">CPQ Header</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>CPQ / Project #</Label>
              <Input
                data-testid={CPQ_FORM.cpqNumber}
                required
                value={cpqNumber}
                onChange={(e) => setCpqNumber(e.target.value)}
                placeholder="e.g. CPQ-2026-042"
                className="h-11 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CPQ Date</Label>
              <Input
                data-testid={CPQ_FORM.cpqDate}
                type="date"
                required
                value={cpqDate}
                onChange={(e) => setCpqDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        </Card>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="eyebrow text-slate-500">Line items · {lines.length}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={CPQ_FORM.addLine}
              onClick={() => setLines((p) => [...p, emptyLine()])}
              className="border-slate-300"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => {
              const disc =
                l.unit_price && l.cpq_price
                  ? ((Number(l.unit_price) - Number(l.cpq_price)) /
                      Number(l.unit_price)) *
                    100
                  : 0;
              return (
                <Card
                  key={l._id}
                  className="border-slate-200 rounded-lg p-5 bg-white shadow-none"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center">
                        <Package className="h-3.5 w-3.5 text-slate-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-950">
                        Line {i + 1}
                      </p>
                      {l.unit_price && l.cpq_price && (
                        <span className="ml-3 text-xs text-slate-500 font-mono-price">
                          Discount {formatPct(disc)}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600"
                      data-testid={CPQ_FORM.removeLine(i)}
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Part No</Label>
                      <Input
                        data-testid={CPQ_FORM.linePart(i)}
                        value={l.part_no}
                        onChange={(e) => updateLine(i, "part_no", e.target.value)}
                        placeholder="PART-001"
                        className="h-10 font-mono-price"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unit Price (RM)</Label>
                      <Input
                        data-testid={CPQ_FORM.lineUnit(i)}
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.unit_price}
                        onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                        placeholder="0.00"
                        className="h-10 font-mono-price"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Customer</Label>
                      <Input
                        data-testid={CPQ_FORM.lineCustomer(i)}
                        value={l.customer}
                        onChange={(e) => updateLine(i, "customer", e.target.value)}
                        placeholder="Customer name"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">CPQ Price (RM)</Label>
                      <Input
                        data-testid={CPQ_FORM.lineCpqPrice(i)}
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.cpq_price}
                        onChange={(e) => updateLine(i, "cpq_price", e.target.value)}
                        placeholder="0.00"
                        className="h-10 font-mono-price"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        data-testid={CPQ_FORM.lineQty(i)}
                        type="number"
                        step="1"
                        min="1"
                        value={l.qty}
                        onChange={(e) => updateLine(i, "qty", e.target.value)}
                        placeholder="1"
                        className="h-10 font-mono-price"
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
                      <Label className="text-xs">Description (optional)</Label>
                      <Input
                        data-testid={CPQ_FORM.lineDescription(i)}
                        value={l.description}
                        onChange={(e) => updateLine(i, "description", e.target.value)}
                        placeholder="Item description"
                        className="h-10"
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4 space-y-1.5">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Textarea
                        data-testid={CPQ_FORM.lineNotes(i)}
                        value={l.notes}
                        onChange={(e) => updateLine(i, "notes", e.target.value)}
                        placeholder="Reason for special pricing…"
                        rows={2}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            data-testid={CPQ_FORM.submit}
            disabled={submitting}
            className="h-11 px-6 bg-slate-950 hover:bg-slate-900 text-white"
          >
            {submitting ? "Saving…" : `Save ${lines.length} record(s)`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => nav("/")}
            className="h-11 px-6 border-slate-300"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
