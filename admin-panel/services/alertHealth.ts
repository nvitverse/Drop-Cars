export interface AlertHealthState {
  lastPollTime: number | null;
  lastPollError: string | null;
  lastPollCount: number;
  pushToken: string | null;
  pushTokenError: string | null;
  hasGoogleServices: boolean;
  isChannelSetup: boolean;
  lastPushReceivedTime: number | null;
  effectiveAlarmStatus: {
    enabled_now: boolean;
    ring_seconds: number;
    repeat_minutes: number;
    next_window: string | null;
    global_enabled?: boolean;
    reason?: string;
  } | null;
}

let state: AlertHealthState = {
  lastPollTime: null,
  lastPollError: null,
  lastPollCount: 0,
  pushToken: null,
  pushTokenError: null,
  hasGoogleServices: false,
  isChannelSetup: false,
  lastPushReceivedTime: null,
  effectiveAlarmStatus: null,
};

type Listener = (health: AlertHealthState) => void;
const listeners = new Set<Listener>();

function notify() {
  const snapshot = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

export const alertHealth = {
  getSnapshot(): AlertHealthState {
    return { ...state };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({ ...state });
    return () => {
      listeners.delete(listener);
    };
  },

  recordPollSuccess(count: number) {
    state.lastPollTime = Date.now();
    state.lastPollError = null;
    state.lastPollCount = count;
    notify();
  },

  recordPollError(error: string) {
    state.lastPollTime = Date.now();
    state.lastPollError = error;
    notify();
  },

  recordPushToken(token: string | null, error: string | null = null) {
    state.pushToken = token;
    state.pushTokenError = error;
    notify();
  },

  setChannelStatus(isSetup: boolean) {
    state.isChannelSetup = isSetup;
    notify();
  },

  setGoogleServicesStatus(exists: boolean) {
    state.hasGoogleServices = exists;
    notify();
  },

  recordPushReceived() {
    state.lastPushReceivedTime = Date.now();
    notify();
  },

  setEffectiveAlarmStatus(status: AlertHealthState['effectiveAlarmStatus']) {
    state.effectiveAlarmStatus = status;
    notify();
  },
};
