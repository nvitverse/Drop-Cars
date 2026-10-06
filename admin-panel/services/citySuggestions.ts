// City suggestions and master location engine for Admin App's booking creation,
// quote estimate, and enquiry conversion.
// Multi-tier search:
//   1. Persistent local storage (AsyncStorage: dropcars_saved_locations) - instant 0-ms lookup
//   2. Comprehensive preseeded South India towns, taluks, dams, hubs & transit stations
//   3. Remote backend lookup (/cities/lookup-online/admin)
//   4. Resilient failover geocoding (OpenStreetMap / Nominatim)
//   5. Auto-persistence: Any resolved or chosen location is saved forever.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { rankPlaces } from './placeMatch';
import { apiService } from './api';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  isSaved?: boolean;
}

const STORAGE_SAVED_LOCATIONS_KEY = 'dropcars_saved_locations_v2';
const STORAGE_RECENT_SEARCHES_KEY = 'dropcars_recent_location_searches_v2';

export const MASTER_SOUTH_INDIAN_DESTINATIONS: string[] = [
  // Major Cities & Hubs - Tamil Nadu
  'Chennai, Tamil Nadu, India',
  'Coimbatore, Tamil Nadu, India',
  'Madurai, Tamil Nadu, India',
  'Tiruchirappalli (Trichy), Tamil Nadu, India',
  'Salem, Tamil Nadu, India',
  'Tirunelveli, Tamil Nadu, India',
  'Tiruppur, Tamil Nadu, India',
  'Vellore, Tamil Nadu, India',
  'Erode, Tamil Nadu, India',
  'Thoothukudi (Tuticorin), Tamil Nadu, India',
  'Dindigul, Tamil Nadu, India',
  'Thanjavur, Tamil Nadu, India',
  'Hosur, Tamil Nadu, India',
  'Nagercoil, Tamil Nadu, India',
  'Kanyakumari, Tamil Nadu, India',
  'Kanchipuram, Tamil Nadu, India',
  'Kumbakonam, Tamil Nadu, India',
  'Cuddalore, Tamil Nadu, India',
  'Karaikudi, Tamil Nadu, India',
  'Sivakasi, Tamil Nadu, India',
  'Villupuram, Tamil Nadu, India',
  'Tiruvannamalai, Tamil Nadu, India',
  'Karur, Tamil Nadu, India',
  'Namakkal, Tamil Nadu, India',
  'Nagapattinam, Tamil Nadu, India',
  'Pudukkottai, Tamil Nadu, India',
  'Ramanathapuram, Tamil Nadu, India',
  'Tenkasi, Tamil Nadu, India',
  'Virudhunagar, Tamil Nadu, India',
  'Krishnagiri, Tamil Nadu, India',
  'Dharmapuri, Tamil Nadu, India',
  'Ariyalur, Tamil Nadu, India',
  'Perambalur, Tamil Nadu, India',
  'Kallakurichi, Tamil Nadu, India',
  'Ranipet, Tamil Nadu, India',
  'Tirupattur, Tamil Nadu, India',
  'Chengalpattu, Tamil Nadu, India',
  'Tiruvallur, Tamil Nadu, India',
  'Mayiladuthurai, Tamil Nadu, India',
  'Theni, Tamil Nadu, India',
  'Sivaganga, Tamil Nadu, India',
  'Nilgiris (Ooty), Tamil Nadu, India',

  // Towns, Taluks, Dams, Pilgrimage & Tourist Spots - Tamil Nadu
  'Sathanur, Tiruvannamalai, Tamil Nadu',
  'Sathanur Dam, Tiruvannamalai, Tamil Nadu',
  'Sathyamangalam, Erode, Tamil Nadu',
  'Sathuvachari, Vellore, Tamil Nadu',
  'Sankarankovil, Tenkasi, Tamil Nadu',
  'Sattur, Virudhunagar, Tamil Nadu',
  'Sankari, Salem, Tamil Nadu',
  'Samayapuram, Trichy, Tamil Nadu',
  'Srirangam, Trichy, Tamil Nadu',
  'Sriperumbudur, Kanchipuram, Tamil Nadu',
  'Srivilliputhur, Virudhunagar, Tamil Nadu',
  'Sirkazhi, Mayiladuthurai, Tamil Nadu',
  'Siruseri, Chennai, Tamil Nadu',
  'Sholinganallur, Chennai, Tamil Nadu',
  'Sholavandan, Madurai, Tamil Nadu',
  'Singaperumal Koil, Chengalpattu, Tamil Nadu',
  'Singampunari, Sivaganga, Tamil Nadu',
  'Surandai, Tenkasi, Tamil Nadu',
  'Srivaikuntam, Thoothukudi, Tamil Nadu',
  'Sendurai, Ariyalur, Tamil Nadu',
  'Somanur, Coimbatore, Tamil Nadu',
  'Sulur, Coimbatore, Tamil Nadu',
  'Mettupalayam, Coimbatore, Tamil Nadu',
  'Pollachi, Coimbatore, Tamil Nadu',
  'Valparai, Coimbatore, Tamil Nadu',
  'Annur, Coimbatore, Tamil Nadu',
  'Karamadai, Coimbatore, Tamil Nadu',
  'Kinathukadavu, Coimbatore, Tamil Nadu',
  'Ooty (Udhagamandalam), Tamil Nadu, India',
  'Coonoor, Nilgiris, Tamil Nadu',
  'Kotagiri, Nilgiris, Tamil Nadu',
  'Gudalur, Nilgiris, Tamil Nadu',
  'Kodaikanal, Dindigul, Tamil Nadu',
  'Palani, Dindigul, Tamil Nadu',
  'Oddanchatram, Dindigul, Tamil Nadu',
  'Nilakottai, Dindigul, Tamil Nadu',
  'Vedasandur, Dindigul, Tamil Nadu',
  'Batlagundu, Dindigul, Tamil Nadu',
  'Yercaud, Salem, Tamil Nadu',
  'Mettur, Salem, Tamil Nadu',
  'Attur, Salem, Tamil Nadu',
  'Edappadi, Salem, Tamil Nadu',
  'Omalur, Salem, Tamil Nadu',
  'Vazhapadi, Salem, Tamil Nadu',
  'Gobichettipalayam, Erode, Tamil Nadu',
  'Bhavani, Erode, Tamil Nadu',
  'Perundurai, Erode, Tamil Nadu',
  'Anthiyur, Erode, Tamil Nadu',
  'Kodumudi, Erode, Tamil Nadu',
  'Ambur, Tirupattur, Tamil Nadu',
  'Vaniyambadi, Tirupattur, Tamil Nadu',
  'Jolarpettai, Tirupattur, Tamil Nadu',
  'Natrampalli, Tirupattur, Tamil Nadu',
  'Yelagiri Hills, Tirupattur, Tamil Nadu',
  'Katpadi, Vellore, Tamil Nadu',
  'Gudiyatham, Vellore, Tamil Nadu',
  'Pernampattu, Vellore, Tamil Nadu',
  'Arcot, Ranipet, Tamil Nadu',
  'Walajapet, Ranipet, Tamil Nadu',
  'Sholingur, Ranipet, Tamil Nadu',
  'Arakkonam, Ranipet, Tamil Nadu',
  'Nemili, Ranipet, Tamil Nadu',
  'Tindivanam, Villupuram, Tamil Nadu',
  'Gingee (Senji), Villupuram, Tamil Nadu',
  'Vikravandi, Villupuram, Tamil Nadu',
  'Valavanur, Villupuram, Tamil Nadu',
  'Marakkanam, Villupuram, Tamil Nadu',
  'Kallakurichi, Tamil Nadu, India',
  'Sankarapuram, Kallakurichi, Tamil Nadu',
  'Chinnasalem, Kallakurichi, Tamil Nadu',
  'Thiagadurgam, Kallakurichi, Tamil Nadu',
  'Ulundurpettai, Kallakurichi, Tamil Nadu',
  'Tirukoilur, Kallakurichi, Tamil Nadu',
  'Kalvarayan Hills, Kallakurichi, Tamil Nadu',
  'Chengam, Tiruvannamalai, Tamil Nadu',
  'Polur, Tiruvannamalai, Tamil Nadu',
  'Arani, Tiruvannamalai, Tamil Nadu',
  'Vandavasi, Tiruvannamalai, Tamil Nadu',
  'Cheyyar, Tiruvannamalai, Tamil Nadu',
  'Kalasapakkam, Tiruvannamalai, Tamil Nadu',
  'Kilpennathur, Tiruvannamalai, Tamil Nadu',
  'Jawadhu Hills (Jamunamarathur), Tiruvannamalai, Tamil Nadu',
  'Naidumangalam, Tiruvannamalai, Tamil Nadu',
  'Chidambaram, Cuddalore, Tamil Nadu',
  'Virudhachalam, Cuddalore, Tamil Nadu',
  'Panruti, Cuddalore, Tamil Nadu',
  'Neyveli, Cuddalore, Tamil Nadu',
  'Nellikuppam, Cuddalore, Tamil Nadu',
  'Parangipettai (Porto Novo), Cuddalore, Tamil Nadu',
  'Bhuvanagiri, Cuddalore, Tamil Nadu',
  'Kattumannarkoil, Cuddalore, Tamil Nadu',
  'Vadalur, Cuddalore, Tamil Nadu',
  'Kurinjipadi, Cuddalore, Tamil Nadu',
  'Tittakudi, Cuddalore, Tamil Nadu',
  'Veppur, Cuddalore, Tamil Nadu',
  'Harur, Dharmapuri, Tamil Nadu',
  'Palacode, Dharmapuri, Tamil Nadu',
  'Pennagaram, Dharmapuri, Tamil Nadu',
  'Karimangalam, Dharmapuri, Tamil Nadu',
  'Pappireddipatti, Dharmapuri, Tamil Nadu',
  'Hogenakkal, Dharmapuri, Tamil Nadu',
  'Pochampalli, Krishnagiri, Tamil Nadu',
  'Uthangarai, Krishnagiri, Tamil Nadu',
  'Bargur, Krishnagiri, Tamil Nadu',
  'Denkanikottai, Krishnagiri, Tamil Nadu',
  'Rayakottai, Krishnagiri, Tamil Nadu',
  'Thally, Krishnagiri, Tamil Nadu',
  'Tiruchengode, Namakkal, Tamil Nadu',
  'Rasipuram, Namakkal, Tamil Nadu',
  'Paramathi Velur, Namakkal, Tamil Nadu',
  'Kolli Hills (Semmedu), Namakkal, Tamil Nadu',
  'Kumarapalayam, Namakkal, Tamil Nadu',
  'Sendamangalam, Namakkal, Tamil Nadu',
  'Mohanur, Namakkal, Tamil Nadu',
  'Udumalaipettai, Tiruppur, Tamil Nadu',
  'Dharapuram, Tiruppur, Tamil Nadu',
  'Kangeyam, Tiruppur, Tamil Nadu',
  'Avinashi, Tiruppur, Tamil Nadu',
  'Palladam, Tiruppur, Tamil Nadu',
  'Madathukulam, Tiruppur, Tamil Nadu',
  'Vellakoil, Tiruppur, Tamil Nadu',
  'Kulithalai, Karur, Tamil Nadu',
  'Aravakurichi, Karur, Tamil Nadu',
  'Pugalur, Karur, Tamil Nadu',
  'Krishnarayapuram, Karur, Tamil Nadu',
  'Jayankondam, Ariyalur, Tamil Nadu',
  'Udayarpalayam, Ariyalur, Tamil Nadu',
  'Andimadam, Ariyalur, Tamil Nadu',
  'Gangaikonda Cholapuram, Ariyalur, Tamil Nadu',
  'Kunnam, Perambalur, Tamil Nadu',
  'Veppanthattai, Perambalur, Tamil Nadu',
  'Alathur, Perambalur, Tamil Nadu',
  'Thuraiyur, Trichy, Tamil Nadu',
  'Manapparai, Trichy, Tamil Nadu',
  'Musiri, Trichy, Tamil Nadu',
  'Lalgudi, Trichy, Tamil Nadu',
  'Manachanallur, Trichy, Tamil Nadu',
  'Thuvakudi, Trichy, Tamil Nadu',
  'Thottiyam, Trichy, Tamil Nadu',
  'Pattukkottai, Thanjavur, Tamil Nadu',
  'Papanasam, Thanjavur, Tamil Nadu',
  'Thiruvaiyaru, Thanjavur, Tamil Nadu',
  'Orathanadu, Thanjavur, Tamil Nadu',
  'Peravurani, Thanjavur, Tamil Nadu',
  'Swamimalai, Thanjavur, Tamil Nadu',
  'Thiruvidaimarudur, Thanjavur, Tamil Nadu',
  'Thiruppanandal, Thanjavur, Tamil Nadu',
  'Vallam, Thanjavur, Tamil Nadu',
  'Budalur, Thanjavur, Tamil Nadu',
  'Velankanni, Nagapattinam, Tamil Nadu',
  'Vedaranyam, Nagapattinam, Tamil Nadu',
  'Kilvelur, Nagapattinam, Tamil Nadu',
  'Thirukkuvalai, Nagapattinam, Tamil Nadu',
  'Tharangambadi (Tranquebar), Mayiladuthurai, Tamil Nadu',
  'Kuthalam, Mayiladuthurai, Tamil Nadu',
  'Manalmedu, Mayiladuthurai, Tamil Nadu',
  'Poompuhar, Mayiladuthurai, Tamil Nadu',
  'Vaitheeswaran Koil, Mayiladuthurai, Tamil Nadu',
  'Thiruthuraipoondi, Thiruvarur, Tamil Nadu',
  'Mannargudi, Thiruvarur, Tamil Nadu',
  'Needamangalam, Thiruvarur, Tamil Nadu',
  'Valangaiman, Thiruvarur, Tamil Nadu',
  'Kodavasal, Thiruvarur, Tamil Nadu',
  'Kottur, Thiruvarur, Tamil Nadu',
  'Muthupet, Thiruvarur, Tamil Nadu',
  'Nannilam, Thiruvarur, Tamil Nadu',
  'Aranthangi, Pudukkottai, Tamil Nadu',
  'Alangudi, Pudukkottai, Tamil Nadu',
  'Gandarvakkottai, Pudukkottai, Tamil Nadu',
  'Illuppur, Pudukkottai, Tamil Nadu',
  'Avudayarkoil, Pudukkottai, Tamil Nadu',
  'Ponnamaravathi, Pudukkottai, Tamil Nadu',
  'Thirumayam, Pudukkottai, Tamil Nadu',
  'Viralimalai, Pudukkottai, Tamil Nadu',
  'Karambakkudi, Pudukkottai, Tamil Nadu',
  'Devakottai, Sivaganga, Tamil Nadu',
  'Manamadurai, Sivaganga, Tamil Nadu',
  'Tiruppattur, Sivaganga, Tamil Nadu',
  'Ilayangudi, Sivaganga, Tamil Nadu',
  'Kalaiyarkovil, Sivaganga, Tamil Nadu',
  'Chettinad (Kanadukathan), Sivaganga, Tamil Nadu',
  'Rameswaram, Ramanathapuram, Tamil Nadu',
  'Paramakudi, Ramanathapuram, Tamil Nadu',
  'Tiruvadanai, Ramanathapuram, Tamil Nadu',
  'Mudukulathur, Ramanathapuram, Tamil Nadu',
  'Kamuthi, Ramanathapuram, Tamil Nadu',
  'Kadaladi, Ramanathapuram, Tamil Nadu',
  'Rameswaram Island (Dhanushkodi), Ramanathapuram, Tamil Nadu',
  'Sayalgudi, Ramanathapuram, Tamil Nadu',
  'Kilakarai, Ramanathapuram, Tamil Nadu',
  'Melur, Madurai, Tamil Nadu',
  'Tirumangalam, Madurai, Tamil Nadu',
  'Usilampatti, Madurai, Tamil Nadu',
  'Vadipatti, Madurai, Tamil Nadu',
  'Peraiyur, Madurai, Tamil Nadu',
  'Alanganallur, Madurai, Tamil Nadu',
  'Sedapatti, Madurai, Tamil Nadu',
  'Kalligudi, Madurai, Tamil Nadu',
  'Rajapalayam, Virudhunagar, Tamil Nadu',
  'Aruppukkottai, Virudhunagar, Tamil Nadu',
  'Kariapatti, Virudhunagar, Tamil Nadu',
  'Tiruchuli, Virudhunagar, Tamil Nadu',
  'Watrap, Virudhunagar, Tamil Nadu',
  'Periyakulam, Theni, Tamil Nadu',
  'Bodinayakanur (Bodi), Theni, Tamil Nadu',
  'Cumbum, Theni, Tamil Nadu',
  'Uthamapalayam, Theni, Tamil Nadu',
  'Chinnamanur, Theni, Tamil Nadu',
  'Andipatti, Theni, Tamil Nadu',
  'Meghamalai, Theni, Tamil Nadu',
  'Kurangani, Theni, Tamil Nadu',
  'Ambasamudram, Tirunelveli, Tamil Nadu',
  'Cheranmahadevi, Tirunelveli, Tamil Nadu',
  'Radhapuram, Tirunelveli, Tamil Nadu',
  'Nanguneri, Tirunelveli, Tamil Nadu',
  'Tisayanvilai, Tirunelveli, Tamil Nadu',
  'Manimuthar Dam, Tirunelveli, Tamil Nadu',
  'Papanasam Dam, Tirunelveli, Tamil Nadu',
  'Kalakkad, Tirunelveli, Tamil Nadu',
  'Courtallam (Kutralam), Tenkasi, Tamil Nadu',
  'Shenkottai (Sengottai), Tenkasi, Tamil Nadu',
  'Kadayanallur, Tenkasi, Tamil Nadu',
  'Puliyankudi, Tenkasi, Tamil Nadu',
  'Alangulam, Tenkasi, Tamil Nadu',
  'Sivagiri, Tenkasi, Tamil Nadu',
  'Kovilpatti, Thoothukudi, Tamil Nadu',
  'Tiruchendur, Thoothukudi, Tamil Nadu',
  'Sathankulam, Thoothukudi, Tamil Nadu',
  'Ettayapuram, Thoothukudi, Tamil Nadu',
  'Vilathikulam, Thoothukudi, Tamil Nadu',
  'Kayathar, Thoothukudi, Tamil Nadu',
  'Padmanabhapuram, Kanyakumari, Tamil Nadu',
  'Colachel, Kanyakumari, Tamil Nadu',
  'Kuzhithurai (Marthandam), Kanyakumari, Tamil Nadu',
  'Thuckalay, Kanyakumari, Tamil Nadu',
  'Killiyoor, Kanyakumari, Tamil Nadu',
  'Thiruvattar, Kanyakumari, Tamil Nadu',
  'Suchindram, Kanyakumari, Tamil Nadu',
  'Kulasekharam, Kanyakumari, Tamil Nadu',
  'Madurantakam, Chengalpattu, Tamil Nadu',
  'Mamallapuram (Mahabalipuram), Chengalpattu, Tamil Nadu',
  'Tirukalukundram, Chengalpattu, Tamil Nadu',
  'Acharapakkam, Chengalpattu, Tamil Nadu',
  'Melmaruvathur, Chengalpattu, Tamil Nadu',
  'Tambaram, Chennai, Tamil Nadu',
  'Pallavaram, Chennai, Tamil Nadu',
  'Chromepet, Chennai, Tamil Nadu',
  'Medavakkam, Chennai, Tamil Nadu',
  'Kelambakkam, Chengalpattu, Tamil Nadu',
  'Guduvanchery, Chengalpattu, Tamil Nadu',
  'Maraimalai Nagar, Chengalpattu, Tamil Nadu',
  'Mahindra World City, Chengalpattu, Tamil Nadu',
  'Avadi, Chennai, Tamil Nadu',
  'Ambattur, Chennai, Tamil Nadu',
  'Poonamallee, Chennai, Tamil Nadu',
  'Porur, Chennai, Tamil Nadu',
  'Red Hills, Chennai, Tamil Nadu',
  'Gummidipoondi, Tiruvallur, Tamil Nadu',
  'Ponneri, Tiruvallur, Tamil Nadu',
  'Uthukottai, Tiruvallur, Tamil Nadu',
  'Tiruttani, Tiruvallur, Tamil Nadu',
  'Pallipattu, Tiruvallur, Tamil Nadu',
  'Minjur, Tiruvallur, Tamil Nadu',
  'Sriperumbudur, Kanchipuram, Tamil Nadu',
  'Kundrathur, Kanchipuram, Tamil Nadu',
  'Uthiramerur, Kanchipuram, Tamil Nadu',
  'Walajabad, Kanchipuram, Tamil Nadu',

  // Neighboring States & Major South Indian Hubs
  'Bengaluru (Bangalore), Karnataka, India',
  'Mysuru (Mysore), Karnataka, India',
  'Mangaluru (Mangalore), Karnataka, India',
  'Hubballi-Dharwad, Karnataka, India',
  'Belagavi (Belgaum), Karnataka, India',
  'Coorg (Madikeri), Karnataka, India',
  'Chikmagalur, Karnataka, India',
  'Shivamogga (Shimoga), Karnataka, India',
  'Hassan, Karnataka, India',
  'Udupi, Karnataka, India',
  'Kolar, Karnataka, India',
  'Tumakuru (Tumkur), Karnataka, India',
  'Mandya, Karnataka, India',
  'Ramanagara, Karnataka, India',
  'Channapatna, Karnataka, India',
  'Whitefield, Bengaluru, Karnataka',
  'Electronic City, Bengaluru, Karnataka',
  'Indiranagar, Bengaluru, Karnataka',
  'Koramangala, Bengaluru, Karnataka',
  'Pondicherry (Puducherry), India',
  'Auroville, Puducherry, India',
  'Karaikal, Puducherry, India',
  'Kochi (Cochin / Ernakulam), Kerala, India',
  'Thiruvananthapuram (Trivandrum), Kerala, India',
  'Kozhikode (Calicut), Kerala, India',
  'Munnar, Idukki, Kerala, India',
  'Wayanad (Kalpetta), Kerala, India',
  'Alleppey (Alappuzha), Kerala, India',
  'Kumarakom, Kottayam, Kerala, India',
  'Kollam (Quilon), Kerala, India',
  'Thrissur (Trichur), Kerala, India',
  'Palakkad, Kerala, India',
  'Malappuram, Kerala, India',
  'Kannur, Kerala, India',
  'Kasaragod, Kerala, India',
  'Kottayam, Kerala, India',
  'Pathanamthitta (Sabarimala), Kerala, India',
  'Idukki (Thekkady / Kumily), Kerala, India',
  'Guruvayur, Thrissur, Kerala',
  'Hyderabad, Telangana, India',
  'Secunderabad, Telangana, India',
  'Warangal, Telangana, India',
  'Tirupati, Andhra Pradesh, India',
  'Vijayawada, Andhra Pradesh, India',
  'Visakhapatnam (Vizag), Andhra Pradesh, India',
  'Guntur, Andhra Pradesh, India',
  'Nellore, Andhra Pradesh, India',
  'Kurnool, Andhra Pradesh, India',
  'Kadapah (YSR District), Andhra Pradesh, India',
  'Anantapur, Andhra Pradesh, India',
  'Chittoor, Andhra Pradesh, India',
  'Srikalahasti, Andhra Pradesh, India',
  'Kanipakam, Chittoor, Andhra Pradesh',
  'Puttaparthi, Sri Sathya Sai, Andhra Pradesh',

  // Airports
  'Kempegowda International Airport (BLR), Bengaluru, Karnataka',
  'Chennai International Airport (MAA), Chennai, Tamil Nadu',
  'Coimbatore International Airport (CJB), Coimbatore, Tamil Nadu',
  'Madurai Airport (IXM), Madurai, Tamil Nadu',
  'Tiruchirappalli International Airport (TRZ), Trichy, Tamil Nadu',
  'Salem Airport (SXV), Salem, Tamil Nadu',
  'Tuticorin Airport (TCR), Thoothukudi, Tamil Nadu',
  'Puducherry Airport (PNY), Puducherry',
  'Cochin International Airport (COK), Kochi, Kerala',
  'Trivandrum International Airport (TRV), Thiruvananthapuram, Kerala',
  'Calicut International Airport (CCJ), Kozhikode, Kerala',
  'Kannur International Airport (CNN), Kannur, Kerala',
  'Mysuru Airport (MYQ), Mysuru, Karnataka',
  'Mangaluru International Airport (IXE), Mangaluru, Karnataka',
  'Rajiv Gandhi International Airport (HYD), Hyderabad, Telangana',
  'Tirupati Airport (TIR), Tirupati, Andhra Pradesh',

  // Railway Stations
  'Chennai Central Railway Station (MAS), Chennai, Tamil Nadu',
  'Chennai Egmore Railway Station (MS), Chennai, Tamil Nadu',
  'Tambaram Railway Station (TBM), Chennai, Tamil Nadu',
  'Katpadi Junction Railway Station (KPD), Vellore, Tamil Nadu',
  'Villupuram Junction Railway Station (VM), Villupuram, Tamil Nadu',
  'Tiruchirappalli Junction Railway Station (TPJ), Trichy, Tamil Nadu',
  'Thanjavur Junction Railway Station (TJ), Thanjavur, Tamil Nadu',
  'Madurai Junction Railway Station (MDU), Madurai, Tamil Nadu',
  'Tirunelveli Junction Railway Station (TEN), Tirunelveli, Tamil Nadu',
  'Nagercoil Junction Railway Station (NCJ), Nagercoil, Tamil Nadu',
  'Kanyakumari Railway Station (CAPE), Kanyakumari, Tamil Nadu',
  'Coimbatore Junction Railway Station (CBE), Coimbatore, Tamil Nadu',
  'Erode Junction Railway Station (ED), Erode, Tamil Nadu',
  'Salem Junction Railway Station (SA), Salem, Tamil Nadu',
  'Tiruppur Railway Station (TUP), Tiruppur, Tamil Nadu',
  'Rameswaram Railway Station (RMM), Rameswaram, Tamil Nadu',
  'KSR Bengaluru City Junction Railway Station (SBC), Bengaluru, Karnataka',
  'Yesvantpur Junction Railway Station (YPR), Bengaluru, Karnataka',
  'Tirupati Railway Station (TPTY), Tirupati, Andhra Pradesh',

  // Major Bus Terminals
  'Chennai Mofussil Bus Terminus (CMBT), Koyambedu, Chennai',
  'Kilambakkam Bus Terminus (KCBT / Kalaignar Centenary), Chennai',
  'Madhavaram Bus Terminus, Chennai, Tamil Nadu',
  'Majestic Kempegowda Bus Station, Bengaluru, Karnataka',
  'Mattuthavani Bus Stand, Madurai, Tamil Nadu',
  'Gandhipuram Bus Stand, Coimbatore, Tamil Nadu',
  'Central Bus Stand, Tiruchirappalli, Tamil Nadu',
  'Hosur Bus Stand, Hosur, Tamil Nadu',
  'Salem Central Bus Stand, Salem, Tamil Nadu',
];

let citiesCache: string[] | null = null;
let savedLocationsCache: string[] = [];
let isSavedLoaded = false;
let inflight: Promise<string[]> | null = null;

/** Load persistent saved locations from AsyncStorage */
export async function loadSavedLocations(): Promise<string[]> {
  if (isSavedLoaded && savedLocationsCache.length > 0) {
    return savedLocationsCache;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SAVED_LOCATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        savedLocationsCache = parsed.filter(Boolean);
        isSavedLoaded = true;
        return savedLocationsCache;
      }
    }
  } catch (e) {
    console.warn('Failed to read saved locations:', e);
  }
  isSavedLoaded = true;
  savedLocationsCache = [];
  return [];
}

/** Save a chosen/resolved location into local cache & AsyncStorage permanently */
export async function saveLocationToCache(location: string): Promise<void> {
  const loc = (location || '').trim();
  if (!loc || loc.length < 2) return;

  try {
    const existing = await loadSavedLocations();
    const normalized = loc.toLowerCase();
    const filtered = existing.filter((item) => item.trim().toLowerCase() !== normalized);
    const updated = [loc, ...filtered].slice(0, 500); // keep up to 500 saved locations
    savedLocationsCache = updated;
    await AsyncStorage.setItem(STORAGE_SAVED_LOCATIONS_KEY, JSON.stringify(updated));

    // Also add to in-memory active cities cache so it matches instantly
    if (citiesCache && !citiesCache.some((c) => c.toLowerCase() === normalized)) {
      citiesCache.unshift(loc);
    }
  } catch (e) {
    console.warn('Failed to persist location:', e);
  }
}

/** Load recent searches for quick display */
export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_RECENT_SEARCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [
    'Chennai, Tamil Nadu, India',
    'Bengaluru (Bangalore), Karnataka, India',
    'Coimbatore, Tamil Nadu, India',
    'Madurai, Tamil Nadu, India',
    'Tiruchirappalli (Trichy), Tamil Nadu, India',
    'Salem, Tamil Nadu, India',
    'Tiruvannamalai, Tamil Nadu, India',
  ];
}

export async function addRecentSearch(loc: string): Promise<void> {
  const clean = (loc || '').trim();
  if (!clean) return;
  try {
    const recents = await getRecentSearches();
    const filtered = recents.filter((r) => r.toLowerCase() !== clean.toLowerCase());
    const updated = [clean, ...filtered].slice(0, 8);
    await AsyncStorage.setItem(STORAGE_RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}
}

async function loadCities(): Promise<string[]> {
  if (citiesCache) return citiesCache;
  if (inflight) return inflight;

  inflight = (async () => {
    const saved = await loadSavedLocations();
    try {
      const remoteList = await apiService.makeRequest<string[]>('/cities/public');
      const arr = Array.isArray(remoteList) ? remoteList : [];
      const merged = Array.from(new Set([...saved, ...MASTER_SOUTH_INDIAN_DESTINATIONS, ...arr]));
      citiesCache = merged;
      return merged;
    } catch {
      const merged = Array.from(new Set([...saved, ...MASTER_SOUTH_INDIAN_DESTINATIONS]));
      citiesCache = merged;
      return merged;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Format place string into main and secondary text */
function formatPlaceParts(place: string): { main_text: string; secondary_text: string } {
  const parts = place.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { main_text: place, secondary_text: '' };
  if (parts.length === 1) return { main_text: parts[0], secondary_text: 'Tamil Nadu / India' };
  return {
    main_text: parts[0],
    secondary_text: parts.slice(1).join(', '),
  };
}

/** Local, free autocomplete over the comprehensive city & saved locations list */
export async function getCitySuggestions(input: string): Promise<PlacePrediction[]> {
  const rawInput = (input || '').trim();
  const query = rawInput.toLowerCase();
  if (query.length < 1) return [];

  const [cities, saved] = await Promise.all([loadCities(), loadSavedLocations()]);
  const savedSet = new Set(saved.map((s) => s.toLowerCase()));

  // Spelling-variant, multi-word and typo tolerant ranking
  const ranked = rankPlaces(query, cities, 20);

  const list: PlacePrediction[] = ranked.map((city, idx) => {
    const parts = formatPlaceParts(city);
    const isSaved = savedSet.has(city.toLowerCase());
    return {
      place_id: `city_${idx}_${city}`,
      description: city,
      structured_formatting: parts,
      isSaved,
    };
  });

  return list;
}

/** Online Geocoding via OpenStreetMap Nominatim (Free, reliable, no key needed) */
async function searchOsmNominatim(query: string): Promise<PlacePrediction[]> {
  try {
    const cleanQ = query.trim();
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      cleanQ + ', India'
    )}&format=json&addressdetails=1&limit=6&countrycodes=in`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DropCarsAdminStaffApp/2.0 (contact@dropcars.in)',
      },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    const predictions: PlacePrediction[] = [];
    for (const item of data) {
      const addr = item.address || {};
      const name =
        addr.village ||
        addr.town ||
        addr.city ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.hamlet ||
        addr.county ||
        addr.district ||
        item.display_name.split(',')[0];
      const state = addr.state || 'India';
      const district = addr.state_district || addr.county || '';
      const secondary = [district, state].filter(Boolean).join(', ') || 'India';
      const fullDesc = `${name}, ${secondary}`;

      predictions.push({
        place_id: `osm_${item.place_id || Math.random()}`,
        description: fullDesc,
        structured_formatting: {
          main_text: name,
          secondary_text: secondary,
        },
      });
    }
    return predictions;
  } catch (e) {
    console.warn('Nominatim lookup error:', e);
    return [];
  }
}

/** Online search for when the place isn't yet in local cache */
export async function searchCityOnline(
  query: string
): Promise<{ city: string; predictions?: PlacePrediction[]; already_existed: boolean }> {
  const q = query.trim();
  if (!q) return { city: '', already_existed: false };

  // 1. Try backend online lookup
  try {
    const res = await apiService.makeRequest<{ city: string; already_existed: boolean }>(
      '/cities/lookup-online/admin',
      { method: 'POST', body: JSON.stringify({ query: q }) }
    );
    if (res?.city) {
      await saveLocationToCache(res.city);
      return res;
    }
  } catch {
    // Backend API lookup failed or offline
  }

  // 2. Try Nominatim Geocoder fallback
  const osmResults = await searchOsmNominatim(q);
  if (osmResults.length > 0) {
    const best = osmResults[0].description;
    await saveLocationToCache(best);
    return {
      city: best,
      predictions: osmResults,
      already_existed: false,
    };
  }

  // 3. Fallback to capitalized entered text
  const cleanFallback = q.charAt(0).toUpperCase() + q.slice(1);
  return { city: cleanFallback, already_existed: false };
}

let autoLookupTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule fast online lookup (~350ms debounce) when typed query has >= 3 chars */
export function scheduleAutoOnlineLookup(
  query: string,
  onFound: (predictions: PlacePrediction[]) => void,
  onFinish?: () => void,
  pauseMs = 350
): () => void {
  const q = (query || '').trim();
  if (autoLookupTimer) clearTimeout(autoLookupTimer);

  if (q.length < 3) {
    onFinish?.();
    return () => {};
  }

  autoLookupTimer = setTimeout(async () => {
    try {
      // Run Nominatim + backend in parallel
      const [backendRes, osmResults] = await Promise.allSettled([
        apiService.makeRequest<{ city: string; already_existed: boolean }>(
          '/cities/lookup-online/admin',
          { method: 'POST', body: JSON.stringify({ query: q }) }
        ),
        searchOsmNominatim(q),
      ]);

      const foundList: PlacePrediction[] = [];
      const seen = new Set<string>();

      if (backendRes.status === 'fulfilled' && backendRes.value?.city) {
        const c = backendRes.value.city;
        const parts = formatPlaceParts(c);
        foundList.push({
          place_id: `backend_${c}`,
          description: c,
          structured_formatting: parts,
        });
        seen.add(c.toLowerCase());
        saveLocationToCache(c);
      }

      if (osmResults.status === 'fulfilled' && Array.isArray(osmResults.value)) {
        for (const osm of osmResults.value) {
          if (!seen.has(osm.description.toLowerCase())) {
            foundList.push(osm);
            seen.add(osm.description.toLowerCase());
            saveLocationToCache(osm.description);
          }
        }
      }

      if (foundList.length > 0) {
        onFound(foundList);
      }
    } catch {
      // Non-blocking
    } finally {
      onFinish?.();
    }
  }, pauseMs);

  return () => {
    if (autoLookupTimer) clearTimeout(autoLookupTimer);
  };
}
