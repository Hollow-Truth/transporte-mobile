import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../../lib/api';
import { getUser, logout, User } from '../../lib/auth';
import { COLORS } from '../../lib/constants';

interface Vehicle {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  capacidad: number;
  [key: string]: any; // año field has encoding variance
}

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const u = await getUser();
        setUser(u);

        if (u) {
          const res = await api.get('/vehicles');
          const myVehicle = res.data.find(
            (v: any) => v.conductor?.id === u.id
          );
          setVehicle(myVehicle || null);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar Sesión',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Avatar y nombre */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.nombre?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.nombre || 'Conductor'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.rolBadge}>
          <Text style={styles.rolText}>Conductor</Text>
        </View>
      </View>

      {/* Info del vehículo */}
      {vehicle ? (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="bus-outline" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Vehículo Asignado</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Placa</Text>
            <Text style={styles.infoValue}>{vehicle.placa}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Vehículo</Text>
            <Text style={styles.infoValue}>
              {vehicle.marca} {vehicle.modelo}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Color</Text>
            <Text style={styles.infoValue}>{vehicle.color}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Capacidad</Text>
            <Text style={styles.infoValue}>{vehicle.capacidad} pasajeros</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Año</Text>
            <Text style={styles.infoValue}>{vehicle['año'] || vehicle['anio'] || '-'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ionicons name="bus-outline" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Vehículo</Text>
          </View>
          <Text style={styles.noVehicle}>No tienes vehículo asignado</Text>
        </View>
      )}

      {/* Botón cerrar sesión */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
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
  },
  profileHeader: {
    backgroundColor: '#1e3a8a',
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  email: {
    fontSize: 14,
    color: '#93c5fd',
    marginTop: 4,
  },
  rolBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 10,
  },
  rolText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  noVehicle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  logoutButton: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
