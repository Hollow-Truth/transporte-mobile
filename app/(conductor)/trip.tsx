import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import NetInfo from '@react-native-community/netinfo';
import api from '../../lib/api';
import { getUser } from '../../lib/auth';
import { getSocket, connectSocket, disconnectSocket } from '../../lib/socket';
import { enqueueGpsPoint, flushQueue, getQueueSize } from '../../lib/gps-queue';
import { SCHOOL, BG_LOCATION_TASK } from '../../lib/constants';
import { Ionicons } from '@expo/vector-icons';

// Module-level var shared with background task (cannot use React state in TaskManager callback)
let _bgVehicleId: string | null = null;

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  if (!data || !_bgVehicleId) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[locations.length - 1];
  if (!loc) return;

  // Use GPS queue - auto-buffers when offline, sends when online
  await enqueueGpsPoint({
    vehiculoId: _bgVehicleId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    velocidad: loc.coords.speed || 0,
    precision: loc.coords.accuracy || 0,
  });
});

interface Position {
  latitude: number;
  longitude: number;
}

interface RouteData {
  id: string;
  inicioLat: number;
  inicioLng: number;
  inicioNombre: string;
  destinoLat: number;
  destinoLng: number;
  destinoNombre: string;
  geometria: any;
  estudiantes: { id: string; nombre: string; apellido: string; latitud: number; longitud: number }[];
}

function parseGeometry(geom: any): Position[] {
  if (!geom) return [];
  if (geom.type === 'LineString' && geom.coordinates) {
    return geom.coordinates.map((c: number[]) => ({
      latitude: c[1],
      longitude: c[0],
    }));
  }
  if (typeof geom === 'string') {
    const match = geom.match(/LINESTRING\s*\((.+)\)/i);
    if (match) {
      return match[1].split(',').map((pair: string) => {
        const [lng, lat] = pair.trim().split(/\s+/).map(Number);
        return { latitude: lat, longitude: lng };
      });
    }
  }
  return [];
}

export default function TripScreen() {
  const [tripActive, setTripActive] = useState(false);
  const [trajectoryId, setTrajectoryId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [currentPos, setCurrentPos] = useState<Position | null>(null);
  const [path, setPath] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [queuedPoints, setQueuedPoints] = useState(0);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<MapView | null>(null);

  // Obtener vehículo y ruta del conductor
  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
        if (!user) return;
        const res = await api.get('/vehicles');
        const myVehicle = res.data.find(
          (v: any) => v.conductor?.id === user.id
        );
        if (myVehicle) {
          setVehicleId(myVehicle.id);

          // Cargar ruta asignada
          const routesRes = await api.get('/routes');
          const myRoute = routesRes.data.find(
            (r: any) => r.vehiculo?.id === myVehicle.id
          );
          if (myRoute) {
            const detail = await api.get(`/routes/${myRoute.id}`);
            setRouteData(detail.data);
          }

          // Verificar si hay trayectoria activa
          try {
            const activeRes = await api.get(
              `/gps/trajectory/${myVehicle.id}/active`
            );
            if (activeRes.data && activeRes.data.id) {
              setTrajectoryId(activeRes.data.id);
              setTripActive(true);
            }
          } catch {
            // No hay trayectoria activa
          }
        }
      } catch {
        // error loading vehicle
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Timer para tiempo transcurrido
  useEffect(() => {
    if (tripActive) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tripActive]);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      setIsOnline(online);
      if (online && tripActive) {
        // Network recovered - flush any queued GPS points
        flushQueue().then(() => setQueuedPoints(getQueueSize()));
      }
    });
    return () => unsubscribe();
  }, [tripActive]);

  // Update queued points count periodically during trip
  useEffect(() => {
    if (!tripActive) return;
    const interval = setInterval(() => {
      setQueuedPoints(getQueueSize());
    }, 5000);
    return () => clearInterval(interval);
  }, [tripActive]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTrip = async () => {
    if (!vehicleId) {
      Alert.alert('Error', 'No se encontró tu vehículo');
      return;
    }

    setStarting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la ubicación');
        setStarting(false);
        return;
      }

      // Request background permission for when app goes to background
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        Alert.alert('Aviso', 'Sin permiso de ubicación en segundo plano. El GPS se pausará si sales de la app.');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const startPos = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setCurrentPos(startPos);
      setPath([startPos]);

      const res = await api.post('/gps/trajectory/start', {
        vehiculoId: vehicleId,
        rutaId: routeData?.id,
        lat: startPos.latitude,
        lng: startPos.longitude,
      });
      setTrajectoryId(res.data.id);
      setTripActive(true);

      // Show schedule warnings if any
      if (res.data.advertencias?.length) {
        Alert.alert('Advertencia', res.data.advertencias.join('\n'));
      }

      const socket = await connectSocket();

      // Join own vehicle room so gateway can relay updates
      socket.emit('join:vehicle', { vehiculoId: vehicleId });

      // Start background location updates (sends GPS via HTTP even when app is in background)
      _bgVehicleId = vehicleId;
      try {
        const bgRunning = await TaskManager.isTaskRegisteredAsync(BG_LOCATION_TASK);
        if (!bgRunning) {
          await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 8000,
            distanceInterval: 10,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Transporte Escolar',
              notificationBody: 'Viaje en curso - GPS activo',
              notificationColor: '#1e3a8a',
            },
          });
        }
      } catch {
        // background location unavailable - foreground GPS will continue
      }

      locationSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (loc) => {
          // Skip low-accuracy points (>30m)
          if (loc.coords.accuracy && loc.coords.accuracy > 30) return;

          const pos = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setCurrentPos(pos);
          setPath((prev) => {
            // Filter out GPS jitter: skip if distance < 3m from last point
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const dlat = (pos.latitude - last.latitude) * 111320;
              const dlng = (pos.longitude - last.longitude) * 111320 * Math.cos(pos.latitude * Math.PI / 180);
              const dist = Math.sqrt(dlat * dlat + dlng * dlng);
              if (dist < 3) return prev; // less than 3m, skip
            }
            return [...prev, pos];
          });

          mapRef.current?.animateToRegion(
            {
              ...pos,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            500
          );

          // Send GPS via queue (auto-buffers when offline)
          const sent = await enqueueGpsPoint({
            vehiculoId: vehicleId,
            lat: pos.latitude,
            lng: pos.longitude,
            velocidad: loc.coords.speed || 0,
            precision: loc.coords.accuracy || 0,
          });
          setQueuedPoints(getQueueSize());

          // Also emit via WebSocket for real-time tracking (best-effort)
          try {
            const s = await getSocket();
            if (s.connected) {
              s.emit('gps:update', {
                vehiculoId: vehicleId,
                lat: pos.latitude,
                lng: pos.longitude,
                velocidad: loc.coords.speed || 0,
              });
            }
          } catch {
            // Socket not available - GPS was already queued via HTTP
          }
        }
      );
    } catch (error: any) {
      const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error');
      const msg = isNetworkError
        ? 'Sin conexión a internet. Verifica tu red e intenta de nuevo.'
        : (error.response?.data?.message || 'No se pudo iniciar el viaje');
      Alert.alert('No se puede iniciar', msg);
    } finally {
      setStarting(false);
    }
  };

  const stopTrip = () => {
    Alert.alert(
      'Finalizar Viaje',
      '¿Estás seguro de que quieres finalizar el viaje?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (locationSub.current) {
                locationSub.current.remove();
                locationSub.current = null;
              }
              // Stop background location
              _bgVehicleId = null;
              try {
                const bgRunning = await TaskManager.isTaskRegisteredAsync(BG_LOCATION_TASK);
                if (bgRunning) {
                  await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
                }
              } catch {}

              // End trajectory on server (retry-safe via axios interceptor)
              if (trajectoryId) {
                try {
                  await api.post(`/gps/trajectory/${trajectoryId}/end`);
                } catch {
                  // Still stop locally - server will auto-close stale trajectories
                }
              }

              // Flush any remaining queued GPS points
              flushQueue();

              // Notificar al servidor antes de desconectar
              const s = await getSocket().catch(() => null);
              if (s) {
                s.emit('leave:vehicle', { vehiculoId: vehicleId });
                s.off();
              }
              disconnectSocket();

              setTripActive(false);
              setTrajectoryId(null);
              setPath([]);
              setCurrentPos(null);
              setQueuedPoints(0);
              Alert.alert('Viaje finalizado', 'El viaje se ha registrado correctamente');
            } catch {
              Alert.alert('Error', 'No se pudo finalizar el viaje');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
      }
      // Socket NO se desconecta en unmount — el viaje puede continuar en background.
      // disconnectSocket() se llama solo en stopTrip() cuando el viaje termina.
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  if (!vehicleId) {
    return (
      <View style={styles.center}>
        <Ionicons name="bus" size={60} color="#64748b" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Sin vehículo</Text>
        <Text style={styles.emptyText}>
          No tienes un vehículo asignado para iniciar viajes.
        </Text>
      </View>
    );
  }

  // Parsear geometría de la ruta asignada
  const routeCoords = routeData ? parseGeometry(routeData.geometria) : [];

  // Calcular región inicial del mapa
  const allPoints: Position[] = [];
  if (routeData?.inicioLat && routeData?.inicioLng) {
    allPoints.push({ latitude: routeData.inicioLat, longitude: routeData.inicioLng });
  }
  if (routeData?.destinoLat && routeData?.destinoLng) {
    allPoints.push({ latitude: routeData.destinoLat, longitude: routeData.destinoLng });
  }
  routeData?.estudiantes?.forEach((s) => {
    if (s.latitud && s.longitud) {
      allPoints.push({ latitude: s.latitud, longitude: s.longitud });
    }
  });
  allPoints.push({ latitude: SCHOOL.latitude, longitude: SCHOOL.longitude });
  if (routeCoords.length > 0) {
    allPoints.push(routeCoords[0]);
    allPoints.push(routeCoords[routeCoords.length - 1]);
  }

  const lats = allPoints.map((p) => p.latitude).filter(Boolean);
  const lngs = allPoints.map((p) => p.longitude).filter(Boolean);

  const initialRegion = lats.length > 0
    ? {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.5 || 0.02,
        longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.5 || 0.02,
      }
    : {
        latitude: currentPos?.latitude || -17.3895,
        longitude: currentPos?.longitude || -66.1568,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        followsUserLocation={tripActive}
      >
        {/* Línea de la ruta asignada (azul claro) */}
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#93c5fd"
            strokeWidth={5}
          />
        )}

        {/* Ruta recorrida en tiempo real (azul oscuro) */}
        {path.length > 1 && (
          <Polyline
            coordinates={path}
            strokeColor="#1e3a8a"
            strokeWidth={4}
          />
        )}

        {/* Punto de inicio (verde) */}
        {routeData?.inicioLat && routeData?.inicioLng ? (
          <Marker
            coordinate={{
              latitude: routeData.inicioLat,
              longitude: routeData.inicioLng,
            }}
            title={routeData.inicioNombre || 'Inicio'}
            pinColor="green"
          />
        ) : null}

        {/* Punto de destino (rojo) */}
        {routeData?.destinoLat && routeData?.destinoLng ? (
          <Marker
            coordinate={{
              latitude: routeData.destinoLat,
              longitude: routeData.destinoLng,
            }}
            title={routeData.destinoNombre || 'Destino'}
            pinColor="red"
          />
        ) : null}

        {/* Colegio (azul) */}
        <Marker
          coordinate={{
            latitude: SCHOOL.latitude,
            longitude: SCHOOL.longitude,
          }}
          title={SCHOOL.name}
          pinColor="blue"
        />

        {/* Estudiantes (naranja) */}
        {routeData?.estudiantes?.map((student) => (
          <Marker
            key={student.id}
            coordinate={{
              latitude: student.latitud,
              longitude: student.longitud,
            }}
            title={`${student.nombre} ${student.apellido || ''}`}
            pinColor="orange"
          />
        ))}

        {/* Posición actual del conductor */}
        {currentPos && (
          <Marker
            coordinate={currentPos}
            title="Mi posición"
            pinColor="violet"
          />
        )}
      </MapView>

      {/* Panel inferior */}
      <View style={styles.bottomPanel}>
        {tripActive ? (
          <>
            {/* Network status banner */}
            {!isOnline && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  Sin conexión - GPS guardándose localmente ({queuedPoints} en cola)
                </Text>
              </View>
            )}
            {isOnline && queuedPoints > 0 && (
              <View style={styles.syncBanner}>
                <Text style={styles.syncBannerText}>
                  Sincronizando {queuedPoints} puntos pendientes...
                </Text>
              </View>
            )}
            <View style={styles.tripInfo}>
              <View style={styles.tripStat}>
                <Text style={styles.statLabel}>Tiempo</Text>
                <Text style={styles.statValue}>{formatTime(elapsed)}</Text>
              </View>
              <View style={styles.tripStat}>
                <Text style={styles.statLabel}>Puntos GPS</Text>
                <Text style={styles.statValue}>{path.length}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#16a34a' : '#f59e0b' }]}>
                <Text style={styles.statusText}>{isOnline ? 'EN VIAJE' : 'SIN RED'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.stopButton} onPress={stopTrip}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="stop" size={22} color="#fff" />
                <Text style={styles.stopButtonText}>Detener Viaje</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.readyText}>Listo para iniciar</Text>
            <Text style={styles.readySubtext}>
              Se activará el tracking GPS en tiempo real
            </Text>
            <TouchableOpacity
              style={[styles.goButton, starting && styles.buttonDisabled]}
              onPress={startTrip}
              disabled={starting}
            >
              {starting ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="play" size={26} color="#fff" />
                  <Text style={styles.goButtonText}>Iniciar Viaje</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
  map: {
    flex: 1,
  },
  bottomPanel: {
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tripStat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statusDot: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  readyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  readySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  goButton: {
    backgroundColor: '#16a34a',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  offlineBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  offlineBannerText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '600',
  },
  syncBanner: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  syncBannerText: {
    color: '#1e40af',
    fontSize: 13,
    fontWeight: '600',
  },
});
