import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus2 } from "lucide-react";
import { USERS } from "@/constants/testIds/farg";
import { formatDate } from "@/lib/format";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/auth/invite", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: "admin",
      });
      toast.success("User invited");
      setForm({ name: "", email: "", password: "" });
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 lg:px-10 py-10 lg:py-14">
      <p className="eyebrow text-slate-500 mb-3">Team</p>
      <h1 className="font-display text-4xl font-bold tracking-tight text-slate-950 mb-8">
        Users & access
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invite form */}
        <Card className="border-slate-200 rounded-lg p-6 bg-white shadow-none lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-md bg-slate-950 text-white flex items-center justify-center">
              <UserPlus2 className="h-4 w-4" />
            </div>
            <p className="font-display text-lg font-semibold text-slate-950">
              Invite admin
            </p>
          </div>
          <form onSubmit={invite} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                data-testid={USERS.inviteName}
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                data-testid={USERS.inviteEmail}
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input
                data-testid={USERS.invitePassword}
                type="text"
                required
                minLength={6}
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                className="h-10 font-mono-price"
              />
              <p className="text-xs text-slate-500">
                Share this with the user; they can change it after first login.
              </p>
            </div>
            <Button
              type="submit"
              disabled={saving}
              data-testid={USERS.inviteSubmit}
              className="w-full h-10 bg-slate-950 hover:bg-slate-900 text-white"
            >
              {saving ? "Inviting…" : "Send invite"}
            </Button>
          </form>
        </Card>

        {/* Users list */}
        <div className="lg:col-span-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="eyebrow text-slate-600">Team members</p>
            {!loading && (
              <Badge
                variant="secondary"
                className="rounded-full bg-slate-950 text-white hover:bg-slate-900"
              >
                {users.length}
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table data-testid={USERS.table}>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="eyebrow text-slate-600">Name</TableHead>
                  <TableHead className="eyebrow text-slate-600">Email</TableHead>
                  <TableHead className="eyebrow text-slate-600">Role</TableHead>
                  <TableHead className="eyebrow text-slate-600">Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u._id} className="border-slate-100">
                    <TableCell className="font-medium text-slate-950">
                      {u.name}
                    </TableCell>
                    <TableCell className="text-slate-700 font-mono-price text-sm">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border border-slate-200 bg-slate-50 text-slate-700 uppercase tracking-wider">
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {formatDate(u.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
