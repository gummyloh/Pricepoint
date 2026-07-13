import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AUTH } from "@/constants/testIds/farg";

export default function RegisterPage() {
  const { register, bootstrap } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  if (bootstrap.has_users) return <Navigate to="/login" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      toast.success("Account created");
      nav("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-lg border-slate-200 rounded-lg p-8 md:p-10 bg-white">
        <p className="eyebrow text-slate-500 mb-3">Bootstrap</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950">
          Create the first admin
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          No accounts exist yet. This account will own the workspace and can
          invite the rest of your team from the Users page.
        </p>
        <form onSubmit={onSubmit} className="space-y-4 mt-8">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              required
              data-testid={AUTH.registerName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              data-testid={AUTH.registerEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              data-testid={AUTH.registerPassword}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            data-testid={AUTH.registerSubmit}
            className="w-full h-11 bg-slate-950 hover:bg-slate-900 text-white"
          >
            {loading ? "Creating…" : "Create admin account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
