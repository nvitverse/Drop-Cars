// Shared, dependency-free matching used by every location field's local search (the same file lives in the Driver, Vendor
// and Admin apps). It makes the city / landmark list forgiving:
//   - spelling variants collapse to one form ("Bangalore" = "Bengaluru", "Kempagowda" = "Kempegowda", "Trichy" = "Tiruchirappalli")
//   - a multi-word query matches when EVERY word matches some word of the place ("kempagowda airport" finds
//     "Kempegowda International Airport (BLR), Bengaluru, Karnataka"; "bangalore airport" does too)
//   - each word tolerates a typo or two, and a word may be a prefix ("kempe" matches "kempegowda")

const ALIASES: [RegExp, string][] = [
  [/\b(bangalore|bangaluru|bengalore|bengaluru|banglore|blr)\b/g, 'bengaluru'],
  [/\b(kempagowda|kempegouda|kempagouda|kempegowda|kempe\s?gowda|kempa\s?gowda)\b/g, 'kempegowda'],
  [/\b(trichy|tiruchi|tiruchirapalli|tiruchirappalli|trichinopoly)\b/g, 'tiruchirappalli'],
  [/\b(tuticorin|thoothukudi|thoothukkudi)\b/g, 'thoothukudi'],
  [/\b(trivandrum|thiruvananthapuram|tvm)\b/g, 'thiruvananthapuram'],
  [/\b(cochin|kochi|ernakulam)\b/g, 'kochi'],
  [/\b(calicut|kozhikode)\b/g, 'kozhikode'],
  [/\b(madras|chennai)\b/g, 'chennai'],
  [/\b(pondicherry|puducherry|pondy)\b/g, 'puducherry'],
  [/\b(mysore|mysuru)\b/g, 'mysuru'],
  [/\b(mangalore|mangaluru)\b/g, 'mangaluru'],
  [/\b(tirupati|tirupathi)\b/g, 'tirupati'],
  [/\b(vizag|visakhapatnam|vishakhapatnam)\b/g, 'visakhapatnam'],
  [/\b(coimbatore|kovai)\b/g, 'coimbatore'],
  [/\b(kanyakumari|cape comorin)\b/g, 'kanyakumari'],
  [/\b(railway station|rly station|junction|jn)\b/g, 'station'],
  [/\b(bus stand|bus stop|busstand|bus terminus|bus terminal)\b/g, 'bus stand'],
  [/\b(intl|international)\b/g, 'international'],
];

export function normalizePlace(s: string): string {
  let t = (s || '').toLowerCase().replace(/[().,/\\-]+/g, ' ');
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function typoBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 6) return 2;
  return 3;
}

/** Lower is better; null = no match. `q` and `place` are the RAW strings. */
export function scorePlace(q: string, place: string): number | null {
  const nq = normalizePlace(q);
  const np = normalizePlace(place);
  if (!nq) return null;
  if (np.startsWith(nq)) return 0;
  if (np.includes(nq)) return 1;

  const words = np.split(' ');
  let total = 0;
  for (const tok of nq.split(' ')) {
    let best = Infinity;
    for (const w of words) {
      if (w.startsWith(tok)) { best = 0; break; }
      if (tok.length >= 3 && w.includes(tok)) { best = Math.min(best, 0.5); continue; }
      const budget = typoBudget(tok.length);
      if (budget > 0) {
        // compare against the word, and against a same-length prefix of it (a half-typed word with a typo)
        const d = Math.min(editDistance(tok, w), editDistance(tok, w.slice(0, tok.length)));
        // a typo-only match counts as WEAK (x10) - see rankPlaces
        if (d <= budget) best = Math.min(best, d * 10);
      }
    }
    if (best === Infinity) return null;
    total += best;
  }
  return 2 + total;
}

/** Rank `places` for the typed text - best first, at most `limit`.
 *  Typo-only matches are WEAK: they are returned only while the query is too short for an online lookup. Otherwise an
 *  empty result lets the picker's online lookup run - that is what finds villages / hill stations that are not in our
 *  list yet (Polur, Vedaranyam, Munnar ...) instead of showing a look-alike town ("Mannargudi") for them. */
export function rankPlaces(q: string, places: string[], limit = 12): string[] {
  const strong: { p: string; s: number }[] = [];
  const weak: { p: string; s: number }[] = [];
  for (const p of places) {
    const s = scorePlace(q, p);
    if (s === null) continue;
    (s < 10 ? strong : weak).push({ p, s });
  }
  const pool = strong.length === 0 && q.trim().length < 4 ? weak : strong;
  pool.sort((a, b) => a.s - b.s || a.p.length - b.p.length || a.p.localeCompare(b.p));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { p } of pool) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
