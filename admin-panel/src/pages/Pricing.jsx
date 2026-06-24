import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const FIELDS = [
  { key: 'baseFare', label: 'Base Fare (₹)' },
  { key: 'perKm', label: 'Per KM (₹)' },
  { key: 'perMin', label: 'Per Minute (₹)' },
  { key: 'minimumFare', label: 'Minimum Fare (₹)' },
  { key: 'surgeFactor', label: 'Surge Factor (×)' },
  { key: 'airportSurcharge', label: 'Airport Surcharge (₹)' },
  { key: 'outstationPerDayFare', label: 'Outstation/Day (₹)' },
  { key: 'outstationPerKm', label: 'Outstation/KM (₹)' },
  { key: 'roundTripMultiplier', label: 'Round-Trip Multiplier (×)' },
];

export default function Pricing() {
  const [pricing, setPricing] = useState([]);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState('');

  useEffect(() => {
    api.get('/pricing').then((r) => {
      setPricing(r.data);
      const init = {};
      r.data.forEach((p) => { init[p.vehicleType] = { ...p }; });
      setEditing(init);
    });
  }, []);

  const handleChange = (vehicleType, key, value) => {
    setEditing((prev) => ({ ...prev, [vehicleType]: { ...prev[vehicleType], [key]: Number(value) } }));
  };

  const save = async (vehicleType) => {
    setSaving(vehicleType);
    try {
      await api.put(`/pricing/${vehicleType}`, editing[vehicleType]);
      toast.success(`${vehicleType} pricing updated`);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Pricing Manager</h1>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {pricing.map((p) => (
          <div key={p.vehicleType} className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold capitalize">{p.vehicleLabel}</h2>
                <p className="text-xs text-gray-400">{p.vehicleExamples}</p>
              </div>
              <span className="text-sm bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">{p.capacity} seats</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input
                    type="number" step="0.1" min="0"
                    value={editing[p.vehicleType]?.[key] ?? ''}
                    onChange={(e) => handleChange(p.vehicleType, key, e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => save(p.vehicleType)}
              disabled={saving === p.vehicleType}
              className="mt-4 w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-2 rounded-lg transition-colors disabled:opacity-60 text-sm"
            >
              {saving === p.vehicleType ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
