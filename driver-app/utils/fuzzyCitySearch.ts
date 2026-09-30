// Typo-tolerant city search shared by every city picker in the driver app
// (vacant city, near-city notification filter, etc). Plain substring
// matching used to mean a typo like "vlaknni" would never find
// "Velankanni" - this adds a small bounded edit-distance fallback so
// close-enough typing still works, while exact/prefix/substring matches
// (the common case) are still ranked first and cost nothing extra.

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function fuzzyThreshold(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

/** Filters + ranks `cities` against `query`: startsWith > includes > fuzzy
 * (bounded edit distance, word-aware for multi-word city names). Returns
 * all cities unfiltered when the query is empty. */
export function fuzzyFilterCities(cities: string[], query: string): string[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return cities;

  const starts: string[] = [];
  const contains: string[] = [];
  const fuzzy: { city: string; distance: number }[] = [];
  const threshold = fuzzyThreshold(q.length);

  for (const city of cities) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) {
      starts.push(city);
      continue;
    }
    if (lower.includes(q)) {
      contains.push(city);
      continue;
    }
    if (threshold > 0) {
      const words = lower.split(/\s+/);
      let best = editDistance(q, lower);
      for (const w of words) best = Math.min(best, editDistance(q, w));
      if (best <= threshold) fuzzy.push({ city, distance: best });
    }
  }
  fuzzy.sort((a, b) => a.distance - b.distance);

  return [...starts.sort(), ...contains.sort(), ...fuzzy.map((f) => f.city)];
}
