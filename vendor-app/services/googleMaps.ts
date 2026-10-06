// Google Maps Places API Service
// Replace YOUR_GOOGLE_MAPS_API_KEY with your actual API key

const GOOGLE_MAPS_API_KEY = 'AIzaSyC9y9fA6NIRKA1_oapnNCpgISTDloBxOnM';
const GOOGLE_PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  place_id: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  name: string;
}

export class GoogleMapsService {
  private static instance: GoogleMapsService;
  private apiKey: string;

  private constructor() {
    this.apiKey = GOOGLE_MAPS_API_KEY;
  }

  public static getInstance(): GoogleMapsService {
    if (!GoogleMapsService.instance) {
      GoogleMapsService.instance = new GoogleMapsService();
    }
    return GoogleMapsService.instance;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get place predictions for autocomplete
   */
  public async getPlacePredictions(input: string): Promise<PlacePrediction[]> {
    if (!input || input.length < 3) {
      return [];
    }

    try {
      const response = await fetch(
        `${GOOGLE_PLACES_API_BASE}/autocomplete/json?input=${encodeURIComponent(input)}&key=${this.apiKey}&components=country:in&types=(cities)`
        // `${GOOGLE_PLACES_API_BASE}/autocomplete/json?input=${encodeURIComponent(input)}&key=${this.apiKey}&components=country:in`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.predictions || [];
      } else {
        console.error('Google Places API error:', data.status, data.error_message);
        return [];
      }
    } catch (error) {
      console.error('Error fetching place predictions:', error);
      return [];
    }
  }

  /**
   * Get place details by place_id
   */
  public async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    try {
      const response = await fetch(
        `${GOOGLE_PLACES_API_BASE}/details/json?place_id=${placeId}&fields=place_id,formatted_address,geometry,name&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.result;
      } else {
        console.error('Google Places API error:', data.status, data.error_message);
        return null;
      }
    } catch (error) {
      console.error('Error fetching place details:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two locations using Distance Matrix API
   */
  public async calculateDistance(origin: string, destination: string): Promise<number | null> {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${this.apiKey}&units=metric`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
        const distance = data.rows[0].elements[0].distance;
        // Convert meters to kilometers
        return distance.value / 1000;
      } else {
        console.error('Distance Matrix API error:', data.status, data.error_message);
        return null;
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
      return null;
    }
  }

  /**
   * Get nearby cities within a radius
   */
  public async getNearbyCities(lat: number, lng: number, radius: number = 50): Promise<PlacePrediction[]> {
    try {
      const response = await fetch(
        `${GOOGLE_PLACES_API_BASE}/nearbysearch/json?location=${lat},${lng}&radius=${radius * 1000}&type=locality&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.results.map((place: any) => ({
          place_id: place.place_id,
          description: place.name + ', ' + place.vicinity,
          structured_formatting: {
            main_text: place.name,
            secondary_text: place.vicinity
          }
        }));
      } else {
        console.error('Google Places API error:', data.status, data.error_message);
        return [];
      }
    } catch (error) {
      console.error('Error fetching nearby cities:', error);
      return [];
    }
  }
}

// Export singleton instance
export const googleMapsService = GoogleMapsService.getInstance();

// Mock implementation for development/testing
export class MockGoogleMapsService {
  private mockPlaces = [
    'Chennai, Tamil Nadu, India',
  ];

  public async getPlacePredictions(input: string): Promise<PlacePrediction[]> {
    if (!input || input.length < 2) {
      return [];
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    const filtered = this.mockPlaces
      .filter(place => place.toLowerCase().includes(input.toLowerCase()))
      .map((place, idx) => ({
        place_id: `mock_${idx}`,
        description: place,
        structured_formatting: {
          main_text: place.split(',')[0],
          secondary_text: place.split(',').slice(1).join(',').trim()
        }
      }));

    return filtered.slice(0, 10); // Limit to 10 results
  }

  public async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    const mockPlace = this.mockPlaces.find((_, idx) => `mock_${idx}` === placeId);
    if (!mockPlace) return null;

    return {
      place_id: placeId,
      formatted_address: mockPlace,
      geometry: {
        location: {
          lat: 12.9716 + Math.random() * 10, // Mock coordinates
          lng: 77.5946 + Math.random() * 10
        }
      },
      name: mockPlace.split(',')[0]
    };
  }

  public async calculateDistance(origin: string, destination: string): Promise<number | null> {
    // Mock distance calculation
    const distances: { [key: string]: number } = {
      'Chennai-Bangalore': 350,
      'Chennai-Mumbai': 1400,
      'Chennai-Delhi': 2200,
      'Chennai-Hyderabad': 650,
      'Bangalore-Mumbai': 1000,
      'Bangalore-Delhi': 2000,
      'Mumbai-Delhi': 1200,
      'Mumbai-Hyderabad': 750,
      'Delhi-Hyderabad': 1200,
      'Chennai-Vellore': 150,
      'Chennai-Salem': 200,
      'Chennai-Coimbatore': 500,
      'Chennai-Madurai': 450,
      'Chennai-Trichy': 320,
      'Chennai-Polur': 180,
      'Chennai-Tiruvannamalai': 200,
      'Vellore-Polur': 30,
      'Vellore-Tiruvannamalai': 50,
      'Polur-Tiruvannamalai': 20
    };

    const key = `${origin.split(',')[0]}-${destination.split(',')[0]}`;
    const reverseKey = `${destination.split(',')[0]}-${origin.split(',')[0]}`;

    return distances[key] || distances[reverseKey] || Math.floor(Math.random() * 500) + 100;
  }

  public async getNearbyCities(lat: number, lng: number, radius: number = 50): Promise<PlacePrediction[]> {
    // Mock nearby cities
    return this.mockPlaces.slice(0, 5).map((place, idx) => ({
      place_id: `nearby_${idx}`,
      description: place,
      structured_formatting: {
        main_text: place.split(',')[0],
        secondary_text: place.split(',').slice(1).join(',').trim()
      }
    }));
  }
}

// Export mock service for development
export const mockGoogleMapsService = new MockGoogleMapsService();
