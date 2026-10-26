export function rankTeams(teams) {
  const sorted = [...teams].sort(
    (a, b) => b.votes - a.votes || a.name.localeCompare(b.name),
  );
  const total = sorted.reduce((sum, t) => sum + Number(t.votes), 0);
  return sorted.map((t, i) => ({
    ...t,
    rank:
      i && t.votes === sorted[i - 1].votes
        ? sorted.findIndex((x) => x.votes === t.votes) + 1
        : i + 1,
    percentage: total ? (Number(t.votes) / total) * 100 : 0,
  }));
}
export function votingUrl(id) {
  return `${(import.meta.env?.VITE_SITE_URL || globalThis.location?.origin || "").replace(/\/$/, "")}/vote/${id}`;
}
export const dateTime = (value) =>
  value ? new Date(value).toLocaleString() : "Not scheduled";
