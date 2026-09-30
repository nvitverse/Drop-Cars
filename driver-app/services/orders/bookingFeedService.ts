import { AppState } from 'react-native';
import * as SecureStore from '@/utils/secureStore';
import axiosInstance from '@/app/api/axiosInstance';

export interface FeedMessage {
  type: 'NEW_BOOKING' | 'BOOKING_TAKEN' | 'BOOKING_CANCELLED' | 'STATUS_UPDATE';
  order_id?: number | string;
  payload?: any;
  timestamp: string;
}

type FeedCallback = (message: FeedMessage) => void;

class BookingFeedService {
  private socket: WebSocket | null = null;
  private listeners: Set<FeedCallback> = new Set();
  private isConnected: boolean = false;
  private reconnectTimer: any = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isExplicitlyClosed: boolean = false;
  private appStateSub: { remove: () => void } | null = null;

  // The live feed only runs while the app is on screen: an open connection keeps the server busy (and billed) all day.
  // In the background, new bookings still reach the driver as push notifications; when the app comes back to the front
  // the feed reconnects and the screens refresh themselves.
  private watchAppState(): void {
    if (this.appStateSub) return;
    this.appStateSub = AppState.addEventListener('change', (state) => {
      if (this.listeners.size === 0) return;
      if (state === 'active') {
        this.reconnectAttempts = 0;
        this.connect();
      } else {
        this.pauseForBackground();
      }
    });
  }

  private pauseForBackground(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.isConnected = false;
  }

  public async connect(): Promise<void> {
    if (AppState.currentState !== 'active') return;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        console.warn('[BookingFeedService] Cannot connect WebSocket: missing auth token');
        return;
      }

      const defaultBase = 'https://drop-cars-api-207918408785.asia-south2.run.app';
      const rawBase = axiosInstance.defaults.baseURL || defaultBase;
      const baseUrl = rawBase.replace(/^http/, 'ws');
      const wsUrl = `${baseUrl}/api/ws/driver-feed?token=${encodeURIComponent(token)}`;

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[BookingFeedService] WebSocket connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      };

      this.socket.onmessage = (event) => {
        try {
          const data: FeedMessage = JSON.parse(event.data);
          this.notifyListeners(data);
        } catch (err) {
          console.error('[BookingFeedService] Error parsing WS message:', err);
        }
      };

      this.socket.onerror = (error) => {
        console.warn('[BookingFeedService] WebSocket error:', error);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        console.log('[BookingFeedService] WebSocket connection closed');
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[BookingFeedService] Failed to establish WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[BookingFeedService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  public subscribe(callback: FeedCallback): () => void {
    this.listeners.add(callback);
    this.watchAppState();
    if (!this.isConnected && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {
      this.connect();
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.disconnect();
        this.appStateSub?.remove();
        this.appStateSub = null;
      }
    };
  }

  private notifyListeners(message: FeedMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('[BookingFeedService] Listener execution error:', err);
      }
    });
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }

  public getStatus(): boolean {
    return this.isConnected;
  }
}

export const bookingFeedService = new BookingFeedService();
export default bookingFeedService;
