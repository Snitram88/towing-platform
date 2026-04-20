import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
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

type PaymentMethod = 'wallet' | 'paystack' | 'cash';

type WalletPreview = {
  balance: number;
  currency: string;
  ready: boolean;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function formatNaira(value?: number | null) {
  return `₦${Number(value || 0).toFixed(2)}`;
}

export default function BookingSummaryScreen({ navigation, route }: Props) {
  const {
    pickupAddress,
    pickupPoint,
    dropAddress,
    dropPoint,
    distanceKm,
    durationMin,
    estimate,
    vehicle,
  } = route.params;

  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paystack');
  const [walletPreview, setWalletPreview] = useState<WalletPreview>({
    balance: 0,
    currency: 'NGN',
    ready: false,
  });

  const normalizedEstimate = useMemo(() => Number(estimate.toFixed(2)), [estimate]);

  const loadWalletPreview = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return;

    const walletRes = await supabase
      .from('customer_wallets')
      .select('balance, currency')
      .eq('customer_id', user.id)
      .maybeSingle();

    if (!walletRes.error && walletRes.data) {
      setWalletPreview({
        balance: Number(walletRes.data.balance ?? 0),
        currency: walletRes.data.currency ?? 'NGN',
        ready: true,
      });
    } else {
      setWalletPreview({
        balance: 0,
        currency: 'NGN',
        ready: false,
      });
    }
  }, []);

  useEffect(() => {
    void loadWalletPreview();
  }, [loadWalletPreview]);

  const startBookingPaystackPayment = useCallback(async (bookingId: string) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error('No active session found. Please sign in again.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase app environment values.');
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/paystack-initialize-booking-payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        booking_id: bookingId,
      }),
    }
  );

  const responseJson = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      responseJson?.error ||
        responseJson?.message ||
        `Booking payment init failed with status ${response.status}`
    );
  }

  const authorizationUrl = responseJson?.authorization_url;

  if (!authorizationUrl) {
    throw new Error('No Paystack authorization URL was returned.');
  }

  return {
    authorizationUrl,
    reference: responseJson?.reference ?? null,
  };
}, []);

  const handleRequest = async () => {
    setSubmitting(true);

    try {
      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;

      if (!user) {
        Alert.alert('Session expired', 'Please sign in again.');
        return;
      }

      if (paymentMethod === 'wallet') {
        const walletRes = await supabase
          .from('customer_wallets')
          .select('balance, currency')
          .eq('customer_id', user.id)
          .maybeSingle();

        const liveWalletBalance = Number(walletRes.data?.balance ?? 0);

        if (liveWalletBalance < normalizedEstimate) {
          Alert.alert(
            'Insufficient wallet balance',
            `Your wallet balance is ${formatNaira(
              liveWalletBalance
            )}. Please top up your wallet or switch to Paystack or cash.`
          );
          return;
        }
      }

      const { data: bookingRow, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          customer_id: user.id,
          vehicle_type_id: vehicle.id,
          booking_status: 'searching_driver',
          payment_status: paymentMethod === 'paystack' ? 'pending' : 'unpaid',
          payment_method: paymentMethod,
          pickup_address: pickupAddress,
          pickup_lat: pickupPoint.latitude,
          pickup_lng: pickupPoint.longitude,
          drop_address: dropAddress,
          drop_lat: dropPoint.latitude,
          drop_lng: dropPoint.longitude,
          estimated_distance_meters: Math.round(distanceKm * 1000),
          estimated_duration_seconds: Math.round(durationMin * 60),
          quoted_amount: normalizedEstimate,
        })
        .select('id')
        .single();

      if (bookingError || !bookingRow) {
        Alert.alert('Booking failed', bookingError?.message || 'Could not create booking.');
        return;
      }

      if (paymentMethod === 'wallet') {
        const { data: walletPayResult, error: walletPayError } = await supabase.rpc(
          'pay_customer_booking_with_wallet',
          {
            p_booking_id: bookingRow.id,
            p_customer_id: user.id,
          }
        );

        if (walletPayError || !walletPayResult?.success) {
          await supabase
            .from('bookings')
            .delete()
            .eq('id', bookingRow.id)
            .eq('customer_id', user.id);

          Alert.alert(
            'Wallet payment failed',
            walletPayError?.message ||
              walletPayResult?.message ||
              'Could not complete wallet payment for this booking.'
          );
          return;
        }

        await loadWalletPreview();
      }

      await supabase.from('booking_status_history').insert({
        booking_id: bookingRow.id,
        new_status: 'searching_driver',
        changed_by: user.id,
        note: `Customer created booking from mobile app. Payment method: ${paymentMethod}.`,
      });

      if (paymentMethod === 'paystack') {
        const init = await startBookingPaystackPayment(bookingRow.id);

        await WebBrowser.openBrowserAsync(init.authorizationUrl);

        Alert.alert(
          'Payment started',
          'Complete your Paystack payment. Dispatch will begin automatically after payment is confirmed.'
        );

        navigation.navigate('TrackingDemo', {
          bookingId: bookingRow.id,
          pickupAddress,
          pickupPoint,
          dropAddress,
          dropPoint,
          distanceKm,
          durationMin,
          estimate: normalizedEstimate,
          vehicle,
          paymentMethod,
        });
        return;
      }

      const { data: dispatchResult, error: dispatchError } = await supabase.rpc('dispatch_booking', {
        p_booking_id: bookingRow.id,
      });

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
        estimate: normalizedEstimate,
        vehicle,
        paymentMethod,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const walletInsufficient = paymentMethod === 'wallet' && walletPreview.balance < normalizedEstimate;

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
          <MapView
            style={styles.map}
            initialRegion={pointToRegion(pickupPoint, 0.09)}
            region={pointToRegion(pickupPoint, 0.09)}
          >
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

            <Text style={styles.totalPrice}>{formatNaira(normalizedEstimate)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>

          <Pressable
            style={[
              styles.paymentOptionCard,
              paymentMethod === 'wallet' && styles.paymentOptionCardActive,
            ]}
            onPress={() => setPaymentMethod('wallet')}
          >
            <View style={styles.paymentOptionTopRow}>
              <View>
                <Text
                  style={[
                    styles.paymentOptionTitle,
                    paymentMethod === 'wallet' && styles.paymentOptionTitleActive,
                  ]}
                >
                  Wallet
                </Text>
                <Text style={styles.paymentOptionSubtitle}>Use saved wallet balance</Text>
              </View>

              <Ionicons
                name={paymentMethod === 'wallet' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={paymentMethod === 'wallet' ? '#16a34a' : '#94a3b8'}
              />
            </View>

            <View style={styles.paymentMetaPill}>
              <Text style={styles.paymentMetaPillText}>
                Balance: {formatNaira(walletPreview.balance)}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.paymentOptionCard,
              paymentMethod === 'paystack' && styles.paymentOptionCardActive,
            ]}
            onPress={() => setPaymentMethod('paystack')}
          >
            <View style={styles.paymentOptionTopRow}>
              <View>
                <Text
                  style={[
                    styles.paymentOptionTitle,
                    paymentMethod === 'paystack' && styles.paymentOptionTitleActive,
                  ]}
                >
                  Paystack
                </Text>
                <Text style={styles.paymentOptionSubtitle}>
                  Pay directly with card, bank, or transfer
                </Text>
              </View>

              <Ionicons
                name={paymentMethod === 'paystack' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={paymentMethod === 'paystack' ? '#16a34a' : '#94a3b8'}
              />
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.paymentOptionCard,
              paymentMethod === 'cash' && styles.paymentOptionCardActive,
            ]}
            onPress={() => setPaymentMethod('cash')}
          >
            <View style={styles.paymentOptionTopRow}>
              <View>
                <Text
                  style={[
                    styles.paymentOptionTitle,
                    paymentMethod === 'cash' && styles.paymentOptionTitleActive,
                  ]}
                >
                  Cash
                </Text>
                <Text style={styles.paymentOptionSubtitle}>Pay after towing service</Text>
              </View>

              <Ionicons
                name={paymentMethod === 'cash' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={paymentMethod === 'cash' ? '#16a34a' : '#94a3b8'}
              />
            </View>
          </Pressable>

          {walletInsufficient ? (
            <View style={styles.paymentWarningCard}>
              <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
              <Text style={styles.paymentWarningText}>
                Wallet balance is lower than this trip estimate. Top up your wallet or switch to Paystack or cash.
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable style={styles.primaryButton} onPress={handleRequest} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {paymentMethod === 'wallet'
                ? 'Pay & request tow'
                : paymentMethod === 'paystack'
                ? 'Continue to Paystack'
                : 'Request tow'}
            </Text>
          )}
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
  headerTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },

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
  arrivalPillText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  routeLine: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  routeArrow: {
    color: '#94a3b8',
    fontSize: 16,
    marginVertical: 8,
  },
  pillsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  pillText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },

  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  vehicleSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  totalPrice: {
    color: '#166534',
    fontSize: 24,
    fontWeight: '800',
  },

  paymentOptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentOptionCardActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  paymentOptionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentOptionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  paymentOptionTitleActive: {
    color: '#166534',
  },
  paymentOptionSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  paymentMetaPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  paymentMetaPillText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  paymentWarningCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentWarningText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginLeft: 8,
    flex: 1,
  },

  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});