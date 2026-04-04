import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type PushRegistrationResult =
  | { status: 'ok'; token: string }
  | { status: 'not-device'; message: string }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string };

const ALLOWED_SCREENS = new Set([
  'Home',
  'Documents',
  'TripMap',
  'History',
  'Earnings',
  'Profile',
  'Support',
]);

export async function registerForPushNotificationsAsync(
  userId: string,
  appRole: 'driver' | 'customer'
): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      status: 'not-device',
      message: 'Push notifications require a physical device.',
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const permissionResult = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResult.status;
  }

  if (finalStatus !== 'granted') {
    return {
      status: 'denied',
      message: 'Notification permission was not granted.',
    };
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    return {
      status: 'error',
      message: 'EAS projectId not found. Build the app with EAS or link the project first.',
    };
  }

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;

    const { error } = await supabase.rpc('register_push_device', {
      p_expo_push_token: token,
      p_platform: Platform.OS,
      p_app_role: appRole,
      p_device_name: Device.modelName ?? null,
    });

    if (error) {
      throw error;
    }

    return { status: 'ok', token };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not register push token.',
    };
  }
}

export async function deactivatePushToken(token: string | null | undefined) {
  if (!token) return;

  const { error } = await supabase.rpc('deactivate_push_device', {
    p_expo_push_token: token,
  });

  if (error) {
    console.log('[push-deactivate]', error.message);
  }
}

export function resolveNotificationTarget(
  rawData: unknown
): { screen: string; params?: Record<string, unknown> } {
  const data =
    rawData && typeof rawData === 'object'
      ? (rawData as Record<string, unknown>)
      : {};

  const requestedScreen =
    typeof data.screen === 'string' && ALLOWED_SCREENS.has(data.screen)
      ? data.screen
      : 'Home';

  const params =
    data.params && typeof data.params === 'object'
      ? (data.params as Record<string, unknown>)
      : undefined;

  return {
    screen: requestedScreen,
    params,
  };
}
