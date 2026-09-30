import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Same production backend + endpoint the Admin/Vendor/Driver apps already use
// for their city pickers (`GET /cities/public`, DB-backed via
// platform_settings, admin-editable in Settings > Cities) - real data, not a
// hardcoded list, matching how the Drop Cars website's location fields work.
const getCitiesApiUrl = (): string => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8000/api/cities/public';
  }
  return 'https://drop-cars-api-207918408785.asia-south2.run.app/api/cities/public';
};

const CITIES_CACHE_KEY = 'dropcars.cityList.v1';

let memoryCache: string[] | null = null;

async function fetchAndCacheCities(): Promise<string[]> {
  try {
    const res = await axios.get<string[]>(getCitiesApiUrl(), { timeout: 8000 });
    if (Array.isArray(res.data) && res.data.length > 0) {
      memoryCache = res.data;
      AsyncStorage.setItem(CITIES_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
      return res.data;
    }
  } catch {
    // offline / backend unreachable - fall through to whatever cache we have
  }
  return memoryCache ?? [];
}

export function useCityList() {
  const [cities, setCities] = useState<string[]>(memoryCache ?? []);

  useEffect(() => {
    if (memoryCache) {
      setCities(memoryCache);
      return;
    }
    AsyncStorage.getItem(CITIES_CACHE_KEY)
      .then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw);
          memoryCache = parsed;
          setCities(parsed);
        }
      })
      .catch(() => {});
    fetchAndCacheCities().then(setCities);
  }, []);

  const search = useCallback((query: string): string[] => {
    const q = query.trim().toLowerCase();
    if (!q) return cities.slice(0, 8);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const c of cities) {
      const lc = c.toLowerCase();
      if (lc.startsWith(q)) starts.push(c);
      else if (lc.includes(q)) contains.push(c);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [cities]);

  return { cities, search };
}
