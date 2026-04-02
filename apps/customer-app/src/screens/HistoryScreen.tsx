import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type BookingRow = {
  id: string;
  booking_status: string;
  payment_status: string;
  quoted_amount: number;
  created_at: string;
  pickup_address: string;
  drop_address: string;
  vehicle_type_id: string;
};

type VehicleTypeRow = {
  id: string;
  name: string;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function statusColor(status: string) {
  switch (status) {
    case 'completed':
      return { bg: '#dcfce7', text: '#166534' };
    case 'driver_en_route':
    case 'driver_arrived':
    case 'in_service':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'searching_driver':
    case 'driver_assigned':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'canceled_by_customer':
    case 'canceled_by_driver':
    case 'canceled_by_admin':
      return { bg: '#fee2e2', text: '#b91c1c' };
    default:
      return { bg: '#e2e8f0', text: '#334155' };
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function HistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [vehicleNames, setVehicleNames] = useState<Record<string, string>>({});

  const loadHistory = async () => {
    setLoading(true);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!user) {
      setBookings([]);
      setVehicleNames({});
      setLoading(false);
      return;
    }

    const [{ data: bookingRows }, { data: vehicleRows }] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, booking_status, payment_status, quoted_amount, created_at, pickup_address, drop_address, vehicle_type_id'
        )
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('vehicle_types').select('id, name'),
    ]);

    const vehicleMap = Object.fromEntries(
      ((vehicleRows ?? []) as VehicleTypeRow[]).map((item) => [item.id, item.name])
    );

    setVehicleNames(vehicleMap);
    setBookings((bookingRows ?? []) as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const totalBookings = useMemo(() => bookings.length, [bookings.length]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadHistory} tintColor="#ffffff" />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Service history</Text>
          <Text style={styles.heroTitle}>Your towing requests</Text>
          <Text style={styles.heroSubtitle}>
            Real bookings created from the customer app will appear here.
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStatPill}>
              <Ionicons name="albums-outline" size={14} color="#7dd3fc" />
              <Text style={styles.heroStatText}>{totalBookings} total booking(s)</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.stateText}>Loading service history...</Text>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="file-tray-outline" size={22} color="#64748b" />
            <Text style={styles.stateText}>No towing requests yet.</Text>
          </View>
        ) : (
          bookings.map((booking) => {
            const chip = statusColor(booking.booking_status);
            return (
              <View key={booking.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.cardTitle}>
                      {vehicleNames[booking.vehicle_type_id] || 'Tow class'}
                    </Text>
                    <Text style={styles.cardDate}>
                      {new Date(booking.created_at).toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                    <Text style={[styles.statusChipText, { color: chip.text }]}>
                      {titleCase(booking.booking_status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeWrap}>
                  <View style={styles.routeIconColumn}>
                    <View style={[styles.routeDot, { backgroundColor: '#16a34a' }]} />
                    <View style={styles.routeDivider} />
                    <View style={[styles.routeDot, { backgroundColor: '#2563eb' }]} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeLabel}>Pickup</Text>
                    <Text style={styles.routeValue}>{booking.pickup_address}</Text>

                    <Text style={[styles.routeLabel, { marginTop: 12 }]}>Dropoff</Text>
                    <Text style={styles.routeValue}>{booking.drop_address}</Text>
                  </View>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.pricePill}>
                    <Ionicons name="cash-outline" size={14} color="#475569" />
                    <Text style={styles.pricePillText}>${Number(booking.quoted_amount).toFixed(2)}</Text>
                  </View>

                  <View style={styles.pricePill}>
                    <Ionicons name="card-outline" size={14} color="#475569" />
                    <Text style={styles.pricePillText}>{titleCase(booking.payment_status)}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { padding: 18, paddingBottom: 30 },
  hero: {
    backgroundColor: '#0B1220',
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    ...shadowCard,
  },
  heroEyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  heroStats: {
    flexDirection: 'row',
  },
  heroStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(125,211,252,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.2)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroStatText: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 7,
  },
  stateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    ...shadowCard,
  },
  stateText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDate: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  routeWrap: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  routeIconColumn: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 4,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeDivider: {
    width: 2,
    flex: 1,
    backgroundColor: '#cbd5e1',
    marginVertical: 6,
  },
  routeLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  routeValue: {
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  pricePillText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
});
