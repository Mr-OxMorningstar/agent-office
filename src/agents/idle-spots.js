// Picks where an idle agent stands: a free spot in one of its candidate areas, areas tried in random order.
// `areas` maps an area name to its spots ({ occupant } is null when free); returns the spot or null if all are taken.
export function pickIdleSpot(areas, names, random = Math.random) {
  const order = [...names];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const name of order) {
    const free = (areas[name] ?? []).filter((s) => !s.occupant);
    if (free.length) return free[Math.floor(random() * free.length)];
  }
  return null;
}
