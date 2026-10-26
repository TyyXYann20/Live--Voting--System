import { NavLink, Outlet, Navigate, Link } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserRound,
  ChartNoAxesColumnIncreasing,
  History,
  Settings,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase, configured } from "../services/supabase";
import { Brand, Loading } from "./UI";
import ThemeToggle from "./ThemeToggle";
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["sessions", "Sessions", CalendarDays],
  ["teams", "Teams", Users],
  ["participants", "Participants", UserRound],
  ["results", "Live results", ChartNoAxesColumnIncreasing],
  ["history", "History", History],
  ["settings", "Settings", Settings],
];
export function AdminLayout() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.admin) return <Navigate to="/admin/login" replace />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/admin/dashboard">
          <Brand />
        </Link>
        <div className="sidebar-theme">
          <ThemeToggle />
        </div>
        <div className="workspace-label">EVENT WORKSPACE</div>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <NavLink to={`/admin/${path}`} key={path}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/vote" target="_blank">
            Participant page <ArrowUpRight size={16} />
          </Link>
          <div className="admin-profile">
            <span className="avatar">A</span>
            <div>
              <b>Administrator</b>
              <small>{auth.user?.email}</small>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
export function PublicLayout() {
  return (
    <div className="public-shell">
      <header>
        <Link to="/vote">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        Every team. Every voice. <span>Powered by Coding 12PM</span>
      </footer>
      {!configured && (
        <div className="setup-note">
          Supabase setup required · See README.md to connect your project.
        </div>
      )}
    </div>
  );
}
