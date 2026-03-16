import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../../lib/api';
import { getUser } from '../../lib/auth';
import { COLORS } from '../../lib/constants';

interface StudentStatus {
  id: string;
  nombre: string;
  apellido: string;
  grado: string;
  direccion: string;
  latitud: number;
  longitud: number;
  ausente: boolean;
  motivoAusencia: string | null;
  abordaje: {
    timestamp: string;
    validado: boolean;
    distancia: number | null;
  } | null;
  descenso: {
    timestamp: string;
    validado: boolean;
  } | null;
}

interface GeofencingResult {
  distancia: number;
  validado: boolean;
  sospechoso: boolean;
  mensaje: string;
}

export default function AttendanceScreen() {
  const [students, setStudents] = useState<StudentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [vehiculoId, setVehiculoId] = useState<string | null>(null);
  const [rutaId, setRutaId] = useState<string | null>(null);
  const [trayectoriaId, setTrayectoriaId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const userData = await getUser();
      if (!userData) return;

      // Get conductor's vehicle
      const vehiclesRes = await api.get('/vehicles');
      const myVehicle = vehiclesRes.data.find(
        (v: any) => v.conductor?.id === userData.id || v.conductorId === userData.id,
      );

      if (!myVehicle) {
        setLoading(false);
        return;
      }

      setVehiculoId(myVehicle.id);

      // Get vehicle's route
      const routesRes = await api.get('/routes');
      const myRoute = routesRes.data.find(
        (r: any) => r.vehiculo?.id === myVehicle.id || r.vehiculoId === myVehicle.id,
      );

      if (!myRoute) {
        setLoading(false);
        return;
      }

      setRutaId(myRoute.id);

      // Check for active trajectory
      try {
        const trajRes = await api.get(`/gps/trajectory/${myVehicle.id}/active`);
        if (trajRes.data?.id) {
          setTrayectoriaId(trajRes.data.id);
        }
      } catch {}

      // Get route students status (attendance + absences for today)
      const statusRes = await api.get(
        `/attendance/route-status/${myRoute.id}/${myVehicle.id}`,
      );
      setStudents(statusRes.data);
    } catch {
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

  const registerAttendance = async (
    student: StudentStatus,
    evento: 'abordaje' | 'descenso',
  ) => {
    if (!vehiculoId) return;

    // If student is absent, warn
    if (student.ausente) {
      Alert.alert(
        'Estudiante ausente',
        `${student.nombre} fue marcado como ausente por su padre${student.motivoAusencia ? `: ${student.motivoAusencia}` : ''}. ¿Registrar de todos modos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Registrar',
            onPress: () => doRegister(student, evento),
          },
        ],
      );
      return;
    }

    await doRegister(student, evento);
  };

  const doRegister = async (
    student: StudentStatus,
    evento: 'abordaje' | 'descenso',
    manualOverride = false,
  ) => {
    setRegistering(`${student.id}-${evento}`);

    try {
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Se necesitan permisos de ubicación para registrar asistencia');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const res = await api.post('/attendance/register', {
        estudianteId: student.id,
        vehiculoId,
        trayectoriaId: trayectoriaId || undefined,
        evento,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        manualOverride,
      });

      const geofencing: GeofencingResult = res.data.geofencing;

      // Handle geofencing warning (50-100m)
      if (!geofencing.validado && !geofencing.sospechoso && !manualOverride) {
        Alert.alert(
          'Advertencia de proximidad',
          geofencing.mensaje + '\n\n¿Confirmar registro?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Confirmar',
              onPress: () => doRegister(student, evento, true),
            },
          ],
        );
        return;
      }

      // Handle suspicious (>100m)
      if (geofencing.sospechoso) {
        Alert.alert(
          'Registro sospechoso',
          geofencing.mensaje + '\n\nSe ha notificado al administrador.',
        );
      }

      // Refresh list
      await fetchData();
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || error?.message || 'Error al registrar';
      Alert.alert('Error', typeof msg === 'string' ? msg : String(msg));
    } finally {
      setRegistering(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando asistencia...</Text>
      </View>
    );
  }

  if (!vehiculoId || !rutaId) {
    return (
      <View style={styles.center}>
        <Ionicons name="clipboard-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
        <Text style={styles.emptyTitle}>Sin vehículo o ruta asignada</Text>
        <Text style={styles.emptyText}>
          Contacta al administrador para asignar un vehículo y ruta.
        </Text>
      </View>
    );
  }

  const totalStudents = students.length;
  const abordados = students.filter((s) => s.abordaje).length;
  const ausentes = students.filter((s) => s.ausente).length;
  const pendientes = totalStudents - abordados - ausentes;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: COLORS.primaryBgLight }]}>
          <Text style={[styles.statNum, { color: COLORS.primary }]}>{totalStudents}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: COLORS.successBg }]}>
          <Text style={[styles.statNum, { color: COLORS.success }]}>{abordados}</Text>
          <Text style={styles.statLabel}>Recogidos</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: COLORS.warningBg }]}>
          <Text style={[styles.statNum, { color: COLORS.warning }]}>{pendientes}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: COLORS.dangerBg }]}>
          <Text style={[styles.statNum, { color: COLORS.danger }]}>{ausentes}</Text>
          <Text style={styles.statLabel}>Ausentes</Text>
        </View>
      </View>

      {/* Student List */}
      {students.map((student) => {
        const isRegistering =
          registering === `${student.id}-abordaje` ||
          registering === `${student.id}-descenso`;

        return (
          <View
            key={student.id}
            style={[
              styles.card,
              student.ausente && styles.cardAbsent,
              student.abordaje && !student.descenso && styles.cardBoarded,
              student.descenso && styles.cardComplete,
            ]}
          >
            {/* Left accent */}
            <View
              style={[
                styles.cardAccent,
                {
                  backgroundColor: student.ausente
                    ? COLORS.danger
                    : student.descenso
                    ? COLORS.textMuted
                    : student.abordaje
                    ? COLORS.success
                    : COLORS.warning,
                },
              ]}
            />

            <View style={styles.cardContent}>
              {/* Header row */}
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: student.ausente
                        ? COLORS.dangerBg
                        : student.abordaje
                        ? COLORS.successBg
                        : COLORS.primaryBgLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      {
                        color: student.ausente
                          ? COLORS.danger
                          : student.abordaje
                          ? COLORS.success
                          : COLORS.primary,
                      },
                    ]}
                  >
                    {student.nombre.charAt(0)}
                    {student.apellido.charAt(0)}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>
                    {student.nombre} {student.apellido}
                  </Text>
                  <Text style={styles.studentGrade}>{student.grado}</Text>
                </View>

                {/* Status badges */}
                {student.ausente && (
                  <View style={[styles.badge, { backgroundColor: COLORS.dangerBg }]}>
                    <Text style={[styles.badgeText, { color: COLORS.danger }]}>AUSENTE</Text>
                  </View>
                )}
                {student.abordaje && !student.descenso && (
                  <View style={[styles.badge, { backgroundColor: COLORS.successBg }]}>
                    <Text style={[styles.badgeText, { color: COLORS.success }]}>A BORDO</Text>
                  </View>
                )}
                {student.descenso && (
                  <View style={[styles.badge, { backgroundColor: '#f1f5f9' }]}>
                    <Text style={[styles.badgeText, { color: COLORS.textMuted }]}>ENTREGADO</Text>
                  </View>
                )}
              </View>

              {/* Absence reason */}
              {student.ausente && student.motivoAusencia && (
                <View style={styles.absenceReason}>
                  <Text style={styles.absenceText}>
                    Motivo: {student.motivoAusencia}
                  </Text>
                </View>
              )}

              {/* Geofencing info */}
              {student.abordaje && student.abordaje.distancia !== null && (
                <View style={styles.geoInfo}>
                  <Ionicons
                    name={student.abordaje.validado ? 'checkmark-circle' : 'warning'}
                    size={14}
                    color={student.abordaje.validado ? COLORS.success : COLORS.warning}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.geoText}>
                    {student.abordaje.validado
                      ? `Validado (${Math.round(student.abordaje.distancia)}m)`
                      : `${Math.round(student.abordaje.distancia)}m del domicilio`}
                  </Text>
                </View>
              )}

              {/* Attendance time */}
              {student.abordaje && (
                <Text style={styles.timeText}>
                  Abordaje: {new Date(student.abordaje.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                  {student.descenso &&
                    ` | Descenso: ${new Date(student.descenso.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`}
                </Text>
              )}

              {/* Action buttons */}
              <View style={styles.actions}>
                {!student.abordaje && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnBoard]}
                    onPress={() => registerAttendance(student, 'abordaje')}
                    disabled={isRegistering}
                  >
                    {isRegistering && registering === `${student.id}-abordaje` ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>Marcar Abordaje</Text>
                    )}
                  </TouchableOpacity>
                )}

                {student.abordaje && !student.descenso && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnAlight]}
                    onPress={() => registerAttendance(student, 'descenso')}
                    disabled={isRegistering}
                  >
                    {isRegistering && registering === `${student.id}-descenso` ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>Marcar Descenso</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );
      })}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    padding: 24,
  },
  loadingText: { marginTop: 12, color: COLORS.textMuted, fontSize: 15 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAbsent: { opacity: 0.7 },
  cardBoarded: {},
  cardComplete: { opacity: 0.6 },
  cardAccent: {
    width: 5,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: { flex: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },

  // Avatar
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: { fontSize: 13, fontWeight: '800' },

  // Student
  studentName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  studentGrade: { fontSize: 12, color: COLORS.textSecondary },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Absence
  absenceReason: {
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 8,
  },
  absenceText: { fontSize: 12, color: COLORS.danger },

  // Geo
  geoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  geoText: { fontSize: 11, color: COLORS.textSecondary },

  // Time
  timeText: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8 },

  // Actions
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnBoard: { backgroundColor: COLORS.success },
  actionBtnAlight: { backgroundColor: COLORS.primary },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
