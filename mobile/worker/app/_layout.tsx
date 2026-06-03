import { AuthProvider, useAuth } from '@/auth';
import { colors } from '@/theme';
import { Loading } from '@/ui';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === 'login';
    const onOnboarding = segments[0] === 'onboarding';
    if (!user && !inAuth) {
      router.replace('/login');
    } else if (user && inAuth) {
      router.replace('/');
    } else if (user && !user.workerProfile && !onOnboarding) {
      router.replace('/onboarding');
    } else if (user && user.workerProfile && onOnboarding) {
      router.replace('/');
    }
  }, [user, loading, segments]);

  if (loading) return <Loading />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

export default function RootLayout() {
  // Icon font is embedded natively (android/app/src/main/assets/fonts/Ionicons.ttf).
  // Kick off a background load too, but never block the UI on it.
  useFonts(Ionicons.font);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
