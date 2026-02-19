import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const QUEUE_KEY = 'gps_point_queue';
const MAX_QUEUE_SIZE = 500;

interface GpsPoint {
  vehiculoId: string;
  lat: number;
  lng: number;
  velocidad: number;
  precision: number;
  timestamp: string;
}

let memoryQueue: GpsPoint[] = [];
let isFlushing = false;

/**
 * Add a GPS point to the queue. Tries to send immediately,
 * falls back to local storage if network fails.
 */
export async function enqueueGpsPoint(point: Omit<GpsPoint, 'timestamp'>): Promise<boolean> {
  const fullPoint: GpsPoint = { ...point, timestamp: new Date().toISOString() };

  try {
    await api.post('/gps/points', {
      vehiculoId: fullPoint.vehiculoId,
      lat: fullPoint.lat,
      lng: fullPoint.lng,
      velocidad: fullPoint.velocidad,
      precision: fullPoint.precision,
    });
    // Sent successfully - also try to flush any queued points
    if (memoryQueue.length > 0) {
      flushQueue();
    }
    return true;
  } catch {
    // Network failed - queue locally
    memoryQueue.push(fullPoint);
    if (memoryQueue.length > MAX_QUEUE_SIZE) {
      memoryQueue = memoryQueue.slice(-MAX_QUEUE_SIZE);
    }
    // Persist to disk in case app gets killed
    persistQueue();
    return false;
  }
}

/**
 * Try to send all queued points to the server
 */
export async function flushQueue(): Promise<void> {
  if (isFlushing || memoryQueue.length === 0) return;
  isFlushing = true;

  try {
    // Load any persisted points first
    await loadPersistedQueue();

    const toSend = [...memoryQueue];
    const sent: number[] = [];

    for (let i = 0; i < toSend.length; i++) {
      try {
        await api.post('/gps/points', {
          vehiculoId: toSend[i].vehiculoId,
          lat: toSend[i].lat,
          lng: toSend[i].lng,
          velocidad: toSend[i].velocidad,
          precision: toSend[i].precision,
        });
        sent.push(i);
      } catch {
        // Stop flushing on first failure - network probably still down
        break;
      }
    }

    if (sent.length > 0) {
      // Remove sent points
      memoryQueue = memoryQueue.filter((_, idx) => !sent.includes(idx));
      persistQueue();
    }
  } finally {
    isFlushing = false;
  }
}

async function persistQueue(): Promise<void> {
  try {
    if (memoryQueue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
    }
  } catch {
    // Storage full or unavailable - just keep in memory
  }
}

async function loadPersistedQueue(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    if (stored) {
      const parsed: GpsPoint[] = JSON.parse(stored);
      // Merge persisted with memory, dedup by timestamp
      const timestamps = new Set(memoryQueue.map((p) => p.timestamp));
      for (const p of parsed) {
        if (!timestamps.has(p.timestamp)) {
          memoryQueue.push(p);
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
}

export function getQueueSize(): number {
  return memoryQueue.length;
}
