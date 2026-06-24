const axios = require('axios');

const KEY = () => process.env.GOOGLE_MAPS_API_KEY;

async function getRouteInfo(originLat, originLng, destLat, destLng) {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: {
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      key: KEY(),
    },
  });
  if (data.status !== 'OK' || !data.routes.length) {
    throw Object.assign(new Error(`Directions API: ${data.status}`), { status: 422 });
  }
  const leg = data.routes[0].legs[0];
  return {
    distanceKm: leg.distance.value / 1000,
    durationMin: leg.duration.value / 60,
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    polyline: data.routes[0].overview_polyline.points,
  };
}

async function geocode(address) {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address, key: KEY() },
  });
  if (data.status !== 'OK') throw Object.assign(new Error(`Geocode: ${data.status}`), { status: 422 });
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formatted: data.results[0].formatted_address };
}

module.exports = { getRouteInfo, geocode };
