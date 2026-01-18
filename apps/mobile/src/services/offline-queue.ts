/**
 * Offline Queue Service
 *
 * Queue failed commands for retry when connectivity is restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Queued action
 */
export interface QueuedAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const QUEUE_STORAGE_KEY = '@nexus-aec/offline-queue';
const MAX_RETRIES = 3;

/**
 * Load queue from storage
 */
async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save queue to storage
 */
async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Add action to queue
 */
export async function enqueueAction(
  type: string,
  payload: Record<string, unknown>
): Promise<QueuedAction> {
  const queue = await loadQueue();

  const action: QueuedAction = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
    maxRetries: MAX_RETRIES,
  };

  queue.push(action);
  await saveQueue(queue);

  return action;
}

/**
 * Remove action from queue
 */
export async function dequeueAction(id: string): Promise<void> {
  const queue = await loadQueue();
  const filtered = queue.filter((a) => a.id !== id);
  await saveQueue(filtered);
}

/**
 * Get all queued actions
 */
export async function getQueuedActions(): Promise<QueuedAction[]> {
  return loadQueue();
}

/**
 * Clear all queued actions
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
}

/**
 * Increment retry count for an action
 */
export async function incrementRetry(id: string): Promise<QueuedAction | null> {
  const queue = await loadQueue();
  const action = queue.find((a) => a.id === id);

  if (!action) {
    return null;
  }

  action.retries += 1;

  if (action.retries >= action.maxRetries) {
    // Remove from queue if max retries exceeded
    await dequeueAction(id);
    return null;
  }

  await saveQueue(queue);
  return action;
}

/**
 * Process all queued actions
 * Returns array of action IDs that were successfully processed
 */
export async function processQueue(
  executor: (action: QueuedAction) => Promise<boolean>
): Promise<string[]> {
  const queue = await loadQueue();
  const processed: string[] = [];

  for (const action of queue) {
    try {
      const success = await executor(action);
      if (success) {
        await dequeueAction(action.id);
        processed.push(action.id);
      } else {
        await incrementRetry(action.id);
      }
    } catch {
      await incrementRetry(action.id);
    }
  }

  return processed;
}

/**
 * Get queue size
 */
export async function getQueueSize(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}
