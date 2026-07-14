import { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { EDIT } from "@/constants/testIds/farg";

export default function EditRecordDialog({ record, open, onClose, onSaved }) {
  const [form, setForm] = useState({
    part_no: record.part_no,
    unit_price: record.unit_price,
    cpq_number: record.cpq_number,
    cpq_date: record.cpq_date,
    customer: record.customer,
    cpq_price: record.cpq_price,
    qty: record.qty ?? 1,
    description: record.description || "",
    notes: record.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/price-records/${record.id}`, {
        ...form,
        unit_price: Number(form.unit_price),
        cpq_price: Number(form.cpq_price),
        qty: Number(form.qty) || 1,
      });
      toast.success("Record updated");
      onSaved?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">
            Edit price record
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Part No</Label>
              <Input
                data-testid={EDIT.partNo}
                value={form.part_no}
                onChange={(e) => set("part_no", e.target.value)}
                className="h-10 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price (RM)</Label>
              <Input
                data-testid={EDIT.unitPrice}
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => set("unit_price", e.target.value)}
                className="h-10 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CPQ Number</Label>
              <Input
                data-testid={EDIT.cpqNumber}
                value={form.cpq_number}
                onChange={(e) => set("cpq_number", e.target.value)}
                className="h-10 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CPQ Date</Label>
              <Input
                data-testid={EDIT.cpqDate}
                type="date"
                value={form.cpq_date}
                onChange={(e) => set("cpq_date", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Input
                data-testid={EDIT.customer}
                value={form.customer}
                onChange={(e) => set("customer", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CPQ Price (RM)</Label>
              <Input
                data-testid={EDIT.cpqPrice}
                type="number"
                step="0.01"
                value={form.cpq_price}
                onChange={(e) => set("cpq_price", e.target.value)}
                className="h-10 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input
                data-testid={EDIT.qty}
                type="number"
                step="1"
                min="1"
                value={form.qty}
                onChange={(e) => set("qty", e.target.value)}
                className="h-10 font-mono-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                data-testid={EDIT.description}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                data-testid={EDIT.notes}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid={EDIT.cancel}
              onClick={onClose}
              className="border-slate-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              data-testid={EDIT.submit}
              className="bg-slate-950 hover:bg-slate-900 text-white"
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
