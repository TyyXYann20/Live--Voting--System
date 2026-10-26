import { useState } from "react";
import { Plus, Search, Copy, ShieldCheck } from "lucide-react";
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
  const [add, setAdd] = useState(false);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
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
  const people =
    data?.participants.filter(
      (p) =>
        p.session_id === session?.id &&
        p.full_name.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  async function issue(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
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
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Participants</h1>
          <p>A place for every voice. A secure vote for every person.</p>
        </div>
        <button
          className="primary"
          disabled={
            !session?.require_codes ||
            session?.status === "STOPPED" ||
            !teams.length
          }
          onClick={() => setAdd(true)}
        >
          <Plus size={18} />
          Register participant
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
      </div>
      {loading ? (
        <Loading />
      ) : !people.length ? (
        <div className="panel">
          <Empty title="Your audience starts with one person">
            {session?.require_codes
              ? "Register participants and privately share their unique voting codes."
              : "Participants will appear here when they cast a vote in open registration."}
          </Empty>
        </div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Registered team</th>
                <th>Voting status</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.full_name}</b>
                    <small>{p.id.slice(0, 8)}</small>
                  </td>
                  <td>{data.teams.find((t) => t.id === p.team_id)?.name}</td>
                  <td>
                    <span
                      className={`status ${data.votes.some((v) => v.participant_id === p.id) ? "live" : "draft"}`}
                    >
                      {data.votes.some((v) => v.participant_id === p.id)
                        ? "VOTED"
                        : "AWAITING VOTE"}
                    </span>
                  </td>
                  <td>{dateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {add && (
        <Modal title="Register participant" onClose={() => setAdd(false)}>
          <form onSubmit={issue}>
            <Field label="Full name">
              <input name="name" required minLength={2} maxLength={120} />
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
            <button className="primary full" disabled={busy}>
              {busy ? "Generating…" : "Create secure code"}
            </button>
          </form>
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
          </div>
        </Modal>
      )}
    </>
  );
}
