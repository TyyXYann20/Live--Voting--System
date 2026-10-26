import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Send,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { useLiveData } from "../hooks/useLiveData";
import { supabase, rpc, select, configured } from "../services/supabase";
import {
  Status,
  Empty,
  Field,
  ErrorBox,
  Loading,
  Modal,
} from "../components/UI";
import Captcha from "../components/Captcha";
export default function VotePage() {
  const { sessionId } = useParams();
  return <VoteSession key={sessionId || "sessions"} sessionId={sessionId} />;
}
function VoteSession({ sessionId }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [own, setOwn] = useState("");
  const [target, setTarget] = useState("");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [captcha, setCaptcha] = useState("");
  const {
    data,
    loading,
    error: loadError,
  } = useLiveData(async () => {
    const sessions = await select("voting_sessions", (q) =>
      q.is("archived_at", null).order("created_at", { ascending: false }),
    );
    const session = sessions.find((s) => s.id === sessionId);
    const teams = session
      ? await select("teams", (q) =>
          q.eq("session_id", session.id).eq("is_active", true).order("name"),
        )
      : [];
    return { sessions, session, teams };
  }, [sessionId]);
  async function ensureIdentity() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously({
        options: { captchaToken: captcha || undefined },
      });
      if (error) throw error;
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await ensureIdentity();
      const p = await rpc("resolve_participant", {
        p_session: sessionId,
        p_code: code.trim(),
      });
      if (p.has_voted)
        throw new Error("This participant has already voted. Thank you!");
      setName(p.full_name);
      setOwn(p.team_id);
      setTarget("");
      setRegistered(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await ensureIdentity();
      const token = await rpc("submit_vote", {
        p_session: sessionId,
        p_name: name.trim(),
        p_own_team: own,
        p_voted_team: target,
        p_code: code.trim() || null,
      });
      setReceipt(token);
      setConfirm(false);
    } catch (e) {
      setError(e.message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (receipt)
    return (
      <div className="vote-card success">
        <span className="success-icon">
          <CheckCircle2 size={42} />
        </span>
        <h1>Your voice counts.</h1>
        <p>
          Your vote for <b>{data.teams.find((t) => t.id === target)?.name}</b>{" "}
          has been securely recorded.
        </p>
        <div className="receipt">
          <ShieldCheck size={18} />
          One participant. One vote.<small>Receipt: {receipt}</small>
        </div>
        <p className="muted">Thanks for being part of {data.session.name}.</p>
        <Link className="secondary" to="/vote">
          Back to sessions
        </Link>
      </div>
    );
  if (!sessionId)
    return (
      <div className="session-picker">
        <div className="vote-intro">
          <span className="public-symbol">
            <ChartIcon />
          </span>
          <h1>
            Great teams deserve
            <br />
            <span>your vote.</span>
          </h1>
          <p>
            Choose a live session. Celebrate another team.
            <br />
            Make your voice count.
          </p>
        </div>
        <div className="section-heading spread">
          <h2>Live sessions</h2>
          <span className="muted">
            {data?.sessions.filter((s) => s.status === "LIVE").length || 0}{" "}
            available
          </span>
        </div>
        <ErrorBox message={loadError} />
        {!data?.sessions.some((s) => s.status === "LIVE") ? (
          <div className="panel">
            <Empty
              title={
                configured
                  ? "The stage is almost ready."
                  : "Your next great event starts here."
              }
            >
              {configured
                ? "There are no live sessions right now. Check back when your organizer opens voting."
                : "Connect Supabase to load live sessions. Your organizer can find the setup guide in README.md."}
            </Empty>
          </div>
        ) : (
          data.sessions
            .filter((s) => s.status === "LIVE")
            .map((s) => (
              <Link
                className="session-option panel"
                key={s.id}
                to={`/vote/${s.id}`}
              >
                <span className="session-icon">
                  <CalendarDays />
                </span>
                <div>
                  <Status status={s.status} />
                  <h3>{s.name}</h3>
                  <p>
                    {s.description || "Your team. Your community. Your vote."}
                  </p>
                </div>
                <ArrowRight />
              </Link>
            ))
        )}
        <div className="privacy-line">
          <ShieldCheck size={16} />
          Secure voting. Private ballots. Shared celebration.
        </div>
      </div>
    );
  const s = data?.session;
  const closed =
    !s ||
    s.status !== "LIVE" ||
    (s.start_time && new Date(s.start_time) > new Date()) ||
    (s.end_time && new Date(s.end_time) <= new Date());
  return (
    <div className="vote-card">
      <Link className="back-link" to="/vote">
        ← All sessions
      </Link>
      <div className="vote-title">
        <Status status={s?.status} />
        <h1>{s?.name || "Session unavailable"}</h1>
        <p>{s?.description || "A little recognition goes a long way."}</p>
      </div>
      <ErrorBox message={error || loadError} />
      {closed ? (
        <Empty title="Voting is not open">
          This session may be paused, ended, scheduled for later, or
          unavailable. Please follow your organizer’s instructions.
        </Empty>
      ) : (
        <>
          <div className="step-label">
            <span>1</span>Your details
          </div>
          {s.require_codes && !registered ? (
            <>
              <Field
                label="Your participant code"
                hint="Your organizer provided this code. It securely identifies you and your team."
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your participant code"
                  autoComplete="off"
                  maxLength={64}
                />
              </Field>
              <Captcha onToken={setCaptcha} />
              <button
                className="secondary full"
                disabled={
                  busy ||
                  !code.trim() ||
                  (Boolean(import.meta.env.VITE_HCAPTCHA_SITE_KEY) && !captcha)
                }
                onClick={verify}
              >
                {busy ? "Checking…" : "Verify my code"}
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (own === target) {
                  setError("You cannot vote for your own team.");
                  return;
                }
                setConfirm(true);
              }}
            >
              <Field label="Your full name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  readOnly={s.require_codes}
                  placeholder="Enter your full name"
                  autoComplete="name"
                />
              </Field>
              <Field
                label="Your team"
                hint="You cannot vote for your own team."
              >
                <select
                  value={own}
                  onChange={(e) => {
                    setOwn(e.target.value);
                    setTarget("");
                  }}
                  required
                  disabled={s.require_codes}
                >
                  <option value="">Select your team</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="step-label">
                <span>2</span>Give another team your vote
              </div>
              <div className="team-choices">
                {data.teams
                  .filter((t) => t.id !== own)
                  .map((t) => (
                    <label
                      className={`team-choice ${target === t.id ? "selected" : ""}`}
                      key={t.id}
                    >
                      <input
                        type="radio"
                        name="team"
                        value={t.id}
                        checked={target === t.id}
                        onChange={() => setTarget(t.id)}
                        required
                        disabled={!own}
                      />
                      <span
                        className="team-dot"
                        style={{ background: t.color }}
                      />
                      <b>{t.name}</b>
                      {target === t.id && <Check size={18} />}
                    </label>
                  ))}
              </div>
              {!s.require_codes && <Captcha onToken={setCaptcha} />}
              <button
                className="primary full"
                disabled={
                  busy ||
                  !target ||
                  !own ||
                  (!s.require_codes &&
                    Boolean(import.meta.env.VITE_HCAPTCHA_SITE_KEY) &&
                    !captcha)
                }
              >
                <Send size={17} />
                Review my vote
              </button>
              <p className="vote-disclaimer">
                You cannot change your vote yourself. Contact your organizer if
                you need a reset.
              </p>
            </form>
          )}
        </>
      )}{" "}
      {confirm && (
        <Modal
          title="Make it count."
          onClose={() => !busy && setConfirm(false)}
        >
          <p>
            You’re voting for{" "}
            <b>{data.teams.find((t) => t.id === target)?.name}</b> in {s.name}.
          </p>
          <p className="muted">
            Your vote is private. After submitting, only your organizer can
            reset it.
          </p>
          <button className="primary full" disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : "Confirm my vote"}
            <Check size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function ChartIcon() {
  return (
    <div className="mini-bars">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
