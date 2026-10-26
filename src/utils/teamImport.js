export const MAX_BATCH_TEAMS = 100;

// Bright colors on the navy UI. Further teams use evenly dispersed hues.
const PALETTE = [
  "#c3f56b",
  "#729bff",
  "#9b7bff",
  "#ffb164",
  "#fc86b7",
  "#7debd0",
  "#f4d56b",
  "#61c8f2",
  "#df91f3",
  "#f88879",
  "#a6d97a",
  "#7ea9e8",
];

function hueColor(index) {
  const hue = (index * 137.508) % 360;
  const saturation = 0.72,
    lightness = 0.68;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(
      255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
    )
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function prepareTeamBatch(text, existingTeams = []) {
  const existingNames = new Set(
    existingTeams.map((t) => t.name.trim().toLowerCase()),
  );
  const usedColors = new Set(existingTeams.map((t) => t.color.toLowerCase()));
  const seen = new Set();
  const names = [],
    invalid = [];
  let duplicates = 0,
    existingSkipped = 0,
    colorIndex = 0;
  for (const value of text.split(/[,\r\n]+/)) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    if (Array.from(name).length > 80) {
      invalid.push(name);
      continue;
    }
    if (existingNames.has(key)) {
      existingSkipped++;
      continue;
    }
    names.push(name);
  }
  const tooMany = names.length > MAX_BATCH_TEAMS;
  // Bound preview/color generation for very large pastes; never submit a truncated batch.
  const teams = names.slice(0, MAX_BATCH_TEAMS).map((name) => {
    let color;
    do {
      color =
        colorIndex < PALETTE.length
          ? PALETTE[colorIndex]
          : hueColor(colorIndex);
      colorIndex++;
    } while (usedColors.has(color));
    usedColors.add(color);
    return { name, color };
  });
  return {
    teams,
    count: names.length,
    duplicates,
    existingSkipped,
    invalid,
    tooMany,
  };
}
