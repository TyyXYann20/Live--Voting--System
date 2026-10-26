import { ShieldCheck, Database, Globe, LockKeyhole } from "lucide-react";
import { configured, supabase } from "../services/supabase";
import { useAuth } from "../hooks/useAuth";
export default function SettingsPage() {
  const auth = useAuth();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace settings</h1>
          <p>The foundations of a secure, seamless event.</p>
        </div>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
      <section className="panel settings-panel">
        <h2>Connection & identity</h2>
        <div className="setting-row">
          <Database />
          <div>
            <b>Supabase connection</b>
            <p>
              {configured
                ? "Configured · database permissions are enforced by RLS and RPCs."
                : "Not configured. Add environment variables and restart Vite."}
            </p>
          </div>
          <span className="status live">
            {configured ? "CONNECTED" : "SETUP REQUIRED"}
          </span>
        </div>
        <div className="setting-row">
          <Globe />
          <div>
            <b>Public voting origin</b>
            <p>{import.meta.env.VITE_SITE_URL || window.location.origin}</p>
            <small>
              Set VITE_SITE_URL to your deployed HTTPS origin before building.
              QR codes use this URL.
            </small>
          </div>
        </div>
        <div className="setting-row">
          <ShieldCheck />
          <div>
            <b>Administrator</b>
            <p>{auth.user?.email}</p>
            <small>
              Roles can be granted or revoked only by a trusted database
              operator.
            </small>
          </div>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>Voting security</h2>
        <div className="setting-row">
          <LockKeyhole />
          <div>
            <b>Secure participant codes by default</b>
            <p>
              Each session can require codes that bind participants to their
              registered teams. Configure this before voting begins in Sessions.
            </p>
          </div>
        </div>
        <p className="muted">
          Participants cannot edit their ballots. Administrators can revoke a
          vote before a session ends to let that person vote again.
          Completed-session results are locked. Stopping saves a final snapshot
          and hides results until you manually reveal them.
        </p>
        <p className="muted">
          Anonymous sign-in CAPTCHA is{" "}
          {import.meta.env.VITE_HCAPTCHA_SITE_KEY
            ? "configured in the frontend. Ensure the matching secret is enabled in Supabase Auth."
            : "not configured. Enable hCaptcha in Supabase Auth and set VITE_HCAPTCHA_SITE_KEY before a public event."}
        </p>
      </section>
    </>
  );
}
