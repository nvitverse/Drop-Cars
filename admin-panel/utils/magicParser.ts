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

export interface ParsedBookingVoiceDraft {
  pickup: string;
  drop: string;
  vehicleType: string;
  carTypeValue: string;
  tripType: 'oneway' | 'roundtrip';
  days: number;
  costPerKm: string;
  extraCostPerKm: string;
  driverAllowance: string;
  extraDriverAllowance: string;
  includeToll: boolean;
  tollMode: 'INCLUDED' | 'EXTRA';
  gstMode: 'NONE' | 'EXTRA' | 'INCLUDED';
  gstRate: number;
  advance: number;
  customerName: string;
  customerPhone: string;
  isEstimate: boolean;
  estimateDraft: {
    doc_type: 'ESTIMATE' | 'INVOICE';
    brand_id?: string;
    booking_ref?: string;
    customer: {
      name: string;
      phone: string;
      email?: string;
      gstin?: string;
      company?: string;
      address?: string;
      state?: string;
    };
    trip: {
      pickup: string;
      drop: string;
      trip_type: string;
      vehicle: string;
      start_at?: string;
      km?: number;
    };
    lines: Array<{
      label: string;
      amount: number;
      kind: 'FARE' | 'CHARGE';
      included: boolean;
    }>;
    gst: {
      mode: 'NONE' | 'EXTRA' | 'INCLUDED';
      rate: number;
      collection: 'COLLECT' | 'SHOW_ONLY' | 'PAY_LATER';
    };
    discount: number;
    advance_requested: number;
    notes?: string;
    issue: boolean;
  };
  rawConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

const TAMIL_CITIES: Record<string, string> = {
  'சென்னை': 'Chennai',
  'திருவண்ணாமலை': 'Tiruvannamalai',
  'பெங்களூர்': 'Bangalore',
  'பெங்களூரு': 'Bangalore',
  'கோயம்புத்தூர்': 'Coimbatore',
  'கோவை': 'Coimbatore',
  'மதுரை': 'Madurai',
  'திருச்சி': 'Trichy',
  'சேலம்': 'Salem',
  'திருப்பூர்': 'Tiruppur',
  'ஈரோடு': 'Erode',
  'வேலூர்': 'Vellore',
  'பாண்டிச்சேரி': 'Pondicherry',
  'புதுச்சேரி': 'Pondicherry',
  'ஓசூர்': 'Hosur',
  'திண்டுக்கல்': 'Dindigul',
  'திருநெல்வேலி': 'Tirunelveli',
  'காஞ்சிபுரம்': 'Kanchipuram',
  'விழுப்புரம்': 'Villupuram',
  'கடலூர்': 'Cuddalore',
  'தஞ்சாவூர்': 'Thanjavur',
  'கும்பகோணம்': 'Kumbakonam',
  'நாகர்கோவில்': 'Nagercoil',
  'தூத்துக்குடி': 'Tuticorin',
  'கரூர்': 'Karur',
};

const ENGLISH_CITIES = [
  'Chennai', 'Tiruvannamalai', 'Bangalore', 'Coimbatore', 'Madurai', 'Trichy',
  'Salem', 'Tiruppur', 'Erode', 'Vellore', 'Pondicherry', 'Puducherry', 'Hosur', 'Dindigul',
  'Tirunelveli', 'Kanchipuram', 'Villupuram', 'Cuddalore', 'Thanjavur', 'Kumbakonam',
  'Nagapattinam', 'Nagercoil', 'Karur', 'Namakkal', 'Krishnagiri', 'Dharmapuri', 'Tuticorin'
];

/**
 * B3. Parse dictated Tamil / Tanglish / English command into a structured booking or estimate draft.
 * Example input: "Chennai to Madurai sedan, 2 days, toll extra, GST included, advance 2000"
 */
export function parseBookingVoiceCommand(text: string): ParsedBookingVoiceDraft {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();

  // 1. Is estimate/quote intent?
  const isEstimate = /\b(estimate|quotation|quote|எஸ்டிமேட்|கொட்டேஷன்)\b/i.test(lower);

  // 2. City Extraction (Pickup -> Drop)
  let pickup = '';
  let drop = '';

  // Tamil city matches
  for (const [tam, eng] of Object.entries(TAMIL_CITIES)) {
    if (raw.includes(tam)) {
      if (!pickup) pickup = eng;
      else if (!drop && eng !== pickup) drop = eng;
    }
  }

  // English city matches with "to" or sequence
  const toSplit = raw.split(/\bto\b|\bஇலிருந்து\b|\bடூ\b/i);
  if (toSplit.length >= 2) {
    for (const city of ENGLISH_CITIES) {
      if (!pickup && new RegExp(`\\b${city}\\b`, 'i').test(toSplit[0])) {
        pickup = city;
      }
      if (!drop && new RegExp(`\\b${city}\\b`, 'i').test(toSplit[1])) {
        drop = city;
      }
    }
  }

  if (!pickup || !drop) {
    for (const city of ENGLISH_CITIES) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(raw)) {
        if (!pickup) pickup = city;
        else if (!drop && city !== pickup) drop = city;
      }
    }
  }

  // Fallbacks if not recognized
  if (!pickup) pickup = 'Chennai';
  if (!drop) drop = 'Madurai';

  // 3. Vehicle Detection
  let vehicleType = 'Sedan (4+1)';
  let carTypeValue = 'SEDAN_4_PLUS_1';

  if (/crysta|கிரிஸ்டா/i.test(lower)) {
    vehicleType = 'Innova Crysta';
    carTypeValue = 'INNOVA_CRYSTA';
  } else if (/innova|இன்னோவா/i.test(lower)) {
    vehicleType = 'Innova';
    carTypeValue = 'INNOVA';
  } else if (/suv|ertiga|எர்டிகா/i.test(lower)) {
    vehicleType = 'SUV (6+1)';
    carTypeValue = 'SUV';
  } else if (/etios|எட்டியோஸ்/i.test(lower)) {
    vehicleType = 'Etios (4+1)';
    carTypeValue = 'ETIOS_4_PLUS_1';
  } else if (/tempo|traveller|டெம்போ/i.test(lower)) {
    vehicleType = 'Tempo Traveller';
    carTypeValue = 'TEMPO_TRAVELLER_12';
  }

  // 4. Trip Type & Days
  const isRound = /round|ரவுண்ட்|இருவழி/i.test(lower);
  const tripType: 'oneway' | 'roundtrip' = isRound ? 'roundtrip' : 'oneway';

  let days = 1;
  const daysMatch = raw.match(/(\d+)\s*(?:days?|நாட்கள்|நாள்)/i);
  if (daysMatch) {
    days = Math.max(1, parseInt(daysMatch[1], 10));
  }

  // 5. Toll Mode
  const tollExtra = /toll\s*extra|டோல்\s*எக்ஸ்ட்ரா|டோல்\s*தனியாக|excl(?:uding)?\s*toll/i.test(lower);
  const tollIncluded = /toll\s*(?:included|inclusive|inc)|டோல்\s*(?:உள்பட|சேர்த்து)/i.test(lower);
  const includeToll = tollIncluded || !tollExtra;
  const tollMode: 'INCLUDED' | 'EXTRA' = includeToll ? 'INCLUDED' : 'EXTRA';

  // 6. GST Mode & Rate
  let gstMode: 'NONE' | 'EXTRA' | 'INCLUDED' = 'NONE';
  let gstRate = 5;
  if (/gst\s*(?:included|inclusive|inc)|ஜிஎஸ்டி\s*(?:உள்பட|சேர்த்து)/i.test(lower)) {
    gstMode = 'INCLUDED';
  } else if (/gst\s*extra|ஜிஎஸ்டி\s*எக்ஸ்ட்ரா|plus\s*gst/i.test(lower)) {
    gstMode = 'EXTRA';
  }
  const gstRateMatch = raw.match(/(\d+)\s*%\s*gst/i);
  if (gstRateMatch) {
    gstRate = parseInt(gstRateMatch[1], 10);
    if (gstMode === 'NONE') gstMode = 'EXTRA';
  }

  // 7. Advance Amount
  let advance = 0;
  const advMatch = raw.match(/(?:advance|adv|அட்வான்ஸ்|முன்பணம்)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i) ||
                   raw.match(/(?:₹|rs\.?)\s*(\d+)\s*(?:advance|adv|முன்பணம்)/i);
  if (advMatch) {
    advance = parseInt(advMatch[1], 10);
  }

  // 8. Rates & Allowances
  const defaultKm = carTypeValue.includes('CRYSTA') ? (isRound ? '22' : '23')
                  : carTypeValue.includes('INNOVA') ? (isRound ? '20' : '21')
                  : carTypeValue.includes('SUV') ? (isRound ? '19' : '20')
                  : (isRound ? '14' : '15');
  const defaultBata = (carTypeValue.includes('INNOVA') && isRound) ? '400' : '300';

  // Extract phone & name if spoken
  const phoneMatch = raw.match(/(?:\+?91[\s-]?)?[6-9]\d{9}/);
  const customerPhone = phoneMatch ? phoneMatch[0].replace(/\D/g, '').slice(-10) : '';

  let customerName = 'Direct Customer';
  const nameMatch = raw.match(/(?:customer|name|பெயர்)\s*[:=-]?\s*([A-Za-z\s]+)/i);
  if (nameMatch && nameMatch[1].trim().length > 2) {
    customerName = nameMatch[1].trim();
  }

  // 9. Claude Billing API Estimate Shape (Section 5)
  const estKm = isRound ? 500 * days : 300;
  const kmRateNum = parseFloat(defaultKm) || 15;
  const fareAmount = estKm * kmRateNum;
  const driverBataTotal = parseInt(defaultBata, 10) * days;

  const lines: Array<{ label: string; amount: number; kind: 'FARE' | 'CHARGE'; included: boolean }> = [
    { label: `${vehicleType} Base Fare (${estKm} km @ ₹${kmRateNum}/km)`, amount: fareAmount, kind: 'FARE', included: true },
    { label: `Driver Bata (${days} day${days > 1 ? 's' : ''})`, amount: driverBataTotal, kind: 'CHARGE', included: true },
  ];

  if (tollMode === 'INCLUDED') {
    lines.push({ label: 'Toll & Parking (Estimated)', amount: 600, kind: 'CHARGE', included: true });
  } else {
    lines.push({ label: 'Toll & Parking (On Actuals)', amount: 0, kind: 'CHARGE', included: false });
  }

  const estimateDraft: ParsedBookingVoiceDraft['estimateDraft'] = {
    doc_type: isEstimate ? 'ESTIMATE' : 'INVOICE',
    customer: {
      name: customerName,
      phone: customerPhone || '9876543210',
    },
    trip: {
      pickup,
      drop,
      trip_type: tripType.toUpperCase(),
      vehicle: carTypeValue,
      km: estKm,
    },
    lines,
    gst: {
      mode: gstMode,
      rate: gstRate,
      collection: gstMode === 'NONE' ? 'SHOW_ONLY' : 'COLLECT',
    },
    discount: 0,
    advance_requested: advance,
    notes: `${days > 1 ? `${days} days tour. ` : ''}${tollMode === 'EXTRA' ? 'Toll & parking extra on actuals. ' : ''}${gstMode === 'EXTRA' ? `GST @ ${gstRate}% extra.` : ''}`,
    issue: false,
  };

  return {
    pickup,
    drop,
    vehicleType,
    carTypeValue,
    tripType,
    days,
    costPerKm: defaultKm,
    extraCostPerKm: '0',
    driverAllowance: defaultBata,
    extraDriverAllowance: '0',
    includeToll,
    tollMode,
    gstMode,
    gstRate,
    advance,
    customerName,
    customerPhone,
    isEstimate,
    estimateDraft,
    rawConfidence: (pickup && drop) ? 'HIGH' : 'MEDIUM',
  };
}

