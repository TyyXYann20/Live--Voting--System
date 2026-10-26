import { Link } from "react-router-dom";
import {
  CalendarDays,
  Radio,
  Users,
  UserRound,
  ChartNoAxesColumnIncreasing,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { select } from "../services/supabase";
import { useLiveData } from "../hooks/useLiveData";
import { Stat, Status, Empty, Loading, ErrorBox } from "../components/UI";
import { dateTime } from "../utils/results";
export default function DashboardPage() {
  const { data, loading, error } = useLiveData(async () => {
    const [sessions, teams, participants, votes] = await Promise.all([
      select("voting_sessions", (q) =>
        q.order("created_at", { ascending: false }),
      ),
      select("teams"),
      select("participants"),
      select("votes", (q) => q.order("created_at", { ascending: false })),
    ]);
    return { sessions, teams, participants, votes };
  }, []);
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Event overview</h1>
          <p>
            Big energy. Great teams. A moment that brings everyone together.
          </p>
        </div>
        <Link className="primary" to="/admin/sessions">
          <Plus size={18} />
          Manage sessions
        </Link>
      </div>
      <ErrorBox message={error} />
      <div className="overview-banner">
        <div>
          <span className="banner-line" />
          <h2>
            Make every voice
            <br />
            part of the moment.
          </h2>
          <p>Your event control room, all in one place.</p>
          <Link to="/admin/results">
            Open live results
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="banner-bars" aria-hidden="true">
          {[35, 65, 95, 55, 80, 45].map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="stats-grid five">
        <Stat
          icon={CalendarDays}
          label="Total sessions"
          value={data?.sessions.length || 0}
        />
        <Stat
          icon={Radio}
          label="Active sessions"
          value={data?.sessions.filter((s) => s.status === "LIVE").length || 0}
        />
        <Stat
          icon={Users}
          label="Total teams"
          value={data?.teams.length || 0}
        />
        <Stat
          icon={UserRound}
          label="Participants"
          value={data?.participants.length || 0}
        />
        <Stat
          icon={ChartNoAxesColumnIncreasing}
          label="Total votes"
          value={data?.votes.length || 0}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="section-heading spread">
            <h2>Your sessions</h2>
            <Link className="muted" to="/admin/sessions">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          {!data?.sessions.length ? (
            <Empty title="Let’s set the stage">
              Create your first voting session to get started.
            </Empty>
          ) : (
            data.sessions.slice(0, 5).map((s) => (
              <Link
                className="list-row"
                key={s.id}
                to={`/admin/results?session=${s.id}`}
              >
                <div>
                  <b>{s.name}</b>
                  <small>{dateTime(s.created_at)}</small>
                </div>
                <Status status={s.status} />
              </Link>
            ))
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Recent voting activity</h2>
          </div>
          {!data?.votes.length ? (
            <Empty title="The room is quiet. For now.">
              Recent votes will appear as your participants join in.
            </Empty>
          ) : (
            data.votes.slice(0, 8).map((v) => (
              <div className="list-row" key={v.id}>
                <span className="activity-icon">
                  <ChartNoAxesColumnIncreasing size={16} />
                </span>
                <div>
                  <b>A vote was recorded</b>
                  <small>
                    {data.sessions.find((s) => s.id === v.session_id)?.name}
                  </small>
                </div>
                <small>{dateTime(v.created_at)}</small>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
