import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Trophy, ArrowLeft } from "lucide-react";
import { Modal, Empty } from "./UI";
export function ResultsChart({ teams, presentation = false, onSelect }) {
  return (
    <div className="results-chart">
      <ResponsiveContainer
        width="100%"
        height={Math.max(
          presentation ? 250 : 220,
          teams.length * (presentation ? 46 : 53),
        )}
      >
        <BarChart
          data={teams.map((t) => ({
            ...t,
            chartName: presentation ? `${t.rank}. ${t.name}` : t.name,
            chartLabel: `${t.votes} (${t.percentage?.toFixed(1) || "0.0"}%)`,
          }))}
          layout="vertical"
          margin={{ left: 0, right: presentation ? 115 : 24 }}
        >
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="chartName"
            width={presentation ? 135 : 110}
            tick={{ fill: "#c6cfdf", fontSize: presentation ? 15 : 13 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#ffffff06" }}
            contentStyle={{
              background: "#172338",
              border: "1px solid #30405a",
              borderRadius: 8,
              color: "#fff",
            }}
          />
          <Bar
            dataKey="votes"
            name="Votes"
            radius={[0, 5, 5, 0]}
            maxBarSize={25}
            onClick={(entry) => onSelect?.(entry.payload)}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            {teams.map((t) => (
              <Cell key={t.id} fill={t.color} />
            ))}
            {presentation && (
              <LabelList
                dataKey="chartLabel"
                position="right"
                fill="#e9eef8"
                fontSize={14}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ResultsView({ teams, view = "all", presentation = false }) {
  const [selected, setSelected] = useState(null);
  const shown = view === "top" ? teams.filter((t) => t.rank <= 3) : teams;
  if (!teams.length)
    return (
      <Empty title="Your results will appear here">
        Add teams to this session to get started.
      </Empty>
    );
  return (
    <>
      {view === "all" ? (
        <ResultsChart
          teams={teams}
          presentation={presentation}
          onSelect={presentation ? setSelected : undefined}
        />
      ) : (
        <div className="podium">
          {shown.map((t) => (
            <button
              className={`podium-team place-${t.rank}`}
              key={t.id}
              onClick={() => setSelected(t)}
            >
              <span className="podium-medal">
                <Trophy style={{ color: t.color }} size={32} />
              </span>
              <b>{t.name}</b>
              <small>
                {t.votes} votes · {t.percentage.toFixed(1)}%
              </small>
              <div style={{ borderColor: t.color }}>#{t.rank}</div>
            </button>
          ))}
        </div>
      )}
      {(!presentation || view === "top") && (
        <div className="rankings">
          {shown.map((t) => (
            <button
              className="ranking-row"
              key={t.id}
              onClick={() => setSelected(t)}
            >
              <span className="rank">{String(t.rank).padStart(2, "0")}</span>
              <span className="team-dot" style={{ background: t.color }} />
              <b>{t.name}</b>
              <span className="progress">
                <i style={{ width: `${t.percentage}%`, background: t.color }} />
              </span>
              <strong>{t.votes}</strong>
              <span className="muted percent">{t.percentage.toFixed(1)}%</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="team-detail">
            <span
              className="large-dot"
              style={{ background: selected.color }}
            />
            <strong>{selected.votes}</strong>
            <p>
              {selected.percentage.toFixed(1)}% of votes · Rank #{selected.rank}
            </p>
            <ResultsChart teams={[selected]} />
          </div>
        </Modal>
      )}
    </>
  );
}
export function WinnerPresentation({ teams, onClose, sessionName }) {
  const winners = teams.filter((t) => t.rank === 1 && t.votes > 0);
  return (
    <div
      className="winner-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Winner announcement"
    >
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 45 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 9) * 0.22}s`,
              background:
                teams[i % Math.max(1, teams.length)]?.color || "#c3f56b",
            }}
          />
        ))}
      </div>
      <p>{sessionName}</p>
      <Trophy className="winner-trophy" size={100} />
      <h2>
        {winners.length > 1 ? "A shared victory." : "A moment to celebrate."}
      </h2>
      <h1>{winners.map((t) => t.name).join(" & ") || "No votes recorded"}</h1>
      <p>
        {winners.length
          ? `${winners[0].votes} votes ${winners.length > 1 ? "each" : ""} · First place`
          : "A winner cannot be selected without votes."}
      </p>
      <button className="secondary" onClick={onClose}>
        <ArrowLeft size={18} />
        Back to results
      </button>
    </div>
  );
}
