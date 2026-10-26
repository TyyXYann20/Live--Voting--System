import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  ArrowUpRight,
  Pencil,
  Archive,
  CalendarDays,
} from "lucide-react";
import { select, rpc } from "../services/supabase";
import { useLiveData } from "../hooks/useLiveData";
import {
  Status,
  Loading,
  Empty,
  ErrorBox,
  Modal,
  Field,
  useToast,
} from "../components/UI";
import { dateTime } from "../utils/results";
export default function SessionsPage({ history = false }) {
  const { data, loading, error, refresh } = useLiveData(
    () =>
      select("voting_sessions", (q) =>
        q.order("created_at", { ascending: false }),
      ),
    [],
  );
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("ALL");
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await rpc("save_session", {
        p_id: edit.id || null,
        p_name: f.get("name"),
        p_description: f.get("description"),
        p_start: f.get("start") ? new Date(f.get("start")).toISOString() : null,
        p_end: f.get("end") ? new Date(f.get("end")).toISOString() : null,
        p_require_codes: f.get("codes") === "on",
      });
      setEdit(null);
      await refresh();
      toast("Session saved");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function archive(s) {
    if (!confirm(`Archive ${s.name}? All voting records will be preserved.`))
      return;
    try {
      await rpc("session_action", { p_session: s.id, p_action: "archive" });
      await refresh();
      toast("Session archived");
    } catch (e) {
      toast(e.message, true);
    }
  }
  const rows = (data || []).filter(
    (s) =>
      (history ? s.status === "STOPPED" : !s.archived_at) &&
      s.name.toLowerCase().includes(filter.toLowerCase()) &&
      (status === "ALL" || s.status === status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{history ? "Event history" : "Voting sessions"}</h1>
          <p>
            {history
              ? "Shared moments, preserved. Revisit every result."
              : "Set the stage for your next shared moment."}
          </p>
        </div>
        {!history && (
          <button className="primary" onClick={() => setEdit({})}>
            <Plus size={18} />
            Create session
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      <div className="toolbar">
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Search sessions…"
            aria-label="Search sessions"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["ALL", "DRAFT", "LIVE", "PAUSED", "STOPPED"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <Loading />
      ) : !rows.length ? (
        <div className="panel">
          <Empty
            title={
              history
                ? "Your story is still being written."
                : "A fresh start for your next event."
            }
          >
            {history
              ? "Completed sessions and final results will appear here."
              : "Create a session, add teams, and invite everyone to vote."}
          </Empty>
        </div>
      ) : (
        <div className="session-grid">
          {rows.map((s) => (
            <article className="panel session-card" key={s.id}>
              <div className="spread">
                <span className="session-icon">
                  <CalendarDays />
                </span>
                <Status status={s.status} />
              </div>
              <h2>{s.name}</h2>
              <p>{s.description || "No description added."}</p>
              <dl>
                <div>
                  <dt>Starts</dt>
                  <dd>{dateTime(s.start_time)}</dd>
                </div>
                <div>
                  <dt>Ends</dt>
                  <dd>{dateTime(s.end_time)}</dd>
                </div>
                <div>
                  <dt>Voting access</dt>
                  <dd>
                    {s.require_codes
                      ? "Secure participant codes"
                      : "Open registration"}
                  </dd>
                </div>
              </dl>
              <div className="card-actions">
                <Link
                  className="secondary"
                  to={`/admin/results?session=${s.id}`}
                >
                  View {history ? "results" : "session"}
                  <ArrowUpRight size={16} />
                </Link>
                {s.status === "DRAFT" && (
                  <button
                    aria-label={`Edit ${s.name}`}
                    onClick={() => setEdit(s)}
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {s.status === "STOPPED" && !s.archived_at && (
                  <button
                    aria-label={`Archive ${s.name}`}
                    onClick={() => archive(s)}
                  >
                    <Archive size={17} />
                  </button>
                )}
                {s.archived_at && <small className="muted">Archived</small>}
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit session" : "Create a session"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Session name">
              <input
                name="name"
                defaultValue={edit.name}
                required
                maxLength={120}
                placeholder="e.g. Annual Team Showcase"
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                defaultValue={edit.description}
                maxLength={2000}
                rows={3}
              />
            </Field>
            <div className="form-row">
              <Field label="Start time (optional)">
                <input
                  name="start"
                  type="datetime-local"
                  defaultValue={toLocal(edit.start_time)}
                />
              </Field>
              <Field label="End time (optional)">
                <input
                  name="end"
                  type="datetime-local"
                  defaultValue={toLocal(edit.end_time)}
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="codes"
                defaultChecked={edit.require_codes !== false}
              />
              <span>
                Require secure participant codes{" "}
                <small>
                  Recommended. Codes bind each participant to a registered team.
                </small>
              </span>
            </label>
            <p className="muted small">
              Open registration limits votes per browser identity. It cannot
              prevent someone using another browser or claiming a different
              team. Scheduled times restrict voting; start and stop remain
              manual controls.
            </p>
            <button className="primary full" disabled={busy}>
              {busy ? "Saving…" : "Save session"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function toLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
