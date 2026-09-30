import React, { createContext, useContext, useState } from 'react';

export type ServiceMode = 'HOME' | 'TAXI' | 'CARPOOL';

interface ServiceModeContextType {
  activeMode: ServiceMode;
  setActiveMode: (mode: ServiceMode) => void;
}

const ServiceModeContext = createContext<ServiceModeContextType | undefined>(undefined);

export function ServiceModeProvider({ children }: { children: React.ReactNode }) {
  const [activeMode, setActiveMode] = useState<ServiceMode>('HOME');

  return (
    <ServiceModeContext.Provider value={{ activeMode, setActiveMode }}>
      {children}
    </ServiceModeContext.Provider>
  );
}

export function useServiceMode() {
  const context = useContext(ServiceModeContext);
  if (!context) {
    throw new Error('useServiceMode must be used within a ServiceModeProvider');
  }
  return context;
}
