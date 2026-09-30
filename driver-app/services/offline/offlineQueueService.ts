import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosInstance from '@/app/api/axiosInstance';

export interface PendingTripAction {
  id: string;
  orderId: number | string;
  actionType: 'START_TRIP' | 'END_TRIP' | 'RECORD_ODOMETER' | 'UPDATE_LOCATION';
  payload: any;
  createdAt: string;
  retryCount: number;
}

const STORAGE_KEY = '@drop_cars_offline_actions_queue';

export class OfflineQueueService {
  /**
   * Queue a trip action locally when offline or request fails due to network error.
   */
  public async queueAction(
    orderId: number | string,
    actionType: PendingTripAction['actionType'],
    payload: any
  ): Promise<PendingTripAction> {
    const queue = await this.getQueue();
    const newAction: PendingTripAction = {
      id: `${actionType}_${orderId}_${Date.now()}`,
      orderId,
      actionType,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    queue.push(newAction);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log(`[OfflineQueueService] Queued action ${newAction.id} for order ${orderId}`);
    return newAction;
  }

  /**
   * Retrieve all pending offline actions.
   */
  public async getQueue(): Promise<PendingTripAction[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Flush and process all queued offline actions with backend API retry.
   */
  public async flushQueue(): Promise<{ processed: number; failed: number }> {
    const queue = await this.getQueue();
    if (queue.length === 0) return { processed: 0, failed: 0 };

    console.log(`[OfflineQueueService] Attempting to flush ${queue.length} pending actions`);
    const remainingQueue: PendingTripAction[] = [];
    let processed = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        let endpoint = '';
        switch (item.actionType) {
          case 'START_TRIP':
            endpoint = `/api/orders/${item.orderId}/start-trip`;
            break;
          case 'END_TRIP':
            endpoint = `/api/orders/${item.orderId}/end-trip`;
            break;
          case 'RECORD_ODOMETER':
            endpoint = `/api/orders/${item.orderId}/odometer`;
            break;
          case 'UPDATE_LOCATION':
            endpoint = `/api/orders/${item.orderId}/driver-location`;
            break;
        }

        if (endpoint) {
          await axiosInstance.post(endpoint, item.payload);
          processed++;
          console.log(`[OfflineQueueService] Successfully synced offline action ${item.id}`);
        }
      } catch (err: any) {
        console.warn(`[OfflineQueueService] Sync failed for item ${item.id}:`, err?.message);
        item.retryCount += 1;
        // Keep item in queue if retried less than 5 times
        if (item.retryCount < 5) {
          remainingQueue.push(item);
        } else {
          console.error(`[OfflineQueueService] Discarding item ${item.id} after 5 failed retries`);
        }
        failed++;
      }
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remainingQueue));
    return { processed, failed };
  }

  /**
   * Clear all pending items in queue.
   */
  public async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export const offlineQueueService = new OfflineQueueService();
export default offlineQueueService;
