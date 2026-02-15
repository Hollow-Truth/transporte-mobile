import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function ConductorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1e3a8a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          paddingBottom: 6,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mi Ruta',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>🗺️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: 'Viaje',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>📍</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Asistencia',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>📋</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>👤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
