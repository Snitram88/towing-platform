import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { MapPoint, pointToRegion } from '../lib/booking';

type Props = {
  navigation: any;
  route: {
    params: {
      pickupAddress: string;
      pickupPoint: MapPoint;
      dropAddress: string;
      dropPoint: MapPoint;
      distanceKm: number;
      durationMin: number;
      estimate: number;
      vehicle: {
        id: string;
        name: string;
        tonnage_min: number;
        tonnage_max: number;
        base_fare: number;
        per_km_rate: number;
        per_min_rate: number;
      };
    };
  };
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

export default function BookingSummaryScreen({ navigation, route }: Props) {
  const { pickupAddress, pickupPoint, dropAddress, dropPoint, distanceKm, durationMin, estimate, vehicle } = route.params;
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async () => {
    setSubmitting(true);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!user) {
      setSubmitting(false);
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    const { data: bookingRow, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: user.id,
        vehicle_type_id: vehicle.id,
        booking_status: 'searching_driver',
        payment_status: 'unpaid',
        pickup_address: pickupAddress,
        pickup_lat: pickupPoint.latitude,
        pickup_lng: pickupPoint.longitude,
        drop_address: dropAddress,
        drop_lat: dropPoint.latitude,
        drop_lng: dropPoint.longitude,
        estimated_distance_meters: Math.round(distanceKm * 1000),
        estimated_duration_seconds: Math.round(durationMin * 60),
        quoted_amount: Number(estimate.toFixed(2)),
      })
      .select('id')
      .single();

    if (bookingError || !bookingRow) {
      setSubmitting(false);
      Alert.alert('Booking failed', bookingError?.message || 'Could not create booking.');
      return;
    }

    await supabase.from('booking_status_history').insert({
      booking_id: bookingRow.id,
      new_status: 'searching_driver',
      changed_by: user.id,
      note: 'Customer created booking from mobile app',
    });

    const { data: dispatchResult, error: dispatchError } = await supabase.rpc('dispatch_booking', {
      p_booking_id: bookingRow.id,
    });

    setSubmitting(false);

    if (dispatchError) {
      Alert.alert(
        'Booking created',
        'Your booking was created, but auto-dispatch could not start yet. Admin can still intervene.'
      );
    } else if ((dispatchResult?.offered_count ?? 0) === 0) {
      Alert.alert(
        'Booking created',
        'No approved online drivers were available right now. Your booking stays active while the system keeps searching.'
      );
    } else {
      Alert.alert(
        'Booking created',
        `Dispatch started and ${dispatchResult.offered_count} driver offer(s) were sent.`
      );
    }

    navigation.navigate('TrackingDemo', {
      bookingId: bookingRow.id,
      pickupAddress,
      pickupPoint,
      dropAddress,
      dropPoint,
      distanceKm,
      durationMin,
      estimate,
      vehicle,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>
          <Text style={styles.headerTitle}>Confirm order</Text>
          <View style={{ width: 42 }} />
        </View>

        <View style={styles.mapCard}>
          <MapView style={styles.map} initialRegion={pointToRegion(pickupPoint, 0.09)} region={pointToRegion(pickupPoint, 0.09)}>
            <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" />
            <Marker coordinate={dropPoint} title="Dropoff" pinColor="#2563eb" />
            <Polyline coordinates={[pickupPoint, dropPoint]} strokeColor="#2563eb" strokeWidth={4} />
          </MapView>

          <View style={styles.arrivalPill}>
            <Text style={styles.arrivalPillText}>Arrive by ~{durationMin} min</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Route</Text>
          <Text style={styles.routeLine}>{pickupAddress}</Text>
          <Text style={styles.routeArrow}>↓</Text>
          <Text style={styles.routeLine}>{dropAddress}</Text>

          <View style={styles.pillsRow}>
            <View style={styles.pill}>
              <Ionicons name="navigate-outline" size={14} color="#475569" />
              <Text style={styles.pillText}>{distanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="time-outline" size={14} color="#475569" />
              <Text style={styles.pillText}>{durationMin} min</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tow class</Text>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.vehicleTitle}>{vehicle.name}</Text>
              <Text style={styles.vehicleSubtitle}>
                Capacity {vehicle.tonnage_min}t - {vehicle.tonnage_max}t
              </Text>
            </View>

            <Text style={styles.totalPrice}>${estimate.toFixed(2)}</Text>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleRequest} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Request tow</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 18, paddingBottom: 30 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  mapCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 14,
    marginBottom: 16,
    ...shadowCard,
  },
  map: {
    width: '100%',
    height: 240,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
  },
  arrivalPill: {
    alignSelf: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  arrivalPillText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  cardTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  routeLine: { color: '#0f172a', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  routeArrow: { color: '#94a3b8', fontSize: 16, marginVertical: 8 },
  pillsRow: { flexDirection: 'row', marginTop: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  pillText: { color: '#334155', fontSize: 12, fontWeight: '800', marginLeft: 6 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  vehicleSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  totalPrice: { color: '#166534', fontSize: 24, fontWeight: '800' },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
