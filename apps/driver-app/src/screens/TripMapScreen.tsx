import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type MapPoint = {
  latitude: number;
  longitude: number;
};

type ActiveBooking = {
  booking_id: string;
  booking_status?: string | null;
  pickup_address?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  drop_address?: string | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  quoted_amount?: number | null;
  vehicle_type_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
};

type DispatchState = {
  active_booking: ActiveBooking | null;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const DEFAULT_LAGOS = {
  latitude: 6.5244,
  longitude: 3.3792,
};

function titleize(value?: string | null) {
  if (!value) return 'Standby';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function nextStatusAction(status?: string | null) {
  switch (status) {
    case 'driver_assigned':
      return { label: 'Start route', next: 'driver_en_route' };
    case 'driver_en_route':
      return { label: 'Mark arrived', next: 'driver_arrived' };
    case 'driver_arrived':
      return { label: 'Start tow', next: 'in_service' };
    case 'in_service':
      return { label: 'Complete trip', next: 'completed' };
    default:
      return null;
  }
}

function toPoint(lat?: number | null, lng?: number | null): MapPoint | null {
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng };
}

export default function TripMapScreen({ navigation }: { navigation: any }) {
  const mapRef = useRef<MapView>(null);

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [driverPoint, setDriverPoint] = useState<MapPoint | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  const loadState = async () => {
    const { data, error } = await supabase.rpc('get_driver_dispatch_state');

    if (error) throw error;

    const booking =
      data?.active_booking && data.active_booking.booking_id
        ? (data.active_booking as ActiveBooking)
        : null;

    setActiveBooking(booking);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await loadState();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load trip map');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadState().catch((error) => console.error(error));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startLocation = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      const granted = permission.status === 'granted';
      setHasLocationPermission(granted);

      if (!granted) {
        setDriverPoint(DEFAULT_LAGOS);
        setLocationReady(true);
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setDriverPoint({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (location) => {
          setDriverPoint({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      );

      setLocationReady(true);
    };

    startLocation().catch((error) => {
      console.error(error);
      setDriverPoint(DEFAULT_LAGOS);
      setLocationReady(true);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  const pickupPoint = useMemo(
    () => toPoint(activeBooking?.pickup_lat, activeBooking?.pickup_lng),
    [activeBooking]
  );

  const dropPoint = useMemo(
    () => toPoint(activeBooking?.drop_lat, activeBooking?.drop_lng),
    [activeBooking]
  );

  const nextAction = useMemo(
    () => (activeBooking ? nextStatusAction(activeBooking.booking_status) : null),
    [activeBooking]
  );

  const targetPoint = useMemo(() => {
    if (!activeBooking) return null;

    if (
      activeBooking.booking_status === 'driver_assigned' ||
      activeBooking.booking_status === 'driver_en_route'
    ) {
      return pickupPoint;
    }

    return dropPoint;
  }, [activeBooking, pickupPoint, dropPoint]);

  useEffect(() => {
    const points = [driverPoint, pickupPoint, dropPoint].filter(Boolean) as MapPoint[];

    if (points.length === 0) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 120, right: 50, bottom: 320, left: 50 },
        animated: true,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [driverPoint, pickupPoint, dropPoint]);

  const updateBookingStatus = async (nextStatus: string) => {
    if (!activeBooking) return;

    try {
      setBusyKey(`status-${activeBooking.booking_id}-${nextStatus}`);

      const { data, error } = await supabase.rpc('update_driver_booking_status', {
        p_booking_id: activeBooking.booking_id,
        p_status: nextStatus,
      });

      if (error) throw error;
      if (!data?.success) {
        Alert.alert('Status update failed', data?.message || 'Could not update booking status.');
      }

      await loadState();

      if (nextStatus === 'completed') {
        Alert.alert('Trip completed', 'The towing trip has been completed successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error) {
      Alert.alert('Status update failed', error instanceof Error ? error.message : 'Could not update booking status');
    } finally {
      setBusyKey(null);
    }
  };

  const openExternalNavigation = async () => {
    if (!targetPoint && !driverPoint) {
      Alert.alert('Location unavailable', 'There is no location available to open.');
      return;
    }

    const destinationPoint = targetPoint || driverPoint;
    if (!destinationPoint) return;

    const origin = driverPoint
      ? `${driverPoint.latitude},${driverPoint.longitude}`
      : undefined;

    const destination = `${destinationPoint.latitude},${destinationPoint.longitude}`;

    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Navigation failed', 'Could not open external navigation.');
    }
  };

  const recenterMap = () => {
    const points = [driverPoint, pickupPoint, dropPoint].filter(Boolean) as MapPoint[];
    if (points.length === 0) return;

    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 120, right: 50, bottom: 320, left: 50 },
      animated: true,
    });
  };

  const callCustomer = async () => {
    const phone = activeBooking?.customer_phone;
    if (!phone) {
      Alert.alert('No phone number', 'Customer phone number is not available yet.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('Call failed', 'Could not open the dialer.');
    }
  };

  if (loading || !locationReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: driverPoint?.latitude ?? DEFAULT_LAGOS.latitude,
            longitude: driverPoint?.longitude ?? DEFAULT_LAGOS.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
        >
          {driverPoint ? (
            <>
              <Marker coordinate={driverPoint} title="Driver location">
                <View style={styles.driverMarker}>
                  <Ionicons name="car-sport" size={14} color="#ffffff" />
                </View>
              </Marker>

              {!activeBooking ? (
                <Circle
                  center={driverPoint}
                  radius={2500}
                  strokeColor="rgba(37,99,235,0.45)"
                  fillColor="rgba(37,99,235,0.12)"
                />
              ) : null}
            </>
          ) : null}

          {pickupPoint ? (
            <Marker coordinate={pickupPoint} title="Pickup">
              <View style={styles.pickupMarker}>
                <Ionicons name="locate" size={14} color="#ffffff" />
              </View>
            </Marker>
          ) : null}

          {dropPoint ? (
            <Marker coordinate={dropPoint} title="Dropoff">
              <View style={styles.dropMarker}>
                <Ionicons name="flag" size={14} color="#ffffff" />
              </View>
            </Marker>
          ) : null}

          {pickupPoint && dropPoint ? (
            <Polyline
              coordinates={[pickupPoint, dropPoint]}
              strokeColor="#94a3b8"
              strokeWidth={3}
              lineDashPattern={[8, 6]}
            />
          ) : null}

          {driverPoint && targetPoint ? (
            <Polyline
              coordinates={[driverPoint, targetPoint]}
              strokeColor="#2563eb"
              strokeWidth={5}
            />
          ) : null}
        </MapView>

        <View style={styles.topBar}>
          <Pressable style={styles.circleButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>

          <View style={styles.topInfoCard}>
            <Text style={styles.topInfoEyebrow}>
              {activeBooking ? 'Live trip map' : 'Standby map'}
            </Text>
            <Text style={styles.topInfoTitle}>
              {activeBooking?.vehicle_type_name || 'Ready for dispatch'}
            </Text>
            <Text style={styles.topInfoSubtitle}>
              {activeBooking ? titleize(activeBooking.booking_status) : hasLocationPermission ? 'Live driver position visible' : 'Location permission not granted'}
            </Text>
          </View>

          <Pressable style={styles.circleButton} onPress={recenterMap}>
            <Ionicons name="locate-outline" size={20} color="#0f172a" />
          </Pressable>
        </View>

        <View style={styles.bottomCard}>
          {activeBooking ? (
            <>
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Pickup</Text>
                <Text style={styles.addressValue}>{activeBooking.pickup_address || 'Pickup not available'}</Text>
              </View>

              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Dropoff</Text>
                <Text style={styles.addressValue}>{activeBooking.drop_address || 'Dropoff not available'}</Text>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>Customer: {activeBooking.customer_name || 'Customer'}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>${Number(activeBooking.quoted_amount || 0).toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={openExternalNavigation}>
                  <Ionicons name="navigate-outline" size={16} color="#1d4ed8" />
                  <Text style={styles.secondaryButtonText}>Open navigation</Text>
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={callCustomer}>
                  <Ionicons name="call-outline" size={16} color="#1d4ed8" />
                  <Text style={styles.secondaryButtonText}>Call customer</Text>
                </Pressable>
              </View>

              {nextAction ? (
                <Pressable
                  style={styles.primaryButton}
                  disabled={busyKey === `status-${activeBooking.booking_id}-${nextAction.next}`}
                  onPress={() => updateBookingStatus(nextAction.next)}
                >
                  <Text style={styles.primaryButtonText}>
                    {busyKey === `status-${activeBooking.booking_id}-${nextAction.next}`
                      ? 'Updating...'
                      : nextAction.label}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={styles.footerNote}>
                In-app traffic-aware routing comes next when the paid map routing layer is enabled.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.standbyTitle}>Standby map active</Text>
              <Text style={styles.standbyText}>
                This screen now shows the driver’s live position even without an active booking. Once a job is assigned, pickup and dropoff markers will appear here automatically.
              </Text>

              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    {hasLocationPermission ? 'Location ready' : 'Location permission needed'}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>Mode: Standby</Text>
                </View>
              </View>

              <Pressable style={styles.primaryButton} onPress={openExternalNavigation}>
                <Text style={styles.primaryButtonText}>Open standby navigation</Text>
              </Pressable>

              <Text style={styles.footerNote}>
                When a booking is accepted, this screen will switch into full trip mode automatically.
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  topInfoCard: {
    flex: 1,
    marginHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadowCard,
  },
  topInfoEyebrow: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  topInfoTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  topInfoSubtitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  pickupMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  dropMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  driverMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 26,
    padding: 18,
    ...shadowCard,
  },
  standbyTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  standbyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  addressBlock: {
    marginBottom: 12,
  },
  addressLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  metaPill: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  metaPillText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 8,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  footerNote: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
});
