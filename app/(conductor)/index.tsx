import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import { getUser } from '../../lib/auth';
import { SCHOOL } from '../../lib/constants';

interface Student {
  id: string;
  nombre: string;
  apellido: string;
  latitud: number;
  longitud: number;
  direccion: string;
}

interface RoutePunto {
  lat: number;
  lng: number;
  nombre: string;
  orden: number;
  tipo: string;
  id: string;
}

interface Route {
  id: string;
  nombre: string;
  descripcion: string;
  inicioLat: number;
  inicioLng: number;
  inicioNombre: string;
  destinoLat: number;
  destinoLng: number;
  destinoNombre: string;
  geometria: any;
  puntos: RoutePunto[];
  estudiantes: Student[];
}

interface Vehicle {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
}

// Parsear geometría WKT LINESTRING a coordenadas
function parseGeometry(geom: any): { latitude: number; longitude: number }[] {
  if (!geom) return [];

  // Si es objeto GeoJSON
  if (geom.type === 'LineString' && geom.coordinates) {
    return geom.coordinates.map((c: number[]) => ({
      latitude: c[1],
      longitude: c[0],
    }));
  }

  // Si es string WKT
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

export default function DashboardScreen() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) return;

      // Obtener vehículos y buscar el del conductor
      const vehiclesRes = await api.get('/vehicles');
      const myVehicle = vehiclesRes.data.find(
        (v: any) => v.conductor?.id === user.id
      );

      if (!myVehicle) {
        setVehicle(null);
        setRoute(null);
        return;
      }

      setVehicle(myVehicle);

      // Obtener rutas y buscar la asignada al vehículo
      const routesRes = await api.get('/routes');
      const myRoute = routesRes.data.find(
        (r: any) => r.vehiculo?.id === myVehicle.id
      );

      if (myRoute) {
        const routeDetail = await api.get(`/routes/${myRoute.id}`);
        setRoute(routeDetail.data);
      }
    } catch {
      // error fetching data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const focusStudent = (lat: number, lng: number) => {
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      800
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Cargando tu ruta...</Text>
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={styles.center}>
        <Ionicons name="bus" size={60} color="#64748b" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Sin vehículo asignado</Text>
        <Text style={styles.emptyText}>
          No tienes un vehículo asignado. Contacta al administrador.
        </Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View style={styles.center}>
        <Ionicons name="map" size={60} color="#64748b" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Sin ruta asignada</Text>
        <Text style={styles.emptyText}>
          Tu vehículo ({vehicle.placa}) no tiene una ruta asignada.
        </Text>
      </View>
    );
  }

  // Parsear geometría de la ruta
  const routeCoords = parseGeometry(route.geometria);

  // Calcular región del mapa con todos los puntos
  const allCoords = [
    ...(route.estudiantes || []).map((s) => ({
      latitude: s.latitud,
      longitude: s.longitud,
    })),
    { latitude: SCHOOL.latitude, longitude: SCHOOL.longitude },
  ];

  if (route.inicioLat && route.inicioLng) {
    allCoords.push({ latitude: route.inicioLat, longitude: route.inicioLng });
  }
  if (route.destinoLat && route.destinoLng) {
    allCoords.push({ latitude: route.destinoLat, longitude: route.destinoLng });
  }
  // Incluir puntos de la geometría para calcular bounds
  if (routeCoords.length > 0) {
    allCoords.push(routeCoords[0]);
    allCoords.push(routeCoords[routeCoords.length - 1]);
  }

  const lats = allCoords.map((c) => c.latitude).filter(Boolean);
  const lngs = allCoords.map((c) => c.longitude).filter(Boolean);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const region = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: (maxLat - minLat) * 1.5 || 0.02,
    longitudeDelta: (maxLng - minLng) * 1.5 || 0.02,
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Info del vehículo */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="bus" size={16} color="#1e293b" />
          <Text style={styles.cardTitle}>Mi Vehículo</Text>
        </View>
        <Text style={styles.cardText}>
          {vehicle.marca} {vehicle.modelo} • {vehicle.color}
        </Text>
        <Text style={styles.plate}>{vehicle.placa}</Text>
      </View>

      {/* Info de la ruta */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="map" size={16} color="#1e293b" />
          <Text style={styles.cardTitle}>{route.nombre}</Text>
        </View>
        {route.descripcion ? (
          <Text style={styles.cardText}>{route.descripcion}</Text>
        ) : null}
        <Text style={styles.studentCount}>
          {route.estudiantes?.length || 0} estudiantes
        </Text>
        {route.inicioNombre ? (
          <View style={styles.routeInfoRow}>
            <Ionicons name="location" size={13} color="#475569" />
            <Text style={styles.routeInfo}>Inicio: {route.inicioNombre}</Text>
          </View>
        ) : null}
        {route.destinoNombre ? (
          <View style={styles.routeInfoRow}>
            <Ionicons name="flag" size={13} color="#475569" />
            <Text style={styles.routeInfo}>Destino: {route.destinoNombre}</Text>
          </View>
        ) : null}
      </View>

      {/* Mapa */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
        >
          {/* Línea de la ruta (geometría) */}
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#1e3a8a"
              strokeWidth={4}
            />
          )}

          {/* Punto de inicio (verde) */}
          {route.inicioLat && route.inicioLng ? (
            <Marker
              coordinate={{
                latitude: route.inicioLat,
                longitude: route.inicioLng,
              }}
              title={route.inicioNombre || 'Inicio'}
              pinColor="green"
            />
          ) : null}

          {/* Punto de destino (rojo) */}
          {route.destinoLat && route.destinoLng ? (
            <Marker
              coordinate={{
                latitude: route.destinoLat,
                longitude: route.destinoLng,
              }}
              title={route.destinoNombre || 'Destino'}
              pinColor="red"
            />
          ) : null}

          {/* Marcador del colegio (azul) */}
          <Marker
            coordinate={{
              latitude: SCHOOL.latitude,
              longitude: SCHOOL.longitude,
            }}
            title={SCHOOL.name}
            pinColor="blue"
          />

          {/* Marcadores de estudiantes (naranja) */}
          {route.estudiantes?.map((student) => (
            <Marker
              key={student.id}
              coordinate={{
                latitude: student.latitud,
                longitude: student.longitud,
              }}
              title={`${student.nombre} ${student.apellido || ''}`}
              description={student.direccion}
              pinColor="orange"
            />
          ))}
        </MapView>
      </View>

      {/* Leyenda del mapa */}
      <View style={styles.legendCard}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
          <Text style={styles.legendText}>Inicio</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
          <Text style={styles.legendText}>Destino</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} />
          <Text style={styles.legendText}>Colegio</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
          <Text style={styles.legendText}>Estudiante</Text>
        </View>
      </View>

      {/* Lista de estudiantes */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="people" size={16} color="#1e293b" />
          <Text style={styles.cardTitle}>Estudiantes ({route.estudiantes?.length || 0})</Text>
        </View>
        {route.estudiantes?.map((student) => (
          <TouchableOpacity
            key={student.id}
            style={styles.studentRow}
            onPress={() => focusStudent(student.latitud, student.longitud)}
          >
            <View style={styles.studentDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.studentName}>
                {student.nombre} {student.apellido || ''}
              </Text>
              <Text style={styles.studentAddress}>{student.direccion}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Botón iniciar viaje */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={() => router.push('/(conductor)/trip')}
      >
        <View style={styles.cardTitleRow}>
          <Ionicons name="rocket" size={20} color="#fff" />
          <Text style={styles.startButtonText}>Iniciar Viaje</Text>
        </View>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cardText: {
    fontSize: 14,
    color: '#64748b',
  },
  plate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e3a8a',
    marginTop: 4,
  },
  studentCount: {
    fontSize: 14,
    color: '#1e3a8a',
    fontWeight: '600',
    marginTop: 4,
  },
  routeInfo: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  mapContainer: {
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    height: 300,
    elevation: 2,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  legendCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 10,
    elevation: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#64748b',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#eab308',
    marginRight: 12,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  studentAddress: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  arrow: {
    fontSize: 24,
    color: '#cbd5e1',
    fontWeight: '300',
  },
  startButton: {
    backgroundColor: '#16a34a',
    margin: 12,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
