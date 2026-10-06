import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/api';

interface StaffDutyContextType {
  isOnDuty: boolean;
  dutyStatus: 'active' | 'idle' | 'off_duty' | 'break';
  isOnBreak: boolean;
  breakDurationMinutes: number;
  breakRemainingSeconds: number;
  dutySeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  isBubbleVisible: boolean;
  isBubbleCompulsory: boolean;
  lastActiveTimestamp: number;
  leadsHandledToday: number;
  toggleDuty: (forceState?: boolean) => void;
  startBreak: (durationMinutes: number) => void;
  resumeFromBreak: () => void;
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
  BREAK_END_TIME: '@dropcars_staff_break_end_time',
  BREAK_DURATION: '@dropcars_staff_break_duration',
};

const StaffDutyContext = createContext<StaffDutyContextType | undefined>(undefined);

export const StaffDutyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [dutyStatus, setDutyStatus] = useState<'active' | 'idle' | 'off_duty' | 'break'>('off_duty');
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(30);
  const [breakRemainingSeconds, setBreakRemainingSeconds] = useState(0);
  const [dutySeconds, setDutySeconds] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [isBubbleVisible, setIsBubbleVisible] = useState(true);
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
          await AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME);
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

        // Check active break
        const savedBreakEnd = await AsyncStorage.getItem(STORAGE_KEYS.BREAK_END_TIME);
        const savedBreakDur = await AsyncStorage.getItem(STORAGE_KEYS.BREAK_DURATION);
        if (savedBreakDur) setBreakDurationMinutes(parseInt(savedBreakDur, 10) || 30);

        if (savedBreakEnd) {
          const remaining = Math.floor((parseInt(savedBreakEnd, 10) - Date.now()) / 1000);
          if (remaining > 0) {
            setIsOnBreak(true);
            setBreakRemainingSeconds(remaining);
            setDutyStatus('break');
          } else {
            await AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME);
          }
        }

        if (savedDuty === 'true') {
          setIsOnDuty(true);
          if (!savedBreakEnd || Math.floor((parseInt(savedBreakEnd, 10) - Date.now()) / 1000) <= 0) {
            setDutyStatus('active');
          }
          setIsBubbleVisible(true);
        }

        // Check backend server state as well
        try {
          const liveDuty = await apiService.getMyOnDuty();
          if (typeof liveDuty?.is_on_duty === 'boolean') {
            setIsOnDuty(liveDuty.is_on_duty);
            if (!isOnBreak) {
              setDutyStatus(liveDuty.is_on_duty ? 'active' : 'off_duty');
            }
            AsyncStorage.setItem(STORAGE_KEYS.DUTY_STATE, liveDuty.is_on_duty ? 'true' : 'false').catch(() => {});
          }
        } catch {}
      } catch (e) {
        console.error('Error loading staff duty state:', e);
      }
    })();
  }, []);

  // Listen to App State changes (backgrounding = idle / pause)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;
      if (isOnBreak) {
        setDutyStatus('break');
        return;
      }
      if (nextAppState === 'active') {
        setLastActiveTimestamp(Date.now());
        if (isOnDuty) setDutyStatus('active');
      } else {
        if (isOnDuty) setDutyStatus('idle');
      }
    });
    return () => subscription.remove();
  }, [isOnDuty, isOnBreak]);

  // Main 1-second interval tracker
  useEffect(() => {
    if (isOnDuty) {
      timerRef.current = setInterval(() => {
        // Handle Break state
        if (isOnBreak) {
          setBreakRemainingSeconds((prev) => {
            if (prev <= 1) {
              setIsOnBreak(false);
              setDutyStatus('active');
              AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME).catch(() => {});
              return 0;
            }
            return prev - 1;
          });
          return;
        }

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
  }, [isOnDuty, isOnBreak, lastActiveTimestamp]);

  const toggleDuty = useCallback((forceState?: boolean) => {
    setIsOnDuty((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      AsyncStorage.setItem(STORAGE_KEYS.DUTY_STATE, next ? 'true' : 'false');
      AsyncStorage.setItem('@admin_staff_on_duty_shift', next ? 'true' : 'false').catch(() => {});
      apiService.setOnDuty(next).catch(() => {});
      if (next) {
        setLastActiveTimestamp(Date.now());
        setDutyStatus('active');
        setIsBubbleVisible(true);
      } else {
        setIsOnBreak(false);
        AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME).catch(() => {});
        setDutyStatus('off_duty');
      }
      return next;
    });
  }, []);

  const startBreak = useCallback((durationMinutes: number) => {
    setIsOnBreak(true);
    setBreakDurationMinutes(durationMinutes);
    const totalSeconds = durationMinutes * 60;
    setBreakRemainingSeconds(totalSeconds);
    setDutyStatus('break');
    const endTime = Date.now() + totalSeconds * 1000;
    AsyncStorage.setItem(STORAGE_KEYS.BREAK_END_TIME, String(endTime));
    AsyncStorage.setItem(STORAGE_KEYS.BREAK_DURATION, String(durationMinutes));
  }, []);

  const resumeFromBreak = useCallback(() => {
    setIsOnBreak(false);
    setBreakRemainingSeconds(0);
    setDutyStatus('active');
    setLastActiveTimestamp(Date.now());
    AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME).catch(() => {});
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
    if (!isOnBreak) {
      setDutyStatus('active');
    }
    setLeadsHandledToday((prev) => {
      const next = prev + 1;
      AsyncStorage.setItem(STORAGE_KEYS.LEADS_TODAY, String(next));
      return next;
    });
  }, [isOnBreak]);

  const resetDutyStats = useCallback(() => {
    setDutySeconds(0);
    setActiveSeconds(0);
    setIdleSeconds(0);
    setLeadsHandledToday(0);
    setIsOnBreak(false);
    AsyncStorage.setItem(STORAGE_KEYS.DUTY_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.IDLE_SECONDS, '0');
    AsyncStorage.setItem(STORAGE_KEYS.LEADS_TODAY, '0');
    AsyncStorage.removeItem(STORAGE_KEYS.BREAK_END_TIME);
  }, []);

  return (
    <StaffDutyContext.Provider
      value={{
        isOnDuty,
        dutyStatus,
        isOnBreak,
        breakDurationMinutes,
        breakRemainingSeconds,
        dutySeconds,
        activeSeconds,
        idleSeconds,
        isBubbleVisible,
        isBubbleCompulsory,
        lastActiveTimestamp,
        leadsHandledToday,
        toggleDuty,
        startBreak,
        resumeFromBreak,
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
