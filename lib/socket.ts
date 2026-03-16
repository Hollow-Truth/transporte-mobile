import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SOCKET_URL } from './constants';

let socket: Socket | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

export async function getSocket(): Promise<Socket> {
  if (!socket) {
    const token = await AsyncStorage.getItem('access_token');
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });

    socket.on('connect', () => { /* connected */ });
    socket.on('disconnect', () => { /* disconnected */ });
    socket.on('connect_error', () => { /* connection error */ });

    // Monitor network changes - reconnect socket when network recovers
    if (!netInfoUnsubscribe) {
      let wasDisconnected = false;
      netInfoUnsubscribe = NetInfo.addEventListener((state) => {
        if (!state.isConnected) {
          wasDisconnected = true;
        } else if (wasDisconnected && socket) {
          wasDisconnected = false;
          // Force reconnect by disconnecting and reconnecting
          if (socket.connected) {
            socket.disconnect();
          }
          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect();
            }
          }, 1500);
        }
      });
    }
  }
  return socket;
}

export async function connectSocket(): Promise<Socket> {
  const s = await getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
}
