import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { API } from "@/lib/api";
import { toast } from "sonner";

/**
 * Downloads an .xlsx from /api/export/xlsx.
 * Uses fetch with credentials so the httpOnly auth cookie is sent.
 */
export default function ExportButton({
  label = "Export",
  params = {},
  testId = "export-button",
  variant = "outline",
  className = "",
}) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const url = new URL(`${API}/export/xlsx`);
      Object.entries(params).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
      });
      const res = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : "farg-export.xlsx";
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Excel downloaded");
    } catch (err) {
      toast.error(err.message || "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={download}
      disabled={loading}
      data-testid={testId}
      className={`border-slate-300 ${className}`}
    >
      <Download className="h-3.5 w-3.5 mr-1.5" />
      {loading ? "Exporting…" : label}
    </Button>
  );
}
