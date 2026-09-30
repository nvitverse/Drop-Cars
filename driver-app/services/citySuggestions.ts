// City suggestions served from OUR OWN platform city list instead of a
// hardcoded, Tamil-Nadu-only constant list.
//
// Ported from the Vendor App's services/citySuggestions.ts (same matching /
// geocoding / persistence logic). Why this exists: `constants/cities.ts`
// here is a static, Tamil-Nadu-only list, so a driver outside Tamil Nadu (or
// in a city not on that list) could never find/select their city. This adds
// a free, instant local fuzzy search against the platform's shared,
// admin-editable city list, then an automatic one-shot online geocoding
// fallback when a typed city genuinely isn't in the list yet - the resolved
// city is persisted so it's available to everyone (vendors and drivers)
// from then on.
//
// Adaptation from the Vendor App version: swapped the Vendor App's bare
// `api` client (baseURL already includes `/api`) for the Driver App's
// `axiosInstance` (baseURL is just the host, so paths need the `/api`
// prefix explicitly), and pointed at the fleet-owner-scoped backend routes
// (`/api/cities/public` for the read-only list, `/api/cities/lookup-online/vehicle-owner`
// for the online fallback - see backend/app/api/routes/cities.py) instead of
// the vendor-scoped ones. This app's session runs as a vehicle_owner, not a
// car_driver, so it needs the vehicle-owner-scoped lookup route specifically -
// the driver-scoped one 401s for this app's token. Matching/geocoding/
// persistence logic is unchanged.

import { rankPlaces } from './placeMatch';
import axiosInstance from '../app/api/axiosInstance';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

let citiesCache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

const PRESEEDED_HUBS = [
  'Chennai International Airport (MAA), Chennai, Tamil Nadu',
  'Kempegowda International Airport (BLR), Bengaluru, Karnataka',
  'Coimbatore International Airport (CJB), Coimbatore, Tamil Nadu',
  'Madurai Airport (IXM), Madurai, Tamil Nadu',
  'Tiruchirappalli International Airport (TRZ), Trichy, Tamil Nadu',
  'Cochin International Airport (COK), Kochi, Kerala',
  'Chennai Central Railway Station (MAS), Chennai, Tamil Nadu',
  'Chennai Egmore Railway Station (MS), Chennai, Tamil Nadu',
  'Tambaram Railway Station (TBM), Chennai, Tamil Nadu',
  'Nannilam, Tamil Nadu',
  'Neepathurai, Tamil Nadu',
  'Naidumangalam, Tamil Nadu',
  'Chengam, Tamil Nadu',
  'Sriperumbudur, Tamil Nadu',
  'Acharapakkam, Tamil Nadu',
  'Melmaruvathur, Tamil Nadu',
  'Kallakurichi, Tamil Nadu',
  'Tiruvannamalai, Tamil Nadu',
];

async function loadCities(): Promise<string[]> {
  if (citiesCache) return citiesCache;
  if (inflight) return inflight;
  inflight = axiosInstance
    .get('/api/cities/public')
    .then((res: any) => {
      const list = Array.isArray(res.data) ? res.data : [];
      const merged = Array.from(new Set([...PRESEEDED_HUBS, ...list]));
      citiesCache = merged;
      return merged;
    })
    .catch(() => {
      inflight = null;
      citiesCache = PRESEEDED_HUBS;
      return PRESEEDED_HUBS;
    });
  return inflight;
}

// Levenshtein edit distance - small, dependency-free, plenty fast for a
// few-hundred-city list searched on every keystroke.
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

// How many typos to tolerate, scaled to query length - "vlaknni" (7 chars)
// needs distance 2 to reach "velankanni".
function fuzzyThreshold(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

/** Local, free autocomplete over the platform city list - tolerant of typos
 * (e.g. "vlaknni" still finds "Velankanni") via bounded edit distance. */
export async function getCitySuggestions(input: string): Promise<PlacePrediction[]> {
  const query = (input || '').trim().toLowerCase();
  if (query.length < 1) return [];

  const cities = await loadCities();
  // Spelling-variant, multi-word and typo tolerant ranking (Bangalore = Bengaluru, "kempagowda airport" finds the airport)
  const ranked = rankPlaces(query, cities, 12);

  return ranked.slice(0, 12).map((city, idx) => ({
    place_id: `city_${idx}_${city}`,
    description: city,
    structured_formatting: {
      main_text: city.split(',')[0].trim(),
      secondary_text: city.split(',').slice(1).join(',').trim() || 'India',
    },
  }));
}

/** Online fallback for when the city genuinely isn't in the list yet - one
 * Geocoding API call. Adds the resolved city to the shared list so it's in
 * the local, free search from then on. */
export async function searchCityOnline(query: string): Promise<{ city: string; already_existed: boolean }> {
  const res = await axiosInstance.post('/api/cities/lookup-online/vehicle-owner', { query });
  // Refresh the local cache so the newly-added city shows up immediately.
  citiesCache = null;
  await loadCities();
  return res.data;
}

// --- Automatic online fallback -----------------------------------------
// Drivers expect suggestions to appear WITHOUT tapping a button, even for
// places not in the list yet. This auto-fires ONE online lookup when (a)
// local fuzzy search found nothing, (b) the query is a plausible place
// name, and (c) the user paused typing. Never per-keystroke.

const notFoundOnline = new Set<string>(); // avoid re-paying for known misses
let autoLookupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Call this when getCitySuggestions() returned nothing. Waits for the user
 * to pause, then looks the place up online, adds it to the shared list, and
 * invokes onFound so the UI can refresh its suggestions.
 * Returns a cancel function - call it when the input changes or unmounts.
 */
export function scheduleAutoOnlineLookup(
  query: string,
  onFound: (city: string) => void,
  onMiss?: () => void,
  pauseMs = 900,
): () => void {
  const q = (query || '').trim();
  if (autoLookupTimer) clearTimeout(autoLookupTimer);
  if (q.length < 4 || notFoundOnline.has(q.toLowerCase())) {
    return () => {};
  }
  autoLookupTimer = setTimeout(async () => {
    try {
      const result = await searchCityOnline(q);
      if (result?.city) onFound(result.city);
      else {
        notFoundOnline.add(q.toLowerCase());
        onMiss?.();
      }
    } catch {
      notFoundOnline.add(q.toLowerCase());
      onMiss?.();
    }
  }, pauseMs);
  return () => {
    if (autoLookupTimer) clearTimeout(autoLookupTimer);
  };
}
