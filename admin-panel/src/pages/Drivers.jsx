import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    api.get('/admin/drivers', { params: { page, limit: 20, status: statusFilter } })
      .then((r) => { setDrivers(r.data.drivers); setTotal(r.data.total); });
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const approve = async (id, isApproved) => {
    await api.patch(`/admin/drivers/${id}/approve`, { isApproved });
    toast.success(isApproved ? 'Driver approved' : 'Driver suspended');
    load();
  };

  const block = async (driver) => {
    await api.patch(`/admin/drivers/${driver._id}/block`, { isBlocked: !driver.isBlocked });
    toast.success(driver.isBlocked ? 'Driver unblocked' : 'Driver blocked');
    load();
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Drivers ({total})</h1>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">All Drivers</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Driver','Phone','Vehicle','Plate','Status','Online','Rides','Rating','Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {drivers.map((d) => (
              <tr key={d._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{d.userId?.name}</td>
                <td className="px-4 py-3">{d.userId?.phone}</td>
                <td className="px-4 py-3 capitalize">{d.vehicleType} — {d.vehicleName}</td>
                <td className="px-4 py-3 font-mono">{d.plateNumber}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.isApproved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {d.isApproved ? 'Approved' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`w-2 h-2 rounded-full inline-block ${d.isOnline ? 'bg-green-400' : 'bg-gray-300'}`} />
                </td>
                <td className="px-4 py-3">{d.totalRides}</td>
                <td className="px-4 py-3">⭐ {Number(d.rating).toFixed(1)}</td>
                <td className="px-4 py-3 flex gap-2 flex-wrap">
                  {!d.isApproved ? (
                    <button onClick={() => approve(d._id, true)} className="text-xs text-green-600 hover:text-green-800 font-medium">Approve</button>
                  ) : (
                    <button onClick={() => approve(d._id, false)} className="text-xs text-yellow-600 hover:text-yellow-800 font-medium">Suspend</button>
                  )}
                  <button onClick={() => block(d)} className={`text-xs font-medium ${d.isBlocked ? 'text-green-600' : 'text-red-500'}`}>
                    {d.isBlocked ? 'Unblock' : 'Block'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between px-4 py-3 border-t text-sm text-gray-500">
          <span>{total} total</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <span className="px-3 py-1">Page {page}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
