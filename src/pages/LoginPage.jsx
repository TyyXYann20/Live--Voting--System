import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { supabase, configured } from "../services/supabase";
import { useAuth } from "../hooks/useAuth";
import { Brand, Field, ErrorBox } from "../components/UI";
export default function LoginPage() {
  const auth = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.admin) return <Navigate to="/admin/dashboard" replace />;
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!configured)
        throw new Error(
          "Supabase is not connected. Configure .env and apply the migration before signing in.",
        );
      const form = new FormData(e.currentTarget);
      const { error } = await supabase.auth.signInWithPassword({
        email: form.get("email"),
        password: form.get("password"),
      });
      if (error) throw error;
      const { data, error: roleError } = await supabase.rpc("is_admin");
      if (roleError) throw roleError;
      if (!data) {
        await supabase.auth.signOut();
        throw new Error("This account does not have administrator access.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <div className="orbit">
            <ChartMark />
          </div>
          <h1>
            Great teams.
            <br />
            Shared moments.
            <br />
            <span>Every voice counts.</span>
          </h1>
          <p>A live voting experience that brings your company together.</p>
        </div>
        <small>COMPANY LIVE TEAM VOTING</small>
      </div>
      <div className="login-form">
        <Link className="back-link" to="/vote">
          ← Back to voting
        </Link>
        <div className="login-inner">
          <span className="lock-icon">
            <LockKeyhole />
          </span>
          <h2>Welcome back.</h2>
          <p className="muted">Sign in to your event workspace.</p>
          <ErrorBox message={error} />
          <form onSubmit={login}>
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-note">
            Administrator access only. Contact your event organizer for an
            account.
          </p>
          {!configured && (
            <div className="setup-card">
              <b>Ready to connect your event</b>
              <p>
                Add your Supabase URL and publishable key to .env, apply the
                migration, and create your administrator. Setup instructions are
                in README.md.
              </p>
              <Link to="/vote">
                View participant experience <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function ChartMark() {
  return (
    <div className="chart-mark">
      {[38, 70, 105, 65, 40].map((h, i) => (
        <i key={i} style={{ height: h }} />
      ))}
    </div>
  );
}
