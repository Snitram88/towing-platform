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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import type { DriverState } from '../types/app';

type VehicleType = {
  id: string;
  name: string;
  tonnage_min: number;
  tonnage_max: number;
};

type Props = {
  driver: DriverState;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function HomeScreen({ driver, onRefresh, onSignOut }: Props) {
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(driver.is_online);

  const loadHome = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('vehicle_types')
      .select('id, name, tonnage_min, tonnage_max')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      Alert.alert('Load failed', error.message);
      setVehicleTypes([]);
    } else {
      setVehicleTypes((data ?? []) as VehicleType[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    setIsOnline(driver.is_online);
  }, [driver.is_online]);

  useEffect(() => {
    loadHome();
  }, []);

  const toggleAvailability = async () => {
    const nextValue = !isOnline;
    setIsOnline(nextValue);

    const { error } = await supabase
      .from('drivers')
      .update({
        is_online: nextValue,
        is_available: nextValue,
      })
      .eq('profile_id', driver.profile_id);

    if (error) {
      setIsOnline(!nextValue);
      Alert.alert('Update failed', error.message);
      return;
    }

    await onRefresh();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => {
          await Promise.all([loadHome(), onRefresh()]);
        }} tintColor="#ffffff" />}
      >
        <LinearGradient colors={isOnline ? ['#052e16', '#14532d', '#166534'] : ['#111827', '#0f172a', '#1e293b']} style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>Verified driver workspace</Text>
              <Text style={styles.heroTitle}>Hi, {driver.full_name?.split(' ')[0] || 'Driver'}</Text>
              <Text style={styles.heroSubtitle}>
                Manage live availability, incoming requests, and premium towing operations.
              </Text>
            </View>

            <Pressable style={styles.signOutButton} onPress={onSignOut}>
              <Ionicons name="log-out-outline" size={18} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{isOnline ? 'Online' : 'Offline'}</Text>
              <Text style={styles.metricLabel}>Current status</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>$0.00</Text>
              <Text style={styles.metricLabel}>Today’s earnings</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>5.0</Text>
              <Text style={styles.metricLabel}>Driver rating</Text>
            </View>
          </View>

          <Pressable style={[styles.onlineButton, isOnline ? styles.onlineButtonLight : styles.onlineButtonGreen]} onPress={toggleAvailability}>
            <Text style={[styles.onlineButtonText, isOnline ? styles.onlineButtonTextDark : styles.onlineButtonTextLight]}>
              {isOnline ? 'Go offline' : 'Go online'}
            </Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.requestCard}>
          <View style={styles.requestHeader}>
            <View>
              <Text style={styles.requestTitle}>Dispatch preview</Text>
              <Text style={styles.requestSubtitle}>Approved drivers will receive nearby towing jobs here</Text>
            </View>
            <View style={styles.priorityChip}>
              <Ionicons name="flash-outline" size={14} color="#b45309" />
              <Text style={styles.priorityChipText}>Priority</Text>
            </View>
          </View>

          <View style={styles.routeRow}>
            <View style={styles.routeIconColumn}>
              <View style={[styles.routeDot, { backgroundColor: '#22c55e' }]} />
              <View style={styles.routeDivider} />
              <View style={[styles.routeDot, { backgroundColor: '#2563eb' }]} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.routeBlock}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeValue}>Customer breakdown location appears here</Text>
              </View>

              <View style={styles.routeBlock}>
                <Text style={styles.routeLabel}>Drop</Text>
                <Text style={styles.routeValue}>Destination route appears after job acceptance</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Supported tow classes</Text>
            <Text style={styles.sectionSubtitle}>Loaded from the live Supabase backend</Text>
          </View>

          <View style={styles.connectedChip}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#166534" />
            <Text style={styles.connectedChipText}>Approved</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#16a34a" />
            <Text style={styles.stateText}>Loading driver home...</Text>
          </View>
        ) : (
          vehicleTypes.map((item) => (
            <View key={item.id} style={styles.vehicleCard}>
              <View style={styles.vehicleIconShell}>
                <Ionicons name="car-sport-outline" size={20} color="#16a34a" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleTitle}>{item.name}</Text>
                <Text style={styles.vehicleSubtitle}>
                  Capacity range: {item.tonnage_min}t - {item.tonnage_max}t
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  container: {
    padding: 18,
    paddingBottom: 30,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    ...shadowCard,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  heroEyebrow: {
    color: '#86efac',
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
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 280,
  },
  signOutButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  metricCard: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  metricLabel: {
    color: '#d1d5db',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  onlineButton: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  onlineButtonGreen: {
    backgroundColor: '#16a34a',
  },
  onlineButtonLight: {
    backgroundColor: '#ffffff',
  },
  onlineButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  onlineButtonTextLight: {
    color: '#ffffff',
  },
  onlineButtonTextDark: {
    color: '#0f172a',
  },
  requestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    ...shadowCard,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  requestTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  requestSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 220,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  priorityChipText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  routeRow: {
    flexDirection: 'row',
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
  routeBlock: {
    marginBottom: 14,
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
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  sectionHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
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
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  connectedChipText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
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
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadowCard,
  },
  vehicleIconShell: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  vehicleTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  vehicleSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
