import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Drivers from './pages/Drivers';
import Bookings from './pages/Bookings';
import Pricing from './pages/Pricing';
import Reports from './pages/Reports';
import Promos from './pages/Promos';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="reports" element={<Reports />} />
        <Route path="promos" element={<Promos />} />
      </Route>
    </Routes>
  );
}
