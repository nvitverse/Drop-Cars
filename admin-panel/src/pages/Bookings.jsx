import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-blue-100 text-blue-700',
  'driver-arriving': 'bg-blue-100 text-blue-700',
  started: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
};

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', vehicleType: '' });

  const load = () => {
    const params = { page, limit: 20, ...filters };
    api.get('/admin/bookings', { params }).then((r) => { setBookings(r.data.bookings); setTotal(r.data.total); });
  };

  useEffect(() => { load(); }, [page, filters]);

  const cancelBooking = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    await api.patch(`/admin/bookings/${id}/cancel`, { reason: 'Admin cancelled' });
    toast.success('Booking cancelled');
    load();
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Bookings ({total})</h1>
        <div className="flex gap-2">
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">All Status</option>
            {['pending','accepted','started','completed','cancelled'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filters.vehicleType} onChange={(e) => setFilters((f) => ({ ...f, vehicleType: e.target.value }))}
            className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">All Vehicles</option>
            {['hatchback','sedan','suv','luxury'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['#','Customer','Pickup','Destination','Vehicle','Trip','Date','Fare','Status','Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map((b, i) => (
                <tr key={b._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{(page - 1) * 20 + i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.userId?.name}</p>
                    <p className="text-gray-400 text-xs">{b.userId?.phone}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate">{b.pickup?.address}</td>
                  <td className="px-4 py-3 max-w-[140px] truncate">{b.destination?.address}</td>
                  <td className="px-4 py-3 capitalize">{b.vehicleType}</td>
                  <td className="px-4 py-3 capitalize">{b.tripType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(b.pickupDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold">₹{b.fare?.total}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || ''}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!['completed','cancelled'].includes(b.status) && (
                      <button onClick={() => cancelBooking(b._id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-4 py-3 border-t text-sm text-gray-500">
          <span>{total} total</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <span className="px-3 py-1">Page {page}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
