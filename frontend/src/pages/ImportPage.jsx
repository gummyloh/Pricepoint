import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { IMPORT } from "@/constants/testIds/farg";

const TARGET_FIELDS = [
  { key: "part_no", label: "Part No", required: true },
  { key: "unit_price", label: "Unit Price", required: true },
  { key: "cpq_number", label: "CPQ / Project #", required: true },
  { key: "cpq_date", label: "CPQ Date", required: true },
  { key: "customer", label: "Customer", required: true },
  { key: "cpq_price", label: "CPQ Price", required: true },
  { key: "notes", label: "Notes", required: false },
];

const SKIP = "__skip__";

function autoMap(columns) {
  const norm = (s) => String(s).toLowerCase().replace(/[\s_/#()-]+/g, "");
  const guesses = {
    part_no: ["partno", "part", "partnumber", "sku", "item"],
    unit_price: ["unitprice", "listprice", "list", "unit"],
    cpq_number: ["cpq", "cpqno", "cpqnumber", "project", "projectno", "projectnumber"],
    cpq_date: ["date", "cpqdate", "period", "createddate"],
    customer: ["customer", "endcustomer", "client", "account"],
    cpq_price: ["cpqprice", "quoted", "price", "projectprice"],
    notes: ["notes", "remarks", "comment", "reason"],
  };
  const result = {};
  for (const f of TARGET_FIELDS) result[f.key] = SKIP;
  for (const col of columns) {
    const n = norm(col);
    for (const [field, keys] of Object.entries(guesses)) {
      if (result[field] !== SKIP) continue;
      if (keys.some((k) => n === k || n.includes(k))) {
        result[field] = col;
        break;
      }
    }
  }
  return result;
}

export default function ImportPage() {
  const nav = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const canCommit = useMemo(() => {
    if (!preview) return false;
    return TARGET_FIELDS.filter((f) => f.required).every(
      (f) => mapping[f.key] && mapping[f.key] !== SKIP
    );
  }, [preview, mapping]);

  const upload = async (f) => {
    setUploading(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      setMapping(autoMap(data.columns));
      toast.success(`Parsed ${data.row_count} rows`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      upload(f);
    }
  };

  const onSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      upload(f);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    try {
      const rows = preview.all_rows
        .map((r) => {
          const out = {};
          for (const f of TARGET_FIELDS) {
            const src = mapping[f.key];
            out[f.key] = src && src !== SKIP ? r[src] ?? "" : "";
          }
          return out;
        })
        .filter((r) => r.part_no && r.cpq_number && r.customer);
      const { data } = await api.post("/import/commit", { rows });
      toast.success(`Imported ${data.inserted} records`);
      nav("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-10 lg:py-14">
      <p className="eyebrow text-slate-500 mb-3">Bulk data</p>
      <h1 className="font-display text-4xl font-bold tracking-tight text-slate-950 mb-8">
        Excel / CSV import
      </h1>

      {!preview && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-16 text-center bg-white"
        >
          <div className="mx-auto h-12 w-12 rounded-md bg-slate-950 text-white flex items-center justify-center mb-4">
            <UploadCloud className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl font-semibold text-slate-950">
            Drop an .xlsx, .xls or .csv here
          </h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            We&apos;ll auto-detect columns like Part No, Unit Price, CPQ#, Date,
            Customer and CPQ Price. You can review and remap before importing.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            data-testid={IMPORT.fileInput}
            className="hidden"
            onChange={onSelect}
          />
          <Button
            type="button"
            data-testid={IMPORT.uploadBtn}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-6 h-11 px-6 bg-slate-950 hover:bg-slate-900 text-white"
          >
            {uploading ? "Parsing…" : "Choose file"}
          </Button>
          {file && (
            <p className="mt-4 text-xs text-slate-500 font-mono-price">
              {file.name}
            </p>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-6">
          {/* File summary */}
          <Card className="border-slate-200 rounded-lg p-5 bg-white shadow-none flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <p className="font-medium text-slate-950 text-sm">
                  {file?.name}
                </p>
                <p className="text-xs text-slate-500 font-mono-price">
                  {preview.row_count} rows · {preview.columns.length} columns
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300"
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
            >
              Replace file
            </Button>
          </Card>

          {/* Column mapping */}
          <Card className="border-slate-200 rounded-lg p-6 bg-white shadow-none">
            <p className="eyebrow text-slate-500 mb-4">Column mapping</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TARGET_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {f.label}
                    {f.required && (
                      <span className="text-rose-600 ml-1">*</span>
                    )}
                  </Label>
                  <Select
                    value={mapping[f.key] || SKIP}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v }))
                    }
                  >
                    <SelectTrigger
                      data-testid={IMPORT.mapping(f.key)}
                      className="h-10"
                    >
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— Skip —</SelectItem>
                      {preview.columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Card>

          {/* Preview */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <p className="eyebrow text-slate-600">
                Preview · first {preview.sample_rows.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table data-testid={IMPORT.previewTable}>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    {TARGET_FIELDS.map((f) => (
                      <TableHead
                        key={f.key}
                        className="eyebrow text-slate-600"
                      >
                        {f.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sample_rows.map((r, i) => (
                    <TableRow key={i} className="border-slate-100">
                      {TARGET_FIELDS.map((f) => {
                        const src = mapping[f.key];
                        const value = src && src !== SKIP ? r[src] : "";
                        return (
                          <TableCell
                            key={f.key}
                            className={
                              ["unit_price", "cpq_price", "part_no", "cpq_number"].includes(
                                f.key
                              )
                                ? "font-mono-price"
                                : ""
                            }
                          >
                            {value || <span className="text-slate-300">—</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              data-testid={IMPORT.commitBtn}
              onClick={commit}
              disabled={!canCommit || committing}
              className="h-11 px-6 bg-slate-950 hover:bg-slate-900 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {committing
                ? "Importing…"
                : `Import ${preview.row_count} record(s)`}
            </Button>
            {!canCommit && (
              <p className="text-xs text-slate-500">
                Map all required columns to enable import.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
