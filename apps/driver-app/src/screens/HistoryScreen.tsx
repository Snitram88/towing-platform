import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type HistoryItem = {
  booking_id: string;
  booking_status?: string | null;
  quoted_amount?: number | null;
  pickup_address?: string | null;
  drop_address?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  vehicle_type_name?: string | null;
  created_at?: string | null;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusStyle(status?: string | null) {
  switch (status) {
    case 'completed':
      return { backgroundColor: '#dcfce7', color: '#166534' };
    case 'canceled_by_driver':
    case 'canceled_by_customer':
    case 'canceled_by_admin':
      return { backgroundColor: '#fee2e2', color: '#b91c1c' };
    default:
      return { backgroundColor: '#e2e8f0', color: '#334155' };
  }
}

export default function HistoryScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = async () => {
    const { data, error } = await supabase.rpc('get_driver_trip_history');

    if (error) throw error;

    setHistory(Array.isArray(data) ? (data as HistoryItem[]) : []);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await loadHistory();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load trip history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;

    return history.filter((item) =>
      [
        item.customer_name || '',
        item.pickup_address || '',
        item.drop_address || '',
        item.vehicle_type_name || '',
        item.booking_status || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [history, query]);

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

          <Text style={styles.headerTitle}>Trip history</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>History</Text>
          <Text style={styles.heroTitle}>Past towing jobs</Text>
          <Text style={styles.heroSubtitle}>
            Review completed and cancelled jobs, search past routes, and confirm trip records.
          </Text>
        </View>

        <View style={styles.searchCard}>
          <Ionicons name="search-outline" size={18} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search address, customer, status..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
        </View>

        {filteredHistory.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyText}>
              Completed and cancelled driver trips will appear here.
            </Text>
          </View>
        ) : (
          filteredHistory.map((item) => {
            const badge = statusStyle(item.booking_status);

            return (
              <View key={item.booking_id} style={styles.historyCard}>
                <View style={styles.topRow}>
                  <View>
                    <Text style={styles.tripTitle}>{item.vehicle_type_name || 'Tow trip'}</Text>
                    <Text style={styles.tripSubtitle}>
                      {item.customer_name || 'Customer'} • {item.created_at ? new Date(item.created_at).toLocaleString() : 'Now'}
                    </Text>
                  </View>

                  <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>
                      {titleize(item.booking_status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeBlock}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeValue}>{item.pickup_address || 'Pickup not available'}</Text>
                </View>

                <View style={styles.routeBlock}>
                  <Text style={styles.routeLabel}>Dropoff</Text>
                  <Text style={styles.routeValue}>{item.drop_address || 'Dropoff not available'}</Text>
                </View>

                <View style={styles.footerRow}>
                  <Text style={styles.amountText}>${Number(item.quoted_amount || 0).toFixed(2)}</Text>
                  <Text style={styles.customerPhone}>{item.customer_phone || 'No phone'}</Text>
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
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    ...shadowCard,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
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
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  topRow: {
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
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    fontSize: 12,
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
  footerRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountText: {
    color: '#166534',
    fontSize: 20,
    fontWeight: '800',
  },
  customerPhone: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
});
