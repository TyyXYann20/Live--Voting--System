import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  ChartNoAxesColumnIncreasing,
  Users,
  Trophy,
  Monitor,
  EyeOff,
  Eye,
  Pause,
  Play,
  Square,
  Maximize,
  Minimize,
  ArrowLeft,
} from "lucide-react";
import { select, rpc } from "../services/supabase";
import { useLiveData } from "../hooks/useLiveData";
import { useAuth } from "../hooks/useAuth";
import {
  Brand,
  Status,
  Loading,
  Empty,
  ErrorBox,
  Stat,
  useToast,
} from "../components/UI";
import QRCodePanel from "../components/QRCodePanel";
import ThemeToggle from "../components/ThemeToggle";
import { ResultsView, WinnerPresentation } from "../components/ResultViews";
import { rankTeams } from "../utils/results";
export default function LiveResultsPage({ projector = false }) {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const id = params.sessionId || search.get("session");
  const [view, setView] = useState("all");
  const [winner, setWinner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  const auth = useAuth();
  const toast = useToast();
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const { data, loading, error, refresh, connection, updated } =
    useLiveData(async () => {
      const sessions = await select("voting_sessions", (q) =>
        q.order("created_at", { ascending: false }),
      );
      const session =
        sessions.find((s) => s.id === id) ||
        (!id ? sessions.find((s) => !s.archived_at) : null);
      return {
        sessions,
        session,
        results: session
          ? await rpc("get_results", { p_session: session.id })
          : null,
      };
    }, [id, auth.admin]);
  if (loading) return <Loading />;
  const session = data?.session;
  const hidden =
    data?.results?.hidden || (projector && !session?.results_visible);
  const teams = hidden ? [] : rankTeams(data?.results?.teams || []);
  const total = teams.reduce((a, t) => a + Number(t.votes), 0);
  async function action(name) {
    if (
      name === "stop" &&
      !window.confirm(
        "Stop voting? This permanently closes the session, saves final results, and hides them until you reveal.",
      )
    )
      return;
    setBusy(true);
    try {
      await rpc("session_action", { p_session: session.id, p_action: name });
      await refresh();
      toast(
        name === "stop"
          ? "Voting stopped. Results are hidden."
          : "Session updated",
      );
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const canReveal =
    auth.admin && session && !session.archived_at && session.status !== "DRAFT";
  const revealOnFullscreen = canReveal && hidden;
  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        toast("Could not exit fullscreen. Press Escape to exit.", true);
      }
      return;
    }
    // Browser fullscreen requires the original click's user activation. Start it
    // before awaiting the authorized reveal RPC, which still enforces permissions.
    setView("all");
    window.scrollTo({ top: 0, behavior: "instant" });
    let entering;
    try {
      entering = document.documentElement.requestFullscreen
        ? document.documentElement.requestFullscreen().then(
            () => true,
            () => false,
          )
        : Promise.resolve(false);
    } catch {
      entering = Promise.resolve(false);
    }
    if (revealOnFullscreen) await action("show");
    if (!(await entering))
      toast(
        "Fullscreen is unavailable in this browser. You can still use projector mode.",
        true,
      );
  }
  return (
    <div className={projector ? "projector" : ""}>
      {projector && (
        <header className="projector-header">
          <Brand />
          {auth.admin && (
            <Link to={`/admin/results?session=${id}`}>
              <ArrowLeft size={16} /> Workspace
            </Link>
          )}
          <ThemeToggle />
          {canReveal && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => action(session.results_visible ? "hide" : "show")}
            >
              {session.results_visible ? (
                <EyeOff size={17} />
              ) : (
                <Eye size={17} />
              )}
              {session.results_visible
                ? "Hide results"
                : session.status === "STOPPED"
                  ? "Reveal results"
                  : "Show results"}
            </button>
          )}
          <button
            className="secondary"
            disabled={busy || auth.loading}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            {fullscreen
              ? "Exit full screen"
              : revealOnFullscreen
                ? session.status === "STOPPED"
                  ? "Reveal results & full screen"
                  : "Show results & full screen"
                : "Full screen"}
          </button>
        </header>
      )}
      <div className="page-heading">
        <div>
          <h1>{projector ? session?.name || "Live voting" : "Live results"}</h1>
          <p>A shared moment. Every vote counts.</p>
        </div>
        <div className="heading-actions">
          {!projector && (
            <select
              aria-label="Select session"
              value={session?.id || ""}
              onChange={(e) => setSearch({ session: e.target.value })}
            >
              <option value="" disabled>
                Select a session
              </option>
              {data?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {session && <Status status={session.status} />}{" "}
          {!projector && session && (
            <Link
              className="secondary"
              to={`/projector/${session.id}`}
              target="_blank"
            >
              <Monitor size={17} />
              Projector mode
            </Link>
          )}
        </div>
      </div>
      <ErrorBox message={error} />
      {!session ? (
        <Empty title="No session selected">
          Create a session in your workspace to bring your event to life.
        </Empty>
      ) : (
        <>
          <div className="live-meta">
            <span
              className={`connection ${connection === "Live" ? "connected" : ""}`}
            >
              <i />
              {connection}
            </span>
            <span>Last updated {updated?.toLocaleTimeString()}</span>
            {!projector && (
              <span>
                Public results: {session.results_visible ? "visible" : "hidden"}
              </span>
            )}
          </div>
          {!hidden && (
            <div className="stats-grid three">
              <Stat
                icon={ChartNoAxesColumnIncreasing}
                label="Total votes"
                value={total.toLocaleString()}
              />
              <Stat icon={Users} label="Competing teams" value={teams.length} />
              <Stat
                icon={Trophy}
                label="Leading team"
                value={
                  total
                    ? teams
                        .filter((t) => t.rank === 1)
                        .map((t) => t.name)
                        .join(" / ")
                    : "Awaiting votes"
                }
                detail={
                  total
                    ? `${teams[0].votes} votes · ${teams[0].percentage.toFixed(1)}%`
                    : undefined
                }
              />
            </div>
          )}
          <div className={`results-layout ${hidden ? "hidden-results" : ""}`}>
            <section className="panel results-panel">
              {hidden ? (
                <div className="hidden-message">
                  <EyeOff size={48} />
                  <h2>The big reveal is coming.</h2>
                  <p>Scan the QR code and make your voice count.</p>
                  {projector && auth.admin && (
                    <p className="hidden-admin-help">
                      Use Show results or the full-screen control above to
                      display every team’s live chart.
                    </p>
                  )}
                  <Status status={session.status} />
                </div>
              ) : (
                <>
                  <div className="section-heading spread">
                    <div>
                      <h2>Team votes and ranking</h2>
                      <p>
                        {session.status === "STOPPED"
                          ? "Final results · saved snapshot"
                          : "The room is voting. Watch it unfold."}
                      </p>
                    </div>
                    <div className="tabs">
                      <button
                        className={view === "all" ? "active" : ""}
                        onClick={() => setView("all")}
                      >
                        All results
                      </button>
                      <button
                        className={view === "top" ? "active" : ""}
                        onClick={() => setView("top")}
                      >
                        Top 3
                      </button>
                    </div>
                  </div>
                  <ResultsView
                    teams={teams}
                    view={view}
                    presentation={projector}
                  />
                  {!total && (
                    <p className="chart-note">
                      Waiting for the first vote. Teams with equal votes share
                      the same rank.
                    </p>
                  )}
                </>
              )}
            </section>
            <QRCodePanel session={session} />
          </div>
          {auth.admin && !projector && !session.archived_at && (
            <section className="panel session-controls">
              <div>
                <h2>Session controls</h2>
                <p>Changes apply immediately to all participants.</p>
              </div>
              <div className="control-buttons">
                {session.status === "DRAFT" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => action("start")}
                  >
                    <Play size={17} />
                    Start voting
                  </button>
                )}
                {session.status === "LIVE" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => action("pause")}
                  >
                    <Pause size={17} />
                    Pause voting
                  </button>
                )}
                {session.status === "PAUSED" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => action("resume")}
                  >
                    <Play size={17} />
                    Resume voting
                  </button>
                )}
                {["LIVE", "PAUSED"].includes(session.status) && (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => action("stop")}
                  >
                    <Square size={15} />
                    Stop voting
                  </button>
                )}
                {session.status !== "DRAFT" && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      action(session.results_visible ? "hide" : "show")
                    }
                  >
                    {session.results_visible ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}{" "}
                    {session.results_visible
                      ? "Hide results"
                      : session.status === "STOPPED"
                        ? "Reveal results"
                        : "Show results"}
                  </button>
                )}
                {session.status === "STOPPED" &&
                  session.results_visible &&
                  total > 0 && (
                    <button className="primary" onClick={() => setWinner(true)}>
                      <Trophy size={17} />
                      Announce winner
                    </button>
                  )}
              </div>
            </section>
          )}
        </>
      )}
      {winner && (
        <WinnerPresentation
          teams={teams}
          sessionName={session.name}
          onClose={() => setWinner(false)}
        />
      )}
    </div>
  );
}
