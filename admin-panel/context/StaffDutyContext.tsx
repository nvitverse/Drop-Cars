import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StaffDutyContextType {
  isOnDuty: boolean;
  dutyStatus: 'active' | 'idle' | 'off_duty';
  dutySeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  isBubbleVisible: boolean;
  isBubbleCompulsory: boolean;
  lastActiveTimestamp: number;
  leadsHandledToday: number;
  toggleDuty: (forceState?: boolean) => void;
  setBubbleCompulsory: (compulsory: boolean) => void;
  dismissBubble: () => void;
  showBubble: () => void;
  recordLeadAction: () => void;
  resetDutyStats: () => void;
}

const STORAGE_KEYS = {
  DUTY_STATE: '@dropcars_staff_on_duty',
  DUTY_SECONDS: '@dropcars_staff_duty_sec',
  ACTIVE_SECONDS: '@dropcars_staff_active_sec',
  IDLE_SECONDS: '@dropcars_staff_idle_sec',
  COMPULSORY_BUBBLE: '@dropcars_staff_bubble_compulsory',
  LEADS_TODAY: '@dropcars_staff_leads_today',
  LAST_DATE: '@dropcars_staff_duty_date',
};

const StaffDutyContext = createContext<StaffDutyContextType | undefined>(undefined);

export const StaffDutyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [dutyStatus, setDutyStatus] = useState<'active' | 'idle' | 'off_duty'>('off_duty');
  const [dutySeconds, setDutySeconds] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [isBubbleVisible, setIsBubbleVisible] = useState(false);
  const [isBubbleCompulsory, setIsBubbleCompulsoryState] = useState(false);
  const [lastActiveTimestamp, setLastActiveTimestamp] = useState(Date.now());
  const [leadsHandledToday, setLeadsHandledToday] = useState(0);

  const timerRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load saved state on start
  useEffect(() => {
    (async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const savedDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_DATE);
        
        // If new day, reset today counters
        if (savedDate !== todayStr) {
          await AsyncStorage.setItem(STORAGE_KEYS.LAST_DATE, todayStr);
          await AsyncStorage.setItem(STORAGE_KEYS.DUTY_SECONDS, '0');
          await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SECONDS, '0');
          await AsyncStorage.setItem(STORAGE_KEYS.IDLE_SECONDS, '0');
          await AsyncStorage.setItem(STORAGE_KEYS.LEADS_TODAY, '0');
        } else {
          const savedDutySec = await AsyncStorage.getItem(STORAGE_KEYS.DUTY_SECONDS);
          const savedActSec = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SECONDS);
          const savedIdleSec = await AsyncStorage.getItem(STORAGE_KEYS.IDLE_SECONDS);
          const savedLeads = await AsyncStorage.getItem(STORAGE_KEYS.LEADS_TODAY);
          if (savedDutySec) setDutySeconds(parseInt(savedDutySec, 10) || 0);
          if (savedActSec) setActiveSeconds(parseInt(savedActSec, 10) || 0);
          if (savedIdleSec) setIdleSeconds(parseInt(savedIdleSec, 10) || 0);
          if (savedLeads) setLeadsHandledToday(parseInt(savedLeads, 10) || 0);
        }

        const savedDuty = await AsyncStorage.getItem(STORAGE_KEYS.DUTY_STATE);
        const savedCompulsory = await AsyncStorage.getItem(STORAGE_KEYS.COMPULSORY_BUBBLE);
        
        const isComp = savedCompulsory === 'true';
        setIsBubbleCompulsoryState(isComp);

        if (savedDuty === 'true') {
          setIsOnDuty(true);
          setDutyStatus('active');
          setIsBubbleVisible(true);
        }
      } catch (e) {
        console.error('Error loading staff duty state:', e);
      }
    })();
  }, []);

  // Listen to App State changes (backgrounding = idle / pause)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;
      if (nextAppState === 'active') {
        setLastActiveTimestamp(Date.now());
        if (isOnDuty) setDutyStatus('active');
      } else {
        if (isOnDuty) setDutyStatus('idle');
      }
    });
    return () => subscription.remove();
  }, [isOnDuty]);

  // Main 1-second interval tracker
  useEffect(() => {
    if (isOnDuty) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const diffSinceActive = (now - lastActiveTimestamp) / 1000;
        
        // If inactive for more than 5 minutes (300 seconds), mark as idle
        const currentActive = appStateRef.current === 'active' && diffSinceActive < 300;

        setDutySeconds((prev) => {
          const next = prev + 1;
          if (next % 10 === 0) AsyncStorage.setItem(STORAGE_KEYS.DUTY_SECONDS, String(next));
          return next;
        });

        if (currentActive) {
          setDutyStatus('active');
          setActiveSeconds((prev) => {
            const next = prev + 1;
            if (next % 10 === 0) AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SECONDS, String(next));
            return next;
          });
        } else {
          setDutyStatus('idle');
          setIdleSeconds((prev) => {
            const next = prev + 1;
            if (next % 10 === 0) AsyncStorage.setItem(STORAGE_KEYS.IDLE_SECONDS, String(next));
            return next;
          });
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setDutyStatus('off_duty');
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOnDuty, lastActiveTimestamp]);

  const toggleDuty = useCallback((forceState?: boolean) => {
    setIsOnDuty((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      AsyncStorage.setItem(STORAGE_KEYS.DUTY_STATE, next ? 'true' : 'false');
      if (next) {
        setLastActiveTimestamp(Date.now());
        setDutyStatus('active');
        setIsBubbleVisible(true);
      } else {
        setDutyStatus('off_duty');
        setIsBubbleVisible(false);
      }
      return next;
    });
  }, []);

  const setBubbleCompulsory = useCallback((compulsory: boolean) => {
    setIsBubbleCompulsoryState(compulsory);
    AsyncStorage.setItem(STORAGE_KEYS.COMPULSORY_BUBBLE, compulsory ? 'true' : 'false');
    if (compulsory && isOnDuty) {
      setIsBubbleVisible(true);
    }
  }, [isOnDuty]);

  const dismissBubble = useCallback(() => {
    if (!isBubbleCompulsory) {
      setIsBubbleVisible(false);
    }
  }, [isBubbleCompulsory]);

  const showBubble = useCallback(() => {
    if (isOnDuty) {
      setIsBubbleVisible(true);
    }
  }, [isOnDuty]);

  const recordLeadAction = useCallback(() => {
    setLastActiveTimestamp(Date.now());
    setDutyStatus('active');
    setLeadsHandledToday((prev) => {
      const next = prev + 1;
      AsyncStorage.setItem(STORAGE_KEYS.LEADS_TODAY, String(next));
      return next;
    });
  }, []);

  const resetDutyStats = useCallback(() => {
    setDutySeconds(0);
    setActiveSeconds(0);
    setIdleSeconds(0);
    setLeadsHandledToday(0);
    AsyncStorage.setItem(STORAGE_KEYS.DUTY_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.IDLE_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.LEADS_TODAY, '0');
  }, []);

  return (
    <StaffDutyContext.Provider
      value={{
        isOnDuty,
        dutyStatus,
        dutySeconds,
        activeSeconds,
        idleSeconds,
        isBubbleVisible,
        isBubbleCompulsory,
        lastActiveTimestamp,
        leadsHandledToday,
        toggleDuty,
        setBubbleCompulsory,
        dismissBubble,
        showBubble,
        recordLeadAction,
        resetDutyStats,
      }}
    >
      {children}
    </StaffDutyContext.Provider>
  );
};

export const useStaffDuty = () => {
  const context = useContext(StaffDutyContext);
  if (!context) {
    throw new Error('useStaffDuty must be used within a StaffDutyProvider');
  }
  return context;
};
