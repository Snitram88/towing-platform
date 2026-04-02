import * as Location from 'expo-location';
import { supabase } from './supabase';

export type LocationSyncStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'denied'
  | 'error';

type StartDriverLocationSyncParams = {
  bookingId: string | null;
  onStatusChange?: (status: LocationSyncStatus) => void;
};

export async function startDriverLocationSync({
  bookingId,
  onStatusChange,
}: StartDriverLocationSyncParams): Promise<() => void> {
  let closed = false;
  let sending = false;

  const setStatus = (status: LocationSyncStatus) => {
    onStatusChange?.(status);
  };

  setStatus('starting');

  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== 'granted') {
    setStatus('denied');
    return () => {
      closed = true;
      setStatus('idle');
    };
  }

  const sendLocation = async (location: Location.LocationObject) => {
    if (closed || sending) return;

    sending = true;

    try {
      const { coords } = location;

      const { data, error } = await supabase.rpc('upsert_driver_location', {
        p_lat: coords.latitude,
        p_lng: coords.longitude,
        p_heading: typeof coords.heading === 'number' ? coords.heading : null,
        p_speed_mps: typeof coords.speed === 'number' ? coords.speed : null,
        p_accuracy_meters: typeof coords.accuracy === 'number' ? coords.accuracy : null,
        p_booking_id: bookingId,
      });

      if (error) {
        throw error;
      }

      if (data?.success === false) {
        throw new Error(data?.message || 'Location sync failed');
      }

      setStatus('active');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[driver-location-sync]', message);
      setStatus('error');
    } finally {
      sending = false;
    }
  };

  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    await sendLocation(current);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('[driver-location-initial]', message);
    setStatus('error');
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 7000,
      distanceInterval: 15,
    },
    (location) => {
      void sendLocation(location);
    }
  );

  return () => {
    closed = true;
    subscription.remove();
    setStatus('idle');
  };
}
