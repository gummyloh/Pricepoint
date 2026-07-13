import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Search, PlusSquare, UploadCloud, Users2 } from "lucide-react";
import { NAV, AUTH } from "@/constants/testIds/farg";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const links = [
    { to: "/", label: "Lookup", testid: NAV.search, Icon: Search },
    { to: "/add", label: "Add CPQ", testid: NAV.addCpq, Icon: PlusSquare },
    { to: "/import", label: "Import", testid: NAV.import, Icon: UploadCloud },
    { to: "/users", label: "Users", testid: NAV.users, Icon: Users2 },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10 flex items-center h-16 gap-8">
          <Link
            to="/"
            data-testid={NAV.brand}
            className="flex items-baseline gap-2"
          >
            <span className="font-display text-xl font-bold tracking-tight text-slate-950">
              Pricepoint
            </span>
            <span className="eyebrow text-slate-500">CPQ history</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {links.map(({ to, label, testid, Icon }) => (
              <NavLink
                key={to}
                to={to}
                data-testid={testid}
                end={to === "/"}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-950 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-slate-900">
                  {user.name}
                </span>
                <span className="text-xs text-slate-500">{user.email}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              data-testid={AUTH.logoutBtn}
              onClick={async () => {
                await logout();
                nav("/login");
              }}
              className="border-slate-300"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-6 text-center">
        <p className="eyebrow text-slate-400">
          Pricepoint · Internal Pricing Reference · MYR
        </p>
      </footer>
    </div>
  );
}
