import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import api from '../services/api';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Reports() {
  const [period, setPeriod] = useState('day');
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get('/admin/reports/revenue', { params: { period } }).then((r) => setData(r.data));
  }, [period]);

  const chartData = {
    labels: data.map((d) => d._id),
    datasets: [
      {
        label: 'Revenue (₹)', data: data.map((d) => d.revenue),
        backgroundColor: '#F59E0B', borderRadius: 4,
      },
      {
        label: 'Bookings', data: data.map((d) => d.count),
        backgroundColor: '#3B82F6', borderRadius: 4,
      },
    ],
  };

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalBookings = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Revenue Reports</h1>
        <div className="flex gap-2">
          {['day', 'week', 'month'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-yellow-400 text-gray-900' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-gray-500">Total Revenue (shown period)</p>
          <p className="text-3xl font-bold text-yellow-500 mt-1">₹{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-5">
          <p className="text-sm text-gray-500">Total Bookings (shown period)</p>
          <p className="text-3xl font-bold text-blue-500 mt-1">{totalBookings}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow p-5">
        <Bar data={chartData} options={{ responsive: true, plugins: { legend: { position: 'top' } } }} />
      </div>
    </div>
  );
}
