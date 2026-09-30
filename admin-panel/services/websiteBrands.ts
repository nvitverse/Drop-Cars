import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WebsiteBrandConfig {
  id: string;
  name: string;
  domain: string;
  phone?: string;
  gst_number?: string;
  primary_color?: string;
  base_rate_per_km?: number;
  driver_bata_per_day?: number;
  is_active: boolean;
}

const STORAGE_KEY = '@dropcars_website_brands_v1';

export const DEFAULT_BRANDS: WebsiteBrandConfig[] = [
  { id: 'all', name: 'All Brands', domain: 'all', is_active: true },
  { id: 'dropcars', name: 'Drop Cars', domain: 'dropcars.in', phone: '9043990439', primary_color: '#0EA5E9', is_active: true },
  { id: '24droptaxi', name: '24 Drop Taxi', domain: '24drop-taxi.in', phone: '9043990439', primary_color: '#3B82F6', is_active: true },
  { id: 'tatataxi', name: 'Tata Taxi', domain: 'tatataxi.in', primary_color: '#F59E0B', is_active: true },
  { id: 'tatacalltaxi', name: 'Tata Call Taxi', domain: 'tatacalltaxi.in', primary_color: '#10B981', is_active: true },
  { id: 'yellowboard', name: 'Yellow Board', domain: 'yellowboard.in', primary_color: '#EAB308', is_active: true },
  { id: 'arunachala', name: 'Arunachala Travels', domain: 'arunachalatravels.in', primary_color: '#8B5CF6', is_active: true },
  { id: 'mukiltravels', name: 'Mukil Travels', domain: 'mukiltravels.in', primary_color: '#EC4899', is_active: true },
];

class WebsiteBrandService {
  private brands: WebsiteBrandConfig[] = DEFAULT_BRANDS;

  async loadBrands(): Promise<WebsiteBrandConfig[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.brands = parsed;
        }
      }
    } catch (e) {
      // Use defaults on storage error
    }
    return this.brands;
  }

  getBrandsSync(): WebsiteBrandConfig[] {
    return this.brands;
  }

  async addBrand(brand: Omit<WebsiteBrandConfig, 'id'>): Promise<WebsiteBrandConfig[]> {
    const id = brand.domain.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const newBrand: WebsiteBrandConfig = { ...brand, id, is_active: true };
    this.brands = [...this.brands, newBrand];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.brands));
    return this.brands;
  }

  async removeBrand(id: string): Promise<WebsiteBrandConfig[]> {
    if (id === 'all' || id === 'dropcars') return this.brands;
    this.brands = this.brands.filter((b) => b.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.brands));
    return this.brands;
  }

  getBrandByDomain(domain?: string | null): WebsiteBrandConfig {
    if (!domain || domain === 'all') return this.brands[0];
    return this.brands.find((b) => b.domain.toLowerCase() === domain.toLowerCase()) || {
      id: domain,
      name: domain,
      domain: domain,
      is_active: true,
    };
  }
}

export const websiteBrandService = new WebsiteBrandService();
