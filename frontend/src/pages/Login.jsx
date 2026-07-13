import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AUTH } from "@/constants/testIds/farg";

const LOGIN_BG =
  "https://images.unsplash.com/photo-1454117096348-e4abbeba002c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGdlb21ldHJpYyUyMHN1YnRsZXxlbnwwfHx8fDE3ODM5MjY1NTl8MA&ixlib=rb-4.1.0&q=85";

export default function LoginPage() {
  const { login, bootstrap } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  // If no users exist yet, redirect to /register
  if (!bootstrap.has_users) return <Navigate to="/register" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Welcome back");
      nav("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-white">
      <div className="hidden md:block relative overflow-hidden">
        <img
          src={LOGIN_BG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/55" />
        <div className="relative h-full flex flex-col justify-between p-12 lg:p-16 text-white">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold">Pricepoint</span>
            <span className="eyebrow text-white/60">CPQ history</span>
          </div>
          <div>
            <p className="eyebrow text-white/60 mb-4">The single source of price truth</p>
            <h1 className="font-display text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              Every quote,
              <br /> one search away.
            </h1>
            <p className="mt-6 max-w-md text-white/70 leading-relaxed">
              Replace scattered CPQ spreadsheets with a single, chronological
              view of every part price you have ever quoted.
            </p>
          </div>
          <div className="flex items-center gap-6 text-white/50 text-xs uppercase tracking-[0.2em]">
            <span>Internal</span>
            <span>·</span>
            <span>Admin Only</span>
            <span>·</span>
            <span>MYR</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 md:p-12 lg:p-20">
        <Card className="w-full max-w-md border-slate-200 shadow-none rounded-lg p-8 md:p-10">
          <p className="eyebrow text-slate-500 mb-3">Sign in</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 mb-8">
            Welcome back
          </h2>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                data-testid={AUTH.loginEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                data-testid={AUTH.loginPassword}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid={AUTH.loginSubmit}
              className="w-full h-11 bg-slate-950 hover:bg-slate-900 text-white"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-8 text-xs text-slate-500 leading-relaxed">
            Access is invite-only. Contact your admin if you need an account.
          </p>
        </Card>
      </div>
    </div>
  );
}
