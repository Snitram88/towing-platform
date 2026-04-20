import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/lib/supabase';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WalletScreen from './src/screens/WalletScreen';

const Stack = createNativeStackNavigator<any>();
const Tab = createBottomTabNavigator<any>();

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

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function normalizeRole(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function isCustomerRole(value?: string | null) {
  const role = normalizeRole(value);
  if (!role) return false;
  if (role === 'customer') return true;
  return role.includes('customer');
}

function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: '#06111F' },
        tabBarActiveTintColor: '#0f172a',
        tabBarInactiveTintColor: '#64748b',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 74,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          marginBottom: 4,
        },
        tabBarLabel:
          route.name === 'History'
            ? 'Rides'
            : route.name === 'Profile'
            ? 'Account'
            : 'Home',
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AccessDeniedScreen({
  message,
  onSignOut,
}: {
  message: string;
  onSignOut: () => Promise<void>;
}) {
  const [signingOut, setSigningOut] = useState(false);

  const handlePress = async () => {
    try {
      setSigningOut(true);
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.deniedWrap}>
        <View style={styles.deniedCard}>
          <Text style={styles.deniedEyebrow}>Customer app access</Text>
          <Text style={styles.deniedTitle}>This account is not a customer account</Text>
          <Text style={styles.deniedText}>{message}</Text>

          <Pressable
            style={[styles.deniedButton, signingOut && { opacity: 0.7 }]}
            onPress={handlePress}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.deniedButtonText}>Sign out</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [customerAllowed, setCustomerAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState(
    'Please sign in with an account that is registered for the customer app.'
  );

  const resolveAccess = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession) {
      setCustomerAllowed(false);
      setAccessChecked(true);
      setBooting(false);
      return;
    }

    try {
      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (error) throw error;

      const role = profileRow?.role ?? null;

      if (isCustomerRole(role)) {
        setCustomerAllowed(true);
        setAccessMessage('');
      } else {
        setCustomerAllowed(false);
        setAccessMessage(
          role
            ? `This signed-in account is registered as "${role}" and cannot enter the customer app. Please use a customer account instead.`
            : 'This signed-in account is not configured for the customer app yet.'
        );
      }
    } catch (error) {
      setCustomerAllowed(false);
      setAccessMessage(
        error instanceof Error
          ? error.message
          : 'We could not verify customer access for this account.'
      );
    } finally {
      setAccessChecked(true);
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        void resolveAccess(data.session ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        void resolveAccess(nextSession ?? null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [resolveAccess]);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  }, []);

  const authScreenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: '#06111F' },
      animation: 'slide_from_right' as const,
    }),
    []
  );

  if (booting || (session && !accessChecked)) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={styles.bootScreen}>
            <StatusBar barStyle="light-content" backgroundColor="#06111F" />
            <ActivityIndicator color="#ffffff" size="large" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <NavigationContainer theme={navTheme}>
          {!session ? (
            <Stack.Navigator initialRouteName="Welcome" screenOptions={authScreenOptions}>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="SignIn" component={SignInScreen} />
              <Stack.Screen name="SignUp" component={SignUpScreen} />
            </Stack.Navigator>
          ) : !customerAllowed ? (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="CustomerAccessDenied">
                {() => (
                  <AccessDeniedScreen
                    message={accessMessage}
                    onSignOut={handleSignOut}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="MainTabs" component={CustomerTabs} />
              <Stack.Screen name="Wallet" component={WalletScreen} />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06111F',
  },
  bootScreen: {
    flex: 1,
    backgroundColor: '#06111F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedWrap: {
    flex: 1,
    padding: 18,
    justifyContent: 'center',
  },
  deniedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 22,
    ...shadowCard,
  },
  deniedEyebrow: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  deniedTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 10,
  },
  deniedText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  deniedButton: {
    backgroundColor: '#dc2626',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deniedButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
