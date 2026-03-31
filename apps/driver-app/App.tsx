import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import VerificationPendingScreen from './src/screens/VerificationPendingScreen';
import HomeScreen from './src/screens/HomeScreen';
import type { DriverRootStackParamList, DriverState, DriverVerificationStatus } from './src/types/app';

const Stack = createNativeStackNavigator<DriverRootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#06111F',
    card: '#06111F',
    text: '#ffffff',
    border: 'transparent',
    primary: '#16a34a',
  },
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [driverState, setDriverState] = useState<DriverState | null>(null);
  const [booting, setBooting] = useState(true);

  const loadDriverState = useCallback(async (activeSession?: Session | null) => {
    const currentSession = activeSession ?? (await supabase.auth.getSession()).data.session ?? null;

    if (!currentSession?.user) {
      setDriverState(null);
      setBooting(false);
      return;
    }

    const userId = currentSession.user.id;

    const [{ data: profileRow, error: profileError }, { data: driverRow, error: driverError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', userId)
        .single(),
      supabase
        .from('drivers')
        .select('verification_status, verified_badge, is_online, is_available')
        .eq('profile_id', userId)
        .single(),
    ]);

    if (profileError || driverError || !driverRow) {
      setDriverState({
        profile_id: userId,
        full_name: (currentSession.user.user_metadata?.full_name as string | undefined) ?? null,
        email: currentSession.user.email ?? null,
        phone: (currentSession.user.user_metadata?.phone as string | undefined) ?? null,
        verification_status: 'pending',
        verified_badge: false,
        is_online: false,
        is_available: false,
      });
      setBooting(false);
      return;
    }

    setDriverState({
      profile_id: userId,
      full_name: profileRow?.full_name ?? ((currentSession.user.user_metadata?.full_name as string | undefined) ?? null),
      email: profileRow?.email ?? currentSession.user.email ?? null,
      phone: profileRow?.phone ?? ((currentSession.user.user_metadata?.phone as string | undefined) ?? null),
      verification_status: (driverRow.verification_status as DriverVerificationStatus) ?? 'pending',
      verified_badge: Boolean(driverRow.verified_badge),
      is_online: Boolean(driverRow.is_online),
      is_available: Boolean(driverRow.is_available),
    });

    setBooting(false);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session) {
        loadDriverState(data.session);
      } else {
        setDriverState(null);
        setBooting(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);

      if (nextSession) {
        loadDriverState(nextSession);
      } else {
        setDriverState(null);
        setBooting(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadDriverState]);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Driver sign out failed:', error.message);
    }
  }, []);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: '#06111F' },
      animation: 'slide_from_right' as const,
    }),
    []
  );

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={styles.bootScreen}>
          <StatusBar barStyle="light-content" backgroundColor="#06111F" />
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#06111F" />
      <NavigationContainer theme={navTheme}>
        {!session ? (
          <Stack.Navigator initialRouteName="Welcome" screenOptions={screenOptions}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </Stack.Navigator>
        ) : driverState?.verification_status === 'approved' ? (
          <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="Home">
              {() => <HomeScreen driver={driverState} onRefresh={() => loadDriverState(session)} onSignOut={handleSignOut} />}
            </Stack.Screen>
          </Stack.Navigator>
        ) : (
          <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="Pending">
              {() =>
                driverState ? (
                  <VerificationPendingScreen
                    driver={driverState}
                    onRefresh={() => loadDriverState(session)}
                    onSignOut={handleSignOut}
                  />
                ) : null
              }
            </Stack.Screen>
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: '#06111F',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
