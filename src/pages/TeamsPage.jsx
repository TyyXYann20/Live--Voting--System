import { useState } from "react";
import { Plus, Pencil, Trash2, LockKeyhole, Search } from "lucide-react";
import { select, rpc } from "../services/supabase";
import { useLiveData } from "../hooks/useLiveData";
import { prepareTeamBatch, MAX_BATCH_TEAMS } from "../utils/teamImport";
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
  const [mode, setMode] = useState("single");
  const [pasted, setPasted] = useState("");
  const [dialogError, setDialogError] = useState("");
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
  const locked =
    !session ||
    session.status !== "DRAFT" ||
    session.started_at ||
    session.archived_at;
  const batch = prepareTeamBatch(
    pasted,
    (data?.teams || []).filter((t) => t.session_id === session?.id),
  );
  const teams = (data?.teams || []).filter(
    (t) =>
      t.session_id === session?.id &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setDialogError("");
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
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveBatch(e) {
    e.preventDefault();
    if (!batch.teams.length || batch.tooMany || batch.invalid.length) return;
    setBusy(true);
    setDialogError("");
    try {
      const count = await rpc("create_teams_bulk", {
        p_session: session.id,
        p_teams: batch.teams,
      });
      await refresh();
      setEdit(null);
      setPasted("");
      toast(
        `${count} ${count === 1 ? "team" : "teams"} created with automatic colors`,
      );
    } catch (e) {
      setDialogError(
        e.code === "PGRST202" || /Could not find the function/.test(e.message)
          ? "Database update required. Run 202610270002_bulk_teams.sql in Supabase SQL Editor, then retry."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  function openTeam(team = {}) {
    setMode("single");
    setPasted("");
    setDialogError("");
    setEdit(team);
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
          onClick={() => openTeam()}
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
                    onClick={() => openTeam(t)}
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
          busy={busy}
        >
          {!edit.id && (
            <div
              className="tabs team-create-tabs"
              role="group"
              aria-label="Team creation method"
            >
              <button
                type="button"
                className={mode === "single" ? "active" : ""}
                aria-pressed={mode === "single"}
                disabled={busy}
                onClick={() => {
                  setMode("single");
                  setDialogError("");
                }}
              >
                Single team
              </button>
              <button
                type="button"
                className={mode === "bulk" ? "active" : ""}
                aria-pressed={mode === "bulk"}
                disabled={busy}
                onClick={() => {
                  setMode("bulk");
                  setDialogError("");
                }}
              >
                Paste teams
              </button>
            </div>
          )}
          <ErrorBox message={dialogError} />
          {mode === "bulk" && !edit.id ? (
            <form onSubmit={saveBatch}>
              <fieldset disabled={busy}>
                <Field
                  label="Team names"
                  hint={`Separate names with commas or new lines. Up to ${MAX_BATCH_TEAMS} new teams per batch.`}
                >
                  <textarea
                    value={pasted}
                    onChange={(e) => {
                      setPasted(e.target.value);
                      setDialogError("");
                    }}
                    rows={5}
                    maxLength={20000}
                    placeholder={"A1,\nA2,\nB1,\nB2"}
                    required
                    spellCheck={false}
                  />
                </Field>
                {(batch.duplicates > 0 || batch.existingSkipped > 0) && (
                  <p className="bulk-import-note" role="status">
                    {batch.duplicates > 0 &&
                      `${batch.duplicates} repeated ${batch.duplicates === 1 ? "name" : "names"} skipped. `}
                    {batch.existingSkipped > 0 &&
                      `${batch.existingSkipped} existing ${batch.existingSkipped === 1 ? "team" : "teams"} skipped.`}
                  </p>
                )}
                <ErrorBox
                  message={
                    batch.invalid.length
                      ? "Some team names exceed 80 characters. Shorten them before creating teams."
                      : batch.tooMany
                        ? `There are ${batch.count} new teams. Please paste at most ${MAX_BATCH_TEAMS} at a time.`
                        : null
                  }
                />
                {batch.teams.length > 0 ? (
                  <div className="bulk-team-preview">
                    <div className="spread">
                      <b>
                        {batch.count} new {batch.count === 1 ? "team" : "teams"}
                      </b>
                      <small>Automatic colors</small>
                    </div>
                    <ul aria-label="Team preview">
                      {batch.teams.map((t) => (
                        <li key={t.name}>
                          <span
                            className="team-dot"
                            style={{ background: t.color }}
                          />
                          <span>{t.name}</span>
                          <small>{t.color}</small>
                        </li>
                      ))}
                    </ul>
                    <p>Colors can be edited after creating your teams.</p>
                  </div>
                ) : (
                  pasted.trim() && (
                    <p className="bulk-import-note">
                      No new teams to create. Add names that are not already in
                      this session.
                    </p>
                  )
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEdit(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy ||
                      !batch.teams.length ||
                      batch.tooMany ||
                      batch.invalid.length > 0
                    }
                  >
                    {busy
                      ? "Creating…"
                      : `Create ${batch.count || ""} ${batch.count === 1 ? "team" : "teams"}`}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <form onSubmit={save}>
              <fieldset disabled={busy}>
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
              </fieldset>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
