import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type ActiveBooking = {
  booking_id: string;
  booking_status?: string | null;
  pickup_address?: string | null;
  drop_address?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  vehicle_type_name?: string | null;
  quoted_amount?: number | null;
};

type IncidentItem = {
  id: string;
  booking_id?: string | null;
  category?: string | null;
  details?: string | null;
  incident_status?: string | null;
  created_at?: string | null;
};

const INCIDENT_CATEGORIES = [
  'breakdown',
  'traffic_delay',
  'customer_issue',
  'unsafe_scene',
  'vehicle_issue',
  'other',
];

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

export default function SupportScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [category, setCategory] = useState('breakdown');
  const [details, setDetails] = useState('');
  const [cancelTrip, setCancelTrip] = useState(false);

  const loadBundle = async () => {
    const [dispatchRes, incidentsRes] = await Promise.all([
      supabase.rpc('get_driver_dispatch_state'),
      supabase.rpc('get_driver_incidents'),
    ]);

    if (dispatchRes.error) throw dispatchRes.error;
    if (incidentsRes.error) throw incidentsRes.error;

    const booking =
      dispatchRes.data?.active_booking && dispatchRes.data.active_booking.booking_id
        ? (dispatchRes.data.active_booking as ActiveBooking)
        : null;

    setActiveBooking(booking);
    setIncidents(Array.isArray(incidentsRes.data) ? (incidentsRes.data as IncidentItem[]) : []);
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await loadBundle();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load support tools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const canSubmit = useMemo(() => {
    return category.trim().length > 0;
  }, [category]);

  const submitIncident = async () => {
    if (!canSubmit) {
      Alert.alert('Missing category', 'Choose an incident category first.');
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase.rpc('driver_report_incident', {
        p_booking_id: activeBooking?.booking_id ?? null,
        p_category: category,
        p_details: details.trim() || null,
        p_mark_canceled: cancelTrip && Boolean(activeBooking?.booking_id),
      });

      if (error) throw error;
      if (!data?.success) {
        Alert.alert('Submit failed', data?.message || 'Could not report incident.');
        return;
      }

      setDetails('');
      setCancelTrip(false);

      await loadBundle();

      Alert.alert(
        'Incident logged',
        data?.booking_canceled
          ? 'Incident was recorded and the active trip was canceled.'
          : 'Incident was recorded successfully.'
      );
    } catch (error) {
      Alert.alert('Submit failed', error instanceof Error ? error.message : 'Could not report incident');
    } finally {
      setSaving(false);
    }
  };

  const callCustomer = async () => {
    const phone = activeBooking?.customer_phone;
    if (!phone) {
      Alert.alert('No phone number', 'Customer phone number is not available.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('Call failed', 'Could not open the dialer.');
    }
  };

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

          <Text style={styles.headerTitle}>Support & incidents</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Driver support</Text>
          <Text style={styles.heroTitle}>Report issues quickly</Text>
          <Text style={styles.heroSubtitle}>
            Log incidents, contact the customer, and record operational problems during active towing work.
          </Text>
        </View>

        {activeBooking ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeEyebrow}>Active booking</Text>
            <Text style={styles.activeTitle}>{activeBooking.vehicle_type_name || 'Tow trip'}</Text>
            <Text style={styles.activeSubtitle}>{titleize(activeBooking.booking_status)}</Text>

            <View style={styles.routeBlock}>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeValue}>{activeBooking.pickup_address || 'Pickup not available'}</Text>
            </View>

            <View style={styles.routeBlock}>
              <Text style={styles.routeLabel}>Dropoff</Text>
              <Text style={styles.routeValue}>{activeBooking.drop_address || 'Dropoff not available'}</Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={callCustomer}>
                <Ionicons name="call-outline" size={16} color="#1d4ed8" />
                <Text style={styles.secondaryButtonText}>Call customer</Text>
              </Pressable>

              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('TripMap')}>
                <Ionicons name="map-outline" size={16} color="#1d4ed8" />
                <Text style={styles.secondaryButtonText}>Open trip map</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>No active trip right now</Text>
            <Text style={styles.infoText}>
              You can still log a general driver issue, but trip cancellation only applies when a booking is active.
            </Text>
          </View>
        )}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Create incident report</Text>

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryWrap}>
            {INCIDENT_CATEGORIES.map((item) => {
              const active = category === item;
              return (
                <Pressable
                  key={item}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {titleize(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Details</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Describe what happened..."
            placeholderTextColor="#94a3b8"
            multiline
            style={styles.textArea}
          />

          {activeBooking ? (
            <Pressable style={styles.cancelRow} onPress={() => setCancelTrip((value) => !value)}>
              <View style={[styles.checkbox, cancelTrip && styles.checkboxActive]}>
                {cancelTrip ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelTitle}>Also cancel active trip</Text>
                <Text style={styles.cancelText}>
                  Use this only when the trip cannot continue due to a serious issue.
                </Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.primaryButton, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={submitIncident}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Submit incident</Text>}
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent incident log</Text>
          <Text style={styles.sectionSubtitle}>Your latest recorded driver issues and operational notes.</Text>
        </View>

        {incidents.length === 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>No incidents yet</Text>
            <Text style={styles.infoText}>
              Reported issues will appear here for quick reference.
            </Text>
          </View>
        ) : (
          incidents.map((item) => (
            <View key={item.id} style={styles.incidentCard}>
              <View style={styles.incidentTopRow}>
                <Text style={styles.incidentTitle}>{titleize(item.category)}</Text>
                <Text style={styles.incidentStatus}>{titleize(item.incident_status)}</Text>
              </View>

              <Text style={styles.incidentDate}>
                {item.created_at ? new Date(item.created_at).toLocaleString() : 'Now'}
              </Text>

              <Text style={styles.incidentBody}>
                {item.details || 'No details added.'}
              </Text>

              {item.booking_id ? (
                <Text style={styles.incidentMeta}>Booking linked</Text>
              ) : (
                <Text style={styles.incidentMeta}>General driver issue</Text>
              )}
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
  activeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadowCard,
  },
  activeEyebrow: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  activeTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  activeSubtitle: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadowCard,
  },
  infoTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    ...shadowCard,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 10,
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  label: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 6,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  categoryChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  categoryChipActive: {
    backgroundColor: '#dbeafe',
  },
  categoryChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  categoryChipTextActive: {
    color: '#1d4ed8',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 120,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  cancelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  cancelTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  incidentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  incidentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  incidentTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },
  incidentStatus: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '800',
  },
  incidentDate: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  incidentBody: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  incidentMeta: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
});
