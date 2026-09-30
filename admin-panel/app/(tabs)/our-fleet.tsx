import React from 'react';
import { Redirect } from 'expo-router';

// Was a screen of hardcoded demo cars/drivers that saved nothing - the real
// company-fleet screen is /own-fleet (backed by api/routes/own_fleet.py).
export default function OurFleetRedirect() {
  return <Redirect href={'/own-fleet' as any} />;
}
