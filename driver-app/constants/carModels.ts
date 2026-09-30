/**
 * Common car models seen on Indian roads, each mapped to the car_type
 * category the backend expects (see CarTypeEnum in
 * backend/app/models/car_details.py). Used by CarModelPicker to let a fleet
 * owner pick a car name and have its category auto-fill - still fully
 * changeable afterward via the existing Car Type dropdown.
 *
 * This bundled list is the offline/instant-first-paint fallback. The admin
 * can add or remove models from Settings > Car Models without a code change -
 * CarModelPicker fetches the live catalog from the backend and prefers it
 * over this list once loaded.
 */
export interface CarModel {
  name: string;
  type: string;
}

export async function fetchCarModelsFromServer(): Promise<CarModel[] | null> {
  try {
    const axiosInstance = (await import('@/app/api/axiosInstance')).default;
    const response = await axiosInstance.get('/api/users/cardetails/car-models/public');
    const models = response?.data?.car_models;
    if (Array.isArray(models) && models.length > 0) {
      return models.filter((m) => m && m.name && m.type);
    }
    return null;
  } catch {
    return null;
  }
}

export const CAR_MODELS: CarModel[] = [
  // Hatchbacks
  { name: 'Maruti Swift', type: 'HATCHBACK' },
  { name: 'Maruti WagonR', type: 'HATCHBACK' },
  { name: 'Maruti Alto', type: 'HATCHBACK' },
  { name: 'Maruti Alto K10', type: 'HATCHBACK' },
  { name: 'Maruti Baleno', type: 'HATCHBACK' },
  { name: 'Maruti Celerio', type: 'HATCHBACK' },
  { name: 'Maruti Ignis', type: 'HATCHBACK' },
  { name: 'Maruti S-Presso', type: 'HATCHBACK' },
  { name: 'Maruti Ritz', type: 'HATCHBACK' },
  { name: 'Toyota Glanza', type: 'HATCHBACK' },
  { name: 'Hyundai i10', type: 'HATCHBACK' },
  { name: 'Hyundai i20', type: 'HATCHBACK' },
  { name: 'Hyundai Grand i10', type: 'HATCHBACK' },
  { name: 'Hyundai Santro', type: 'HATCHBACK' },
  { name: 'Tata Tiago', type: 'HATCHBACK' },
  { name: 'Tata Punch', type: 'HATCHBACK' },
  { name: 'Tata Altroz', type: 'HATCHBACK' },
  { name: 'Renault Kwid', type: 'HATCHBACK' },
  { name: 'Volkswagen Polo', type: 'HATCHBACK' },
  { name: 'Ford Figo', type: 'HATCHBACK' },
  { name: 'Honda Jazz', type: 'HATCHBACK' },
  { name: 'Chevrolet Beat', type: 'HATCHBACK' },

  // Sedans
  { name: 'Maruti Swift Dzire', type: 'SEDAN_4_PLUS_1' },
  { name: 'Hyundai Aura', type: 'SEDAN_4_PLUS_1' },
  { name: 'Tata Zest', type: 'SEDAN_4_PLUS_1' },
  { name: 'Tata Tigor', type: 'SEDAN_4_PLUS_1' },
  { name: 'Honda Amaze', type: 'SEDAN_4_PLUS_1' },
  { name: 'Honda City', type: 'SEDAN_4_PLUS_1' },
  { name: 'Hyundai Verna', type: 'SEDAN_4_PLUS_1' },
  { name: 'Hyundai Xcent', type: 'SEDAN_4_PLUS_1' },
  { name: 'Maruti Ciaz', type: 'SEDAN_4_PLUS_1' },
  { name: 'Volkswagen Vento', type: 'SEDAN_4_PLUS_1' },
  { name: 'Skoda Rapid', type: 'SEDAN_4_PLUS_1' },

  // Etios (its own category)
  { name: 'Toyota Etios', type: 'ETIOS_4_PLUS_1' },
  { name: 'Toyota Etios Liva', type: 'ETIOS_4_PLUS_1' },

  // Prime Sedan (2026-09-29)
  { name: 'Maruti Suzuki Ciaz', type: 'NEW_SEDAN_2022_MODEL' },
  { name: 'Honda City', type: 'NEW_SEDAN_2022_MODEL' },
  { name: 'Toyota Corolla', type: 'NEW_SEDAN_2022_MODEL' },
  { name: 'Toyota Camry', type: 'NEW_SEDAN_2022_MODEL' },

  // Compact/mid SUV
  { name: 'Toyota Urban Cruiser', type: 'SUV' },
  { name: 'Hyundai Creta', type: 'SUV' },
  { name: 'Hyundai Venue', type: 'SUV' },
  { name: 'Maruti Brezza', type: 'SUV' },
  { name: 'Tata Nexon', type: 'SUV' },
  { name: 'Mahindra XUV300', type: 'SUV' },
  { name: 'Renault Duster', type: 'SUV' },
  { name: 'Ford EcoSport', type: 'SUV' },
  { name: 'Kia Sonet', type: 'SUV' },
  { name: 'Maruti S-Cross', type: 'SUV' },

  // 6-seater MPV
  { name: 'Renault Triber', type: 'SUV_6_PLUS_1' },
  { name: 'Maruti Ertiga', type: 'SUV_6_PLUS_1' },
  { name: 'Toyota Rumion', type: 'SUV_6_PLUS_1' },

  // 7-seater SUV/MPV
  { name: 'Mahindra Bolero', type: 'SUV_7_PLUS_1' },
  { name: 'Mahindra Scorpio', type: 'SUV_7_PLUS_1' },
  { name: 'Mahindra XUV500', type: 'SUV_7_PLUS_1' },
  { name: 'Mahindra XUV700', type: 'SUV_7_PLUS_1' },
  { name: 'Mahindra Xylo', type: 'SUV_7_PLUS_1' },
  { name: 'Mahindra Marazzo', type: 'SUV_7_PLUS_1' },
  { name: 'Chevrolet Tavera', type: 'SUV_7_PLUS_1' },
  { name: 'Chevrolet Enjoy', type: 'SUV_7_PLUS_1' },
  { name: 'Tata Safari', type: 'SUV_7_PLUS_1' },
  { name: 'Tata Hexa', type: 'SUV_7_PLUS_1' },
  { name: 'Toyota Fortuner', type: 'SUV_7_PLUS_1' },
  { name: 'Kia Carens', type: 'SUV_7_PLUS_1' },
  { name: 'Kia Carens Clavis', type: 'SUV_7_PLUS_1' },

  // Innova
  { name: 'Toyota Innova', type: 'INNOVA_7_PLUS_1' },

  // Innova Crysta
  { name: 'Toyota Innova Crysta', type: 'INNOVA_CRYSTA_7_PLUS_1' },
  { name: 'Toyota Innova Hycross', type: 'INNOVA_CRYSTA_7_PLUS_1' },
];
