import { useEffect, useState, useCallback } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { isAuthenticated } from '../lib/auth';

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  const checkAuth = useCallback(async () => {
    const isAuth = await isAuthenticated();
    setAuthenticated(isAuth);
    setLoading(false);
  }, []);

  // Re-check auth every time segments change (after login/logout)
  useEffect(() => {
    checkAuth();
  }, [segments]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(conductor)';

    if (!authenticated && inAuthGroup) {
      router.replace('/login');
    } else if (authenticated && !inAuthGroup) {
      router.replace('/(conductor)');
    }
  }, [authenticated, segments, loading]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
});
