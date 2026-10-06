# Google Maps Integration Setup Guide

## Overview
This guide explains how to set up Google Maps integration for the Create Orders form in the Vendor App. The integration provides:
- Location autocomplete for pickup and drop locations
- Distance calculation between locations
- Nearby cities search for driver assignment

## Prerequisites
1. Google Cloud Platform account
2. Google Maps API enabled
3. API key with the following APIs enabled:
   - Places API
   - Distance Matrix API
   - Geocoding API

## Setup Steps

### 1. Enable Google Maps APIs
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Places API
   - Distance Matrix API
   - Geocoding API
   - Maps JavaScript API

### 2. Create API Key
1. Go to "Credentials" in the Google Cloud Console
2. Click "Create Credentials" → "API Key"
3. Copy the generated API key
4. Restrict the API key to only the enabled APIs for security

### 3. Update Configuration
1. Open `services/googleMaps.ts`
2. Replace `YOUR_GOOGLE_MAPS_API_KEY` with your actual API key:
   ```typescript
   const GOOGLE_MAPS_API_KEY = 'your_actual_api_key_here';
   ```

### 4. Environment Variables (Optional)
For better security, you can use environment variables:
1. Create a `.env` file in the project root
2. Add: `GOOGLE_MAPS_API_KEY=your_api_key_here`
3. Update the service to read from environment:
   ```typescript
   const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'fallback_key';
   ```

## Usage

### Location Autocomplete
- Users can type in pickup and drop locations
- After 3+ characters, suggestions appear
- Click on a suggestion to select the location
- The form automatically calculates distance

### Distance Calculation
- Distance is calculated using Google Distance Matrix API
- Updates automatically when locations change
- Used for fare calculation

### Driver Assignment
- Choose between "ALL" or "NEAR_CITY"
- If "NEAR_CITY" is selected, specify the city
- Uses Google Places API to find nearby cities

## API Limits and Costs
- **Places API**: $17 per 1000 requests
- **Distance Matrix API**: $5 per 1000 requests
- **Geocoding API**: $5 per 1000 requests

Monitor usage in Google Cloud Console to avoid unexpected charges.

## Testing
The app includes a mock service for development:
- `MockGoogleMapsService` provides fake data
- No API calls are made during development
- Switch to real service by updating imports

## Troubleshooting

### Common Issues
1. **API Key Error**: Check if API key is correct and APIs are enabled
2. **Quota Exceeded**: Check API usage in Google Cloud Console
3. **CORS Issues**: Ensure proper domain restrictions on API key

### Debug Mode
Enable debug logging by checking console output for API responses and errors.

## Security Best Practices
1. Restrict API key to specific domains/IPs
2. Use environment variables for API keys
3. Monitor API usage regularly
4. Set up billing alerts in Google Cloud Console

## Support
For Google Maps API issues, refer to:
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Google Cloud Support](https://cloud.google.com/support)
- [Places API Reference](https://developers.google.com/maps/documentation/places/web-service)
