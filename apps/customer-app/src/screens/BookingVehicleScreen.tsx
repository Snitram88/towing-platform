import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { estimateDurationMinutes, MapPoint, pointToRegion } from '../lib/booking';

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
    };
  };
};

type VehicleType = {
  id: string;
  name: string;
  tonnage_min: number;
  tonnage_max: number;
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function quoteFor(vehicle: VehicleType, distanceKm: number, durationMin: number) {
  return Number(vehicle.base_fare) + Number(vehicle.per_km_rate) * distanceKm + Number(vehicle.per_min_rate) * durationMin;
}

export default function BookingVehicleScreen({ navigation, route }: Props) {
  const { pickupAddress, pickupPoint, dropAddress, dropPoint, distanceKm, durationMin } = route.params;
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVehicleTypes = async () => {
      setLoading(true);

      const { data } = await supabase
        .from('vehicle_types')
        .select('id, name, tonnage_min, tonnage_max, base_fare, per_km_rate, per_min_rate')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      const rows = (data ?? []) as VehicleType[];
      setVehicleTypes(rows);
      if (rows.length > 0) setSelectedId(rows[0].id);
      setLoading(false);
    };

    loadVehicleTypes();
  }, []);

  const selectedVehicle = useMemo(
    () => vehicleTypes.find((item) => item.id === selectedId) ?? null,
    [vehicleTypes, selectedId]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>
          <Text style={styles.headerTitle}>Choose tow class</Text>
          <View style={{ width: 42 }} />
        </View>

        <View style={styles.mapCard}>
          <MapView style={styles.previewMap} initialRegion={pointToRegion(pickupPoint, 0.09)} region={pointToRegion(pickupPoint, 0.09)}>
            <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" />
            <Marker coordinate={dropPoint} title="Dropoff" pinColor="#2563eb" />
            <Polyline coordinates={[pickupPoint, dropPoint]} strokeColor="#2563eb" strokeWidth={4} />
          </MapView>

          <View style={styles.routeInfoCard}>
            <Text style={styles.routeInfoTitle}>{pickupAddress} → {dropAddress}</Text>
            <View style={styles.routeMetaRow}>
              <View style={styles.metaPill}>
                <Ionicons name="navigate-outline" size={14} color="#475569" />
                <Text style={styles.metaPillText}>{distanceKm.toFixed(1)} km</Text>
              </View>
              <View style={styles.metaPill}>
                <Ionicons name="time-outline" size={14} color="#475569" />
                <Text style={styles.metaPillText}>{durationMin || estimateDurationMinutes(distanceKm)} min</Text>
              </View>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.stateText}>Loading tow classes...</Text>
          </View>
        ) : (
          vehicleTypes.map((item, index) => {
            const active = item.id === selectedId;
            const quote = quoteFor(item, distanceKm, durationMin);

            return (
              <Pressable
                key={item.id}
                style={[styles.vehicleCard, active ? styles.vehicleCardActive : null]}
                onPress={() => setSelectedId(item.id)}
              >
                <View style={styles.vehicleHeader}>
                  <View>
                    <Text style={[styles.vehicleTitle, active ? styles.vehicleTitleActive : null]}>{item.name}</Text>
                    <Text style={styles.vehicleSubtitle}>
                      Capacity {item.tonnage_min}t - {item.tonnage_max}t
                    </Text>
                  </View>

                  {index === 0 ? (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>Recommended</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.vehicleStats}>
                  <Text style={styles.vehicleEta}>{Math.max(6, durationMin - 2)} min</Text>
                  <Text style={styles.vehicleEtaLabel}>driver ETA</Text>
                </View>

                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>Estimated total</Text>
                  <Text style={styles.quoteValue}>${quote.toFixed(2)}</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <Pressable
          style={[styles.primaryButton, !selectedVehicle ? styles.primaryButtonDisabled : null]}
          disabled={!selectedVehicle}
          onPress={() =>
            navigation.navigate('BookingSummary', {
              pickupAddress,
              pickupPoint,
              dropAddress,
              dropPoint,
              distanceKm,
              durationMin,
              vehicle: selectedVehicle,
              estimate: selectedVehicle ? quoteFor(selectedVehicle, distanceKm, durationMin) : 0,
            })
          }
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
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
  previewMap: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
  },
  routeInfoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
  },
  routeInfoTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  routeMetaRow: { flexDirection: 'row' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  metaPillText: { color: '#334155', fontSize: 12, fontWeight: '800', marginLeft: 6 },
  stateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    ...shadowCard,
  },
  stateText: { color: '#334155', fontSize: 14, fontWeight: '700', marginTop: 10 },
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ffffff',
    ...shadowCard,
  },
  vehicleCardActive: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  vehicleTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  vehicleTitleActive: { color: '#15803d' },
  vehicleSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  recommendedBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recommendedBadgeText: { color: '#166534', fontSize: 11, fontWeight: '800' },
  vehicleStats: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  vehicleEta: { color: '#0f172a', fontSize: 24, fontWeight: '800', marginBottom: 2 },
  vehicleEtaLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  quoteValue: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
