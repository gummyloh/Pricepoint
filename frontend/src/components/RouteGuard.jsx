import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullscreenLoader />;
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

export function GuestOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullscreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-slate-900 animate-pulse" />
        <span className="eyebrow text-slate-500">Loading</span>
      </div>
    </div>
  );
}
