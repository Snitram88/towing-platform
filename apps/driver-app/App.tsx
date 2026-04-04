import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { supabase } from './src/lib/supabase';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import TripMapScreen from './src/screens/TripMapScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SupportScreen from './src/screens/SupportScreen';
import {
  deactivatePushToken,
  registerForPushNotificationsAsync,
  resolveNotificationTarget,
} from './src/lib/pushNotifications';

const Stack = createNativeStackNavigator<any>();
const navigationRef = createNavigationContainerRef<any>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#06111F',
    card: '#06111F',
    text: '#ffffff',
    border: 'transparent',
    primary: '#2563eb',
  },
};

function handleNotificationNavigation(data: unknown) {
  if (!navigationRef.isReady()) return;

  const target = resolveNotificationTarget(data);

  try {
    navigationRef.navigate(target.screen as never, (target.params ?? {}) as never);
  } catch (error) {
    console.log(
      '[notification-navigation]',
      error instanceof Error ? error.message : String(error)
    );
    navigationRef.navigate('Home' as never);
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const currentPushTokenRef = useRef<string | null>(null);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session ?? null);
        setBooting(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!nextSession && currentPushTokenRef.current) {
        await deactivatePushToken(currentPushTokenRef.current);
        currentPushTokenRef.current = null;
      }

      setSession(nextSession ?? null);
      setBooting(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const receivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log(
          '[notification-received]',
          notification.request.identifier,
          notification.request.content.title
        );
      });

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const id = response.notification.request.identifier;

        if (handledNotificationIdsRef.current.has(id)) return;
        handledNotificationIdsRef.current.add(id);

        handleNotificationNavigation(response.notification.request.content.data);
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function register() {
      if (!session?.user?.id) return;

      const result = await registerForPushNotificationsAsync(session.user.id, 'driver');

      if (!active) return;

      if (result.status === 'ok') {
        currentPushTokenRef.current = result.token;
        console.log('[push-registered]', result.token);
      } else {
        console.log('[push-registration]', result.status, result.message);
      }
    }

    void register();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

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
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        {session ? (
          <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Documents" component={DocumentsScreen} />
            <Stack.Screen name="TripMap" component={TripMapScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="Earnings" component={EarningsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator initialRouteName="Welcome" screenOptions={screenOptions}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
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
