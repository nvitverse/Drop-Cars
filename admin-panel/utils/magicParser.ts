/**
 * Magic Box Smart Text Parser
 * 
 * Extracts Driver Name, Mobile Number, Car Model, and Vehicle Registration Number
 * from messy/unstructured WhatsApp, SMS, and vendor messages.
 */

export interface ParsedDriverDetails {
  driverName: string;
  driverPhone: string;
  carName: string;
  carNumber: string;
  rawConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

export function parseDriverCabMessage(text: string): ParsedDriverDetails {
  if (!text || typeof text !== 'string') {
    return { driverName: '', driverPhone: '', carName: '', carNumber: '', rawConfidence: 'NONE' };
  }

  const clean = text.trim();
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let driverPhone = '';
  let carNumber = '';
  let carName = '';
  let driverName = '';

  // 1. Extract Indian Phone Number (10 digits, optionally starting with +91, 91, or 0)
  const phoneMatch = clean.match(/(?:\+?91[\s-]?)?[6-9]\d{9}/);
  if (phoneMatch) {
    const rawDigits = phoneMatch[0].replace(/\D/g, '');
    driverPhone = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;
  }

  // 2. Extract Indian Vehicle Registration Number (e.g., TN01AB1234, TN-09-CD-5678, KA 05 XY 9999, KL 11 Z 1234, etc.)
  const vehicleRegex = /\b([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{1,4})\b/i;
  const vehicleMatch = clean.match(vehicleRegex);
  if (vehicleMatch) {
    carNumber = vehicleMatch[1].toUpperCase().replace(/\s+/g, ' ').replace(/-/g, ' ');
  }

  // 3. Extract Car Model / Vehicle Name
  const knownCarModels = [
    'Swift Dzire', 'Dzire', 'Etios', 'Innova Crysta', 'Innova', 'Crysta',
    'Ertiga', 'Xylo', 'Tavera', 'Marazzo', 'Kia Carens', 'Carens', 'Aura',
    'Tigor', 'Zest', 'Baleno', 'XUV 500', 'XUV 700', 'Scorpio', 'Bolero',
    'Sedan', 'Prime Sedan', 'SUV', 'Innova 7+1', 'Innova 6+1', 'Urbania',
    'Tempo Traveller', 'Traveller', 'WagonR', 'Celerio', 'i10', 'i20'
  ];

  for (const model of knownCarModels) {
    const modelRegex = new RegExp(`\\b${model}\\b`, 'i');
    if (modelRegex.test(clean)) {
      carName = model;
      break;
    }
  }

  // If no known model matched, check if there is a line with "Vehicle:" / "Car:" / "Cab:"
  if (!carName) {
    const carLine = lines.find(l => /^(?:car|vehicle|cab|model)\s*[:=-]/i.test(l));
    if (carLine) {
      carName = carLine.replace(/^(?:car|vehicle|cab|model)\s*[:=-]\s*/i, '')
                       .replace(vehicleRegex, '')
                       .trim();
    }
  }

  // 4. Extract Driver Name
  // Check for line with "Driver:" / "Name:" / "Pilot:" / "Chauffeur:"
  const driverLine = lines.find(l => /^(?:driver|pilot|chauffeur|name|driver\s*name)\s*[:=-]/i.test(l));
  if (driverLine) {
    driverName = driverLine.replace(/^(?:driver|pilot|chauffeur|name|driver\s*name)\s*[:=-]\s*/i, '')
                           .replace(/(?:\+?91[\s-]?)?[6-9]\d{9}/, '')
                           .replace(/[,;]/g, '')
                           .trim();
  } else {
    // Look for first line that is purely a name (not phone, not vehicle plate, not a keyword)
    for (const line of lines) {
      const stripped = line.replace(/(?:\+?91[\s-]?)?[6-9]\d{9}/g, '')
                           .replace(vehicleRegex, '')
                           .replace(/[,;:]/g, '')
                           .trim();
      
      const isKeywordLine = /^(?:drop\s*cars|booking|trip|pickup|drop|fare|route|toll|date|time)/i.test(stripped);
      const isCarNameOnly = knownCarModels.some(m => m.toLowerCase() === stripped.toLowerCase());

      if (stripped.length >= 2 && stripped.length <= 35 && !isKeywordLine && !isCarNameOnly && /^[A-Za-z\s.]+$/.test(stripped)) {
        driverName = stripped;
        break;
      }
    }
  }

  // Compute confidence
  let foundCount = 0;
  if (driverPhone) foundCount++;
  if (carNumber) foundCount++;
  if (carName) foundCount++;
  if (driverName) foundCount++;

  let rawConfidence: ParsedDriverDetails['rawConfidence'] = 'NONE';
  if (foundCount >= 3) rawConfidence = 'HIGH';
  else if (foundCount === 2) rawConfidence = 'MEDIUM';
  else if (foundCount === 1) rawConfidence = 'LOW';

  return {
    driverName,
    driverPhone,
    carName,
    carNumber,
    rawConfidence,
  };
}
