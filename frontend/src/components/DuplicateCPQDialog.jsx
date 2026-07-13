import { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";

export const DUP = {
  targetInput: "duplicate-target-input",
  addTarget: "duplicate-add-target",
  removeTarget: (i) => `duplicate-remove-target-${i}`,
  newCpqNumber: "duplicate-new-cpq-number",
  newCpqDate: "duplicate-new-cpq-date",
  submit: "duplicate-submit-button",
  cancel: "duplicate-cancel-button",
};

export default function DuplicateCPQDialog({
  open,
  onClose,
  onDone,
  cpqNumber,
  sourceCustomer,
}) {
  const [targets, setTargets] = useState([]);
  const [pending, setPending] = useState("");
  const [newCpq, setNewCpq] = useState("");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);

  const addTarget = () => {
    const v = pending.trim();
    if (!v) return;
    if (targets.includes(v)) {
      toast.error("Already added");
      return;
    }
    if (v.toLowerCase() === (sourceCustomer || "").toLowerCase()) {
      toast.error("Source and target cannot match");
      return;
    }
    setTargets((p) => [...p, v]);
    setPending("");
  };

  const submit = async () => {
    if (targets.length === 0) {
      toast.error("Add at least one target customer");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/price-records/duplicate", {
        cpq_number: cpqNumber,
        source_customer: sourceCustomer,
        target_customers: targets,
        new_cpq_number: newCpq.trim() || null,
        new_cpq_date: newDate || null,
      });
      toast.success(
        `Duplicated ${data.inserted} record(s) to ${data.target_customers.length} customer(s)`
      );
      onDone?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">
            Duplicate CPQ to another customer
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Clone all line items from{" "}
            <span className="font-mono-price font-semibold text-slate-900">
              {cpqNumber}
            </span>{" "}
            /{" "}
            <span className="font-semibold text-slate-900">{sourceCustomer}</span>{" "}
            to one or more new customers. Prices carry over — edit later if
            needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Target customers</Label>
            <div className="flex gap-2">
              <Input
                data-testid={DUP.targetInput}
                value={pending}
                onChange={(e) => setPending(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTarget();
                  }
                }}
                placeholder="Add a customer name, press Enter"
                className="h-10"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTarget}
                data-testid={DUP.addTarget}
                className="border-slate-300 shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {targets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {targets.map((t, i) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-md pl-2.5 pr-1 py-1 font-normal"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() =>
                        setTargets((p) => p.filter((x, idx) => idx !== i))
                      }
                      data-testid={DUP.removeTarget(i)}
                      className="ml-1 rounded hover:bg-slate-300 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="eyebrow text-slate-500">Optional overrides</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">New CPQ # (optional)</Label>
                <Input
                  data-testid={DUP.newCpqNumber}
                  value={newCpq}
                  onChange={(e) => setNewCpq(e.target.value)}
                  placeholder={cpqNumber}
                  className="h-10 font-mono-price"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">New CPQ Date (optional)</Label>
                <Input
                  data-testid={DUP.newCpqDate}
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid={DUP.cancel}
            onClick={onClose}
            className="border-slate-300"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving || targets.length === 0}
            data-testid={DUP.submit}
            className="bg-slate-950 hover:bg-slate-900 text-white"
          >
            {saving
              ? "Duplicating…"
              : `Duplicate to ${targets.length || 0} customer(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
