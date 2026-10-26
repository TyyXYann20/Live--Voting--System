import { useState } from "react";
import { Plus, Pencil, Trash2, LockKeyhole, Search } from "lucide-react";
import { select, rpc } from "../services/supabase";
import { useLiveData } from "../hooks/useLiveData";
import {
  Loading,
  Empty,
  ErrorBox,
  Modal,
  Field,
  useToast,
} from "../components/UI";
export default function TeamsPage() {
  const [sessionId, setSessionId] = useState("");
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const toast = useToast();
  const { data, loading, error, refresh } = useLiveData(async () => {
    const [sessions, teams] = await Promise.all([
      select("voting_sessions", (q) =>
        q.order("created_at", { ascending: false }),
      ),
      select("teams", (q) => q.order("name")),
    ]);
    return { sessions, teams };
  }, []);
  const session =
    data?.sessions.find((s) => s.id === sessionId) ||
    data?.sessions.find((s) => !s.archived_at);
  const locked = !session || session.status !== "DRAFT" || session.started_at;
  const teams = (data?.teams || []).filter(
    (t) =>
      t.session_id === session?.id &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await rpc("save_team", {
        p_id: edit.id || null,
        p_session: session.id,
        p_name: f.get("name"),
        p_color: f.get("color"),
        p_delete: false,
      });
      await refresh();
      setEdit(null);
      toast("Team saved");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(t) {
    if (
      !confirm(
        `Delete ${t.name}? Teams with registered participants cannot be deleted.`,
      )
    )
      return;
    try {
      await rpc("save_team", {
        p_id: t.id,
        p_session: session.id,
        p_name: t.name,
        p_color: t.color,
        p_delete: true,
      });
      await refresh();
      toast("Team deleted");
    } catch (e) {
      toast(e.message, true);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your teams</h1>
          <p>Different strengths. One unforgettable event.</p>
        </div>
        <button
          className="primary"
          disabled={locked}
          onClick={() => setEdit({})}
        >
          <Plus size={18} />
          Add team
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="toolbar">
        <select
          aria-label="Select session"
          value={session?.id || ""}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="" disabled>
            Select session
          </option>
          {data?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Search teams…"
            aria-label="Search teams"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {locked && session && (
          <span className="muted inline">
            <LockKeyhole size={15} />
            Teams locked after voting begins
          </span>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : !teams.length ? (
        <div className="panel">
          <Empty title="Bring your teams together">
            Select a draft session and add at least two teams to start voting.
          </Empty>
        </div>
      ) : (
        <div className="team-grid">
          {teams.map((t) => (
            <article
              className="panel team-card"
              key={t.id}
              style={{ "--team-color": t.color }}
            >
              <span className="team-monogram">
                {t.name.slice(0, 2).toUpperCase()}
              </span>
              <h2>{t.name}</h2>
              <p className="muted">{session?.name}</p>
              <div className="spread">
                <span className="color-label">
                  <i style={{ background: t.color }} />
                  {t.color}
                </span>
                <div className="inline">
                  <button
                    aria-label={`Edit ${t.name}`}
                    disabled={locked}
                    onClick={() => setEdit(t)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`Delete ${t.name}`}
                    disabled={locked}
                    onClick={() => remove(t)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit team" : "Add a team"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <Field label="Team name">
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={edit.name}
                placeholder="e.g. Team Orion"
              />
            </Field>
            <Field label="Team color">
              <input
                name="color"
                type="color"
                defaultValue={edit.color || "#c3f56b"}
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy ? "Saving…" : "Save team"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
