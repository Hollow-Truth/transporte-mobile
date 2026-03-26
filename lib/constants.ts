// ============================================
// Configuración centralizada - App Conductores
// ============================================

// ====== CONFIGURACIÓN DE SERVIDOR ======
// LOCAL:
// export const API_URL = 'http://192.168.100.241:3000/api';
// export const SOCKET_URL = 'http://192.168.100.241:3000';

// CLOUDFLARED: Pruebas en calle
export const API_URL = 'https://mem-constitutional-tribe-symantec.trycloudflare.com/api';
export const SOCKET_URL = 'https://mem-constitutional-tribe-symantec.trycloudflare.com';

// RAILWAY: Producción
// export const API_URL = 'https://transporte-api-production-0096.up.railway.app/api';
// export const SOCKET_URL = 'https://transporte-api-production-0096.up.railway.app';

// Tema de colores - Consistente con la web (#1e3a8a azul)
export const COLORS = {
  // Primarios app conductor (azul)
  primary: '#1e3a8a',
  primaryLight: '#3b82f6',
  primaryDark: '#1e2a5e',
  primaryBg: '#eff6ff',
  primaryBgLight: '#dbeafe',

  // Neutros
  white: '#ffffff',
  bg: '#f8fafc',
  bgCard: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  // Estados
  success: '#16a34a',
  successBg: '#dcfce7',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  warning: '#f59e0b',
  warningBg: '#fef3c7',

  // Marcadores del mapa
  markerStart: '#16a34a',
  markerEnd: '#dc2626',
  markerSchool: '#1e3a8a',
  markerStudent: '#f97316',
  markerBus: '#7c3aed',
  route: '#3b82f6',
  routeTraveled: '#1e3a8a',
} as const;

// Coordenadas del colegio
export const SCHOOL = {
  latitude: -17.38914530406023,
  longitude: -66.31402713529513,
  name: 'Colegio Adventista de Bolivia',
} as const;

// Background location task name
export const BG_LOCATION_TASK = 'bg-gps-tracking';
