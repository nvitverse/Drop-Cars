// Mirror of backend/app/crud/vehicle_matching.py's vehicle ladder. The server
// is the authority (it rejects a mismatched accept/assign); this copy only
// keeps the Select Car picker from hiding cars the server would accept.
//
// Owner's rule: a vehicle may take any booking at its own level or below,
// never above:  Hatchback < Sedan < Etios < SUV < Innova < Crysta.
// Seats are an extra check (a 6-seater must not take a 7-passenger booking).
// Tempo Traveller / Urbania: no ladder, same family only.
const TYPE_INFO: Record<string, { cls: string; rank: number | null; seats: number }> = {
  HATCHBACK: { cls: 'HATCHBACK', rank: 1, seats: 4 },
  SEDAN_4_PLUS_1: { cls: 'SEDAN', rank: 2, seats: 4 },
  NEW_SEDAN_2022_MODEL: { cls: 'SEDAN', rank: 2, seats: 4 },
  ETIOS_4_PLUS_1: { cls: 'ETIOS', rank: 3, seats: 4 },
  SUV: { cls: 'SUV', rank: 4, seats: 6 },
  SUV_6_PLUS_1: { cls: 'SUV', rank: 4, seats: 6 },
  SUV_7_PLUS_1: { cls: 'SUV', rank: 4, seats: 7 },
  INNOVA: { cls: 'INNOVA', rank: 5, seats: 6 },
  INNOVA_6_PLUS_1: { cls: 'INNOVA', rank: 5, seats: 6 },
  INNOVA_7_PLUS_1: { cls: 'INNOVA', rank: 5, seats: 7 },
  INNOVA_CRYSTA: { cls: 'CRYSTA', rank: 6, seats: 6 },
  INNOVA_CRYSTA_6_PLUS_1: { cls: 'CRYSTA', rank: 6, seats: 6 },
  INNOVA_CRYSTA_7_PLUS_1: { cls: 'CRYSTA', rank: 6, seats: 7 },
  TEMPO_TRAVELLER_12: { cls: 'TEMPO_TRAVELLER', rank: null, seats: 12 },
  TEMPO_TRAVELLER_14: { cls: 'TEMPO_TRAVELLER', rank: null, seats: 14 },
  TEMPO_TRAVELLER_18: { cls: 'TEMPO_TRAVELLER', rank: null, seats: 18 },
  URBANIA_12: { cls: 'URBANIA', rank: null, seats: 12 },
  URBANIA_14: { cls: 'URBANIA', rank: null, seats: 14 },
  URBANIA_16: { cls: 'URBANIA', rank: null, seats: 16 },
};

export function getCarSeats(carType?: string | null): number {
  if (!carType) return 4;
  const key = carType.toUpperCase().trim();
  if (TYPE_INFO[key]) return TYPE_INFO[key].seats;
  if (key.includes('18')) return 18;
  if (key.includes('16')) return 16;
  if (key.includes('14')) return 14;
  if (key.includes('12')) return 12;
  if (key.includes('7') || key.includes('SEVEN')) return 7;
  if (key.includes('6') || key.includes('SIX') || key.includes('SUV') || key.includes('INNOVA') || key.includes('CRYSTA') || key.includes('ERTIGA')) return 6;
  return 4;
}

export function carTypeSatisfies(carType?: string | null, requiredType?: string | null): boolean {
  if (!requiredType) return true;
  if (!carType) return false;
  const car = TYPE_INFO[carType];
  const req = TYPE_INFO[requiredType];
  if (!car || !req) return carType === requiredType;
  if (car.rank === null || req.rank === null) {
    return car.cls === req.cls && car.seats >= req.seats;
  }
  return car.rank >= req.rank && car.seats >= req.seats;
}
