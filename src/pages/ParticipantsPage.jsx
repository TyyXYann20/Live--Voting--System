import { useState } from "react";
import {
  Plus,
  Search,
  Copy,
  ShieldCheck,
  Trash2,
  RotateCcw,
  Info,
} from "lucide-react";
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
import { dateTime } from "../utils/results";

export default function ParticipantsPage() {
  const [sessionId, setSessionId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [add, setAdd] = useState(false);
  const [issued, setIssued] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const toast = useToast();
  const { data, loading, error, refresh } = useLiveData(async () => {
    const [sessions, teams, participants, votes] = await Promise.all([
      select("voting_sessions", (q) =>
        q.order("created_at", { ascending: false }),
      ),
      select("teams"),
      select("participants", (q) =>
        q.order("created_at", { ascending: false }),
      ),
      select("votes"),
    ]);
    return { sessions, teams, participants, votes };
  }, []);
  const session =
    data?.sessions.find((s) => s.id === sessionId) ||
    data?.sessions.find((s) => !s.archived_at);
  const teams = data?.teams.filter((t) => t.session_id === session?.id) || [];
  const votedIds = new Set(data?.votes.map((v) => v.participant_id));
  const locked =
    !session || session.status === "STOPPED" || Boolean(session.archived_at);
  const people =
    data?.participants.filter(
      (p) =>
        p.session_id === session?.id &&
        p.full_name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "voted" ? votedIds.has(p.id) : !votedIds.has(p.id))),
    ) || [];

  async function issue(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setDialogError("");
    try {
      const result = await rpc("issue_participant", {
        p_session: session.id,
        p_name: f.get("name"),
        p_team: f.get("team"),
      });
      setIssued({ ...result, name: f.get("name") });
      setAdd(false);
      await refresh();
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    setDialogError("");
    try {
      await rpc("manage_participant", {
        p_session: action.participant.session_id,
        p_participant: action.participant.id,
        p_action: action.kind,
      });
      setAction(null);
      await refresh();
      toast(
        action.kind === "revoke"
          ? "Vote revoked. This participant can vote again."
          : "Participant registration deleted.",
      );
    } catch (e) {
      setDialogError(
        e.code === "PGRST202" || /Could not find the function/.test(e.message)
          ? "Database update required. Run 202610270001_participant_management.sql in Supabase SQL Editor, then retry."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }

  function openAction(participant, kind) {
    setDialogError("");
    setAction({ participant, kind });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Participants</h1>
          <p>Register your audience. Manage their votes.</p>
        </div>
        <button
          className="primary"
          disabled={locked || !session?.require_codes || !teams.length}
          onClick={() => {
            setDialogError("");
            setAdd(true);
          }}
        >
          <Plus size={18} />
          Register participant
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="toolbar participant-toolbar">
        <select
          aria-label="Select session"
          value={session?.id || ""}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="" disabled>
            Select session
          </option>
          {data?.sessions.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Search participants…"
            aria-label="Search participants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter voting status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All participants</option>
          <option value="voted">Voted</option>
          <option value="awaiting">Awaiting vote</option>
        </select>
      </div>
      {session && (
        <div className="participant-notice">
          <Info size={17} />
          <p>
            {locked
              ? "This session is complete. Participant records and final results are locked."
              : session.require_codes
                ? "Register participants with secure codes. Revoke a submitted vote to let someone vote again. Delete registrations only after their vote is removed."
                : "Open registration: people are registered automatically when voting. Revoke a vote to let them vote again using the same browser and registered team."}
          </p>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : !people.length ? (
        <div className="panel">
          <Empty
            title={
              query || filter !== "all"
                ? "No matching participants"
                : "Your audience starts with one person"
            }
          >
            {query || filter !== "all"
              ? "Try a different name or voting status."
              : session?.require_codes
                ? "Register participants and privately share their unique voting codes."
                : "Participants will appear here when they cast a vote in open registration."}
          </Empty>
        </div>
      ) : (
        <div className="panel table-wrap participant-table">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Registered team</th>
                <th>Voting status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const voted = votedIds.has(p.id);
                return (
                  <tr key={p.id}>
                    <td data-label="Participant">
                      <b>{p.full_name}</b>
                      <small>{p.id.slice(0, 8)}</small>
                    </td>
                    <td data-label="Team">
                      <span className="participant-team">
                        <i
                          className="team-dot"
                          style={{
                            background: data.teams.find(
                              (t) => t.id === p.team_id,
                            )?.color,
                          }}
                        />
                        {data.teams.find((t) => t.id === p.team_id)?.name}
                      </span>
                    </td>
                    <td data-label="Voting status">
                      <span className={`status ${voted ? "live" : "draft"}`}>
                        {voted ? "VOTED" : "AWAITING VOTE"}
                      </span>
                    </td>
                    <td data-label="Registered">{dateTime(p.created_at)}</td>
                    <td data-label="Actions">
                      <div className="participant-actions">
                        <button
                          className="secondary"
                          aria-label={`Revoke vote for ${p.full_name}`}
                          disabled={locked || !voted}
                          title={
                            locked
                              ? "Completed session"
                              : voted
                                ? "Remove vote and allow voting again"
                                : "No submitted vote to revoke"
                          }
                          onClick={() => openAction(p, "revoke")}
                        >
                          <RotateCcw size={15} />
                          Revoke vote
                        </button>
                        <button
                          className="delete-button"
                          aria-label={`Delete ${p.full_name}`}
                          disabled={locked || voted}
                          title={
                            locked
                              ? "Completed session"
                              : voted
                                ? "Revoke the vote before deleting"
                                : "Delete unused registration"
                          }
                          onClick={() => openAction(p, "delete")}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {add && (
        <Modal
          title="Register participant"
          busy={busy}
          onClose={() => setAdd(false)}
        >
          <ErrorBox message={dialogError} />
          <form onSubmit={issue}>
            <fieldset disabled={busy}>
              <Field label="Full name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Enter participant’s full name"
                />
              </Field>
              <Field label="Registered team">
                <select name="team" required>
                  <option value="">Select team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAdd(false)}
                >
                  Cancel
                </button>
                <button className="primary" type="submit">
                  {busy ? "Generating…" : "Create secure code"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {action && (
        <Modal
          title={
            action.kind === "revoke"
              ? "Revoke this vote?"
              : "Delete registration?"
          }
          busy={busy}
          onClose={() => setAction(null)}
        >
          <div className="participant-summary">
            <span className="avatar">
              {action.participant.full_name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <b>{action.participant.full_name}</b>
              <small>
                {
                  data?.teams.find((t) => t.id === action.participant.team_id)
                    ?.name
                }{" "}
                · {session?.name}
              </small>
            </div>
          </div>
          <p className="action-description">
            {action.kind === "revoke"
              ? "Their vote will be deleted from the live count. Their registration stays, and they can submit a new vote after refreshing the voting page."
              : "This permanently deletes the unused registration and its voting code. They will need to be registered again to use a secure code."}
          </p>
          {action.kind === "revoke" && (
            <p className="muted small">
              {session?.require_codes
                ? "They can use their existing code in the same browser."
                : "They should use the same browser and select their original team."}{" "}
              An administrator audit record is kept.
            </p>
          )}
          <ErrorBox message={dialogError} />
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button className="danger" disabled={busy} onClick={manage}>
              {action.kind === "revoke" ? (
                <RotateCcw size={16} />
              ) : (
                <Trash2 size={16} />
              )}{" "}
              {busy
                ? "Updating…"
                : action.kind === "revoke"
                  ? "Revoke vote"
                  : "Delete participant"}
            </button>
          </div>
        </Modal>
      )}

      {issued && (
        <Modal title="Participant code created" onClose={() => setIssued(null)}>
          <div className="code-success">
            <ShieldCheck size={36} />
            <h3>{issued.name}</h3>
            <p>
              Share this code privately. It is shown only once; only its hash is
              stored.
            </p>
            <textarea
              aria-label="New participant code"
              readOnly
              value={issued.code}
              rows={3}
            />
            <button
              className="primary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.code);
                  toast("Code copied");
                } catch {
                  toast("Select and copy the code manually.", true);
                }
              }}
            >
              <Copy size={16} />
              Copy participant code
            </button>
            <button
              className="secondary full code-done"
              onClick={() => setIssued(null)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
