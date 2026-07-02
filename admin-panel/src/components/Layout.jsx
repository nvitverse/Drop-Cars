import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/bookings', label: 'Bookings', icon: '🚕' },
  { to: '/drivers', label: 'Drivers', icon: '🧑‍✈️' },
  { to: '/customers', label: 'Customers', icon: '👤' },
  { to: '/pricing', label: 'Pricing', icon: '💰' },
  { to: '/promos', label: 'Promos', icon: '🏷️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-900 text-white flex flex-col transition-all duration-200 shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {!collapsed && <span className="font-bold text-lg text-yellow-400">Drop Cars App</span>}
          <button onClick={() => setCollapsed((c) => !c)} className="text-gray-400 hover:text-white text-xl">
            {collapsed ? '→' : '←'}
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to} to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-yellow-500 text-gray-900 font-semibold' : 'text-gray-300 hover:bg-gray-800'}`
              }
            >
              <span className="text-lg">{n.icon}</span>
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          {!collapsed && <p className="text-xs text-gray-400 truncate mb-2">{user?.name}</p>}
          <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">
            {collapsed ? '🚪' : 'Logout'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
