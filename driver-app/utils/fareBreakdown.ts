// One place that words a booking's fare type and its breakdown, so every list card / detail shows them the same way.

const n = (v: any): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export interface FareBreakdown {
  typeLabel: string;      // "Standard (itemized) booking" | "All-Inclusive booking" | "Drop Bid booking"
  isAllInclusive: boolean;
  line: string;           // one-line breakdown, '' when there is nothing to show
}

export function fareBreakdown(b: any): FareBreakdown {
  const ft = String(b?.fare_type || '').toUpperCase();
  const isDropBid = ft === 'DROP_BID' || !!b?.is_drop_bid || !!b?.drop_bid_id;
  const isAllInclusive = ft === 'ALL_INCLUSIVE';
  const items: any[] = Array.isArray(b?.charge_items) ? b.charge_items : [];

  if (isDropBid) {
    return { typeLabel: 'Drop Bid booking', isAllInclusive: false, line: b?.estimated_price ? `Agreed bid amount ₹${n(b.estimated_price)}` : '' };
  }

  if (isAllInclusive) {
    const inc = items.filter((c) => c && c.included !== false).map((c) => c.label);
    const exc = items.filter((c) => c && c.included === false).map((c) => c.label);
    const parts: string[] = [];
    if (inc.length) parts.push(`Includes ${inc.join(', ')}`);
    if (exc.length) parts.push(`Not included: ${exc.join(', ')}`);
    return { typeLabel: 'All-Inclusive booking', isAllInclusive: true, line: parts.join(' · ') || 'One fixed amount for the whole trip' };
  }

  const perKm = n(b?.cost_per_km ?? b?.price_per_km ?? b?.fare_per_km);
  const km = n(b?.trip_distance);
  const parts: string[] = [];
  if (perKm > 0) parts.push(km > 0 ? `₹${perKm}/km × ${km} km` : `₹${perKm}/km`);
  const bata = n(b?.driver_allowance);
  if (bata > 0) parts.push(`Bata ₹${bata}`);
  const permit = n(b?.permit_charges ?? b?.permit_charge);
  if (permit > 0) parts.push(`Permit ₹${permit}`);
  const hill = n(b?.hill_charges ?? b?.hills_charge);
  if (hill > 0) parts.push(`Hill ₹${hill}`);
  const toll = n(b?.toll_charges ?? b?.toll_charge);
  if (toll > 0) parts.push(`Toll ₹${toll}`);
  return { typeLabel: 'Standard (itemized) booking', isAllInclusive: false, line: parts.join(' + ') };
}
