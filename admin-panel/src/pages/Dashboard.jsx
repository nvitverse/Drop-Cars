import React, { useEffect, useState } from 'react';
import { Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale,
  ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '../services/api';
import StatsCard from '../components/StatsCard';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Legend, Filler);

const VEHICLE_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6'];

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard').then((r) => setData(r.data)).catch(console.error);
  }, []);

  if (!data) return <div className="p-8 text-gray-500">Loading dashboard...</div>;

  const lineData = {
    labels: data.bookingsByDay.map((d) => d._id),
    datasets: [{
      label: 'Bookings', data: data.bookingsByDay.map((d) => d.count),
      fill: true, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)',
      tension: 0.4, pointRadius: 3,
    }],
  };

  const pieData = {
    labels: data.vehicleDist.map((d) => d._id),
    datasets: [{ data: data.vehicleDist.map((d) => d.count), backgroundColor: VEHICLE_COLORS }],
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatsCard title="Total Users" value={data.totalUsers} icon="👤" color="blue" />
        <StatsCard title="Drivers" value={data.totalDrivers} icon="🧑‍✈️" color="green" />
        <StatsCard title="Today's Bookings" value={data.todayBookings} icon="🚕" color="yellow" />
        <StatsCard title="Active Drivers" value={data.activeDrivers} icon="🟢" color="green" />
        <StatsCard title="Revenue (₹)" value={`₹${(data.totalRevenue || 0).toLocaleString()}`} icon="💰" color="purple" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Bookings — Last 30 Days</h2>
          <Line data={lineData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Vehicle Distribution</h2>
          {data.vehicleDist.length ? (
            <Pie data={pieData} options={{ responsive: true }} />
          ) : (
            <p className="text-sm text-gray-400">No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
