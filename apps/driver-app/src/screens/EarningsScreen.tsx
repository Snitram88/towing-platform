import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type RecentCompleted = {
  booking_id: string;
  quoted_amount?: number | null;
  pickup_address?: string | null;
  drop_address?: string | null;
  created_at?: string | null;
  vehicle_type_name?: string | null;
  customer_name?: string | null;
};

type EarningsSummary = {
  today_earnings?: number | null;
  week_earnings?: number | null;
  total_earnings?: number | null;
  total_completed_trips?: number | null;
  recent_completed?: RecentCompleted[];
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function money(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function EarningsScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<EarningsSummary>({
    today_earnings: 0,
    week_earnings: 0,
    total_earnings: 0,
    total_completed_trips: 0,
    recent_completed: [],
  });

  const loadSummary = async () => {
    const { data, error } = await supabase.rpc('get_driver_earnings_summary');

    if (error) throw error;

    setSummary({
      today_earnings: data?.today_earnings ?? 0,
      week_earnings: data?.week_earnings ?? 0,
      total_earnings: data?.total_earnings ?? 0,
      total_completed_trips: data?.total_completed_trips ?? 0,
      recent_completed: Array.isArray(data?.recent_completed) ? data.recent_completed : [],
    });
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await loadSummary();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load earnings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
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
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#ffffff" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>

          <Text style={styles.headerTitle}>Earnings</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Payout overview</Text>
          <Text style={styles.heroTitle}>Driver earnings summary</Text>
          <Text style={styles.heroSubtitle}>
            Track today’s earnings, weekly performance, and completed towing jobs from one place.
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today</Text>
            <Text style={styles.statValue}>{money(summary.today_earnings)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This week</Text>
            <Text style={styles.statValue}>{money(summary.week_earnings)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total earned</Text>
            <Text style={styles.statValue}>{money(summary.total_earnings)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Completed trips</Text>
            <Text style={styles.statValue}>{Number(summary.total_completed_trips || 0)}</Text>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Payouts</Text>
          <Text style={styles.noteText}>
            This is the earnings foundation. Later we will add payout account setup, settlement history, and downloadable receipts.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent completed trips</Text>
          <Text style={styles.sectionSubtitle}>Latest earning records from completed towing jobs.</Text>
        </View>

        {(summary.recent_completed || []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No completed trips yet</Text>
            <Text style={styles.emptyText}>
              Completed jobs will appear here once the driver finishes towing trips.
            </Text>
          </View>
        ) : (
          (summary.recent_completed || []).map((item) => (
            <View key={item.booking_id} style={styles.tripCard}>
              <View style={styles.tripTopRow}>
                <View>
                  <Text style={styles.tripTitle}>{item.vehicle_type_name || 'Tow trip'}</Text>
                  <Text style={styles.tripSubtitle}>
                    {item.customer_name || 'Customer'} • {item.created_at ? new Date(item.created_at).toLocaleString() : 'Now'}
                  </Text>
                </View>

                <Text style={styles.tripAmount}>{money(item.quoted_amount)}</Text>
              </View>

              <View style={styles.routeBlock}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeValue}>{item.pickup_address || 'Pickup not available'}</Text>
              </View>

              <View style={styles.routeBlock}>
                <Text style={styles.routeLabel}>Dropoff</Text>
                <Text style={styles.routeValue}>{item.drop_address || 'Dropoff not available'}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { padding: 18, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: '#0B1220',
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    ...shadowCard,
  },
  heroEyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statValue: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    ...shadowCard,
  },
  noteTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  noteText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...shadowCard,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  tripCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  tripTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  tripTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  tripSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  tripAmount: {
    color: '#166534',
    fontSize: 22,
    fontWeight: '800',
  },
  routeBlock: {
    marginBottom: 12,
  },
  routeLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  routeValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
});
