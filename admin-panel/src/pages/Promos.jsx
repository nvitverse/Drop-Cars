import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const EMPTY = {
  code: '', discountType: 'flat', discountValue: '', maxDiscount: '',
  minimumFare: 0, usageLimit: 100, perUserLimit: 1,
  expiresAt: '', applicableVehicles: ['hatchback', 'sedan', 'suv', 'luxury'],
};

export default function Promos() {
  const [promos, setPromos] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/admin/promos').then((r) => setPromos(r.data));
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/promos', form);
      toast.success('Promo created');
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Promo Codes</h1>
        <button onClick={() => setShowForm((s) => !s)}
          className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 rounded-lg text-sm">
          + New Promo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-5 mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { key: 'code', label: 'Code', type: 'text', placeholder: 'SAVE50' },
            { key: 'discountValue', label: 'Discount Value', type: 'number', placeholder: '50' },
            { key: 'maxDiscount', label: 'Max Discount (₹)', type: 'number', placeholder: '200' },
            { key: 'minimumFare', label: 'Min Fare (₹)', type: 'number', placeholder: '0' },
            { key: 'usageLimit', label: 'Usage Limit', type: 'number', placeholder: '100' },
            { key: 'perUserLimit', label: 'Per User Limit', type: 'number', placeholder: '1' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-gray-500">{label}</label>
              <input type={type} placeholder={placeholder} value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                required={['code','discountValue','expiresAt'].includes(key)}
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500">Discount Type</label>
            <select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5">
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Expires At</label>
            <input type="datetime-local" value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" required />
          </div>
          <div className="col-span-2 md:col-span-3 flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Promo'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Code','Type','Value','Min Fare','Used','Limit','Expires','Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {promos.map((p) => (
              <tr key={p._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-bold text-yellow-600">{p.code}</td>
                <td className="px-4 py-3 capitalize">{p.discountType}</td>
                <td className="px-4 py-3">{p.discountType === 'flat' ? `₹${p.discountValue}` : `${p.discountValue}%`}</td>
                <td className="px-4 py-3">₹{p.minimumFare}</td>
                <td className="px-4 py-3">{p.usageCount}</td>
                <td className="px-4 py-3">{p.usageLimit}</td>
                <td className="px-4 py-3">{new Date(p.expiresAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive && new Date(p.expiresAt) > new Date() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {p.isActive && new Date(p.expiresAt) > new Date() ? 'Active' : 'Expired'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
