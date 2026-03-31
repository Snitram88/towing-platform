import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  createNearbyTowUnits,
  estimateDurationMinutes,
  interpolatePoint,
  MapPoint,
  pointToRegion,
} from '../lib/booking';

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
      };
    };
  };
};

type Phase = 'driver_to_pickup' | 'to_destination';

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

export default function TrackingDemoScreen({ navigation, route }: Props) {
  const { pickupAddress, pickupPoint, dropAddress, dropPoint, distanceKm, durationMin, estimate, vehicle } = route.params;
  const driverStart = useMemo(() => createNearbyTowUnits(pickupPoint)[0].point, [pickupPoint]);

  const [phase, setPhase] = useState<Phase>('driver_to_pickup');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
  }, [phase]);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 1) return 1;
        return Math.min(1, prev + 0.12);
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [phase]);

  const currentDriverPoint = useMemo(() => {
    if (phase === 'driver_to_pickup') {
      return interpolatePoint(driverStart, pickupPoint, progress);
    }
    return interpolatePoint(pickupPoint, dropPoint, progress);
  }, [driverStart, pickupPoint, dropPoint, phase, progress]);

  const statusTitle =
    phase === 'driver_to_pickup'
      ? progress >= 1
        ? 'Tow truck has arrived'
        : 'Tow truck is on the way'
      : progress >= 1
      ? 'Vehicle delivered'
      : 'Heading to dropoff';

  const etaLabel =
    phase === 'driver_to_pickup'
      ? `${Math.max(1, Math.round((1 - progress) * 8))} min`
      : `${Math.max(1, Math.round((1 - progress) * Math.max(durationMin, estimateDurationMinutes(distanceKm))))} min`;

  const lineCoordinates =
    phase === 'driver_to_pickup'
      ? [currentDriverPoint, pickupPoint]
      : [currentDriverPoint, dropPoint];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={pointToRegion(pickupPoint, 0.08)} region={pointToRegion(currentDriverPoint, 0.08)}>
          <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" />
          <Marker coordinate={dropPoint} title="Dropoff" pinColor="#2563eb" />
          <Marker coordinate={currentDriverPoint} title="Tow truck">
            <View style={styles.truckMarker}>
              <Ionicons name="car-sport" size={14} color="#ffffff" />
            </View>
          </Marker>
          <Polyline coordinates={lineCoordinates} strokeColor="#2563eb" strokeWidth={4} />
        </MapView>

        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#0f172a" />
        </Pressable>

        <View style={styles.etaBubble}>
          <Text style={styles.etaBubbleText}>{etaLabel}</Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sheetEyebrow}>{phase === 'driver_to_pickup' ? 'Driver arriving' : 'Trip in progress'}</Text>
        <Text style={styles.sheetTitle}>{statusTitle}</Text>
        <Text style={styles.sheetSubtitle}>
          {phase === 'driver_to_pickup'
            ? `${vehicle.name} assigned. Track the truck as it moves to ${pickupAddress}.`
            : `Track the truck as it moves from pickup to ${dropAddress}.`}
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tow class</Text>
            <Text style={styles.infoValue}>{vehicle.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Estimate</Text>
            <Text style={styles.infoValue}>${estimate.toFixed(2)}</Text>
          </View>
        </View>

        {phase === 'driver_to_pickup' && progress >= 1 ? (
          <Pressable style={styles.primaryButton} onPress={() => setPhase('to_destination')}>
            <Text style={styles.primaryButtonText}>Start tow to destination</Text>
          </Pressable>
        ) : phase === 'to_destination' && progress >= 1 ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              Alert.alert('Trip complete', 'This tracking shell is ready. Next we wire it to real live driver data.')
            }
          >
            <Text style={styles.primaryButtonText}>Finish demo</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => Alert.alert('Driver contact', 'Call/chat wiring comes next.')}>
            <Text style={styles.secondaryButtonText}>Contact driver</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  mapWrap: { flex: 1 },
  map: { width: '100%', height: '100%' },
  backButton: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  etaBubble: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  etaBubbleText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  truckMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },
  sheetEyebrow: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  sheetTitle: { color: '#0f172a', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  sheetSubtitle: { color: '#64748b', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  infoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  infoValue: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
