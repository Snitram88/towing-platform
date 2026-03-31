import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_POINT,
  DEFAULT_REGION,
  describeReverseGeocode,
  formatLatLng,
  MapPoint,
  pointToRegion,
} from '../lib/booking';

type Props = {
  navigation: any;
  route: {
    params: {
      mode: 'pickup' | 'drop';
      pickupAddress: string;
      pickupPoint: MapPoint | null;
      dropAddress: string;
      dropPoint: MapPoint | null;
    };
  };
};

export default function MapPickerScreen({ navigation, route }: Props) {
  const { mode, pickupAddress, pickupPoint, dropAddress, dropPoint } = route.params;
  const existingPoint = mode === 'pickup' ? pickupPoint : dropPoint;

  const [selectedPoint, setSelectedPoint] = useState<MapPoint>(existingPoint ?? DEFAULT_POINT);
  const [selectedLabel, setSelectedLabel] = useState(
    mode === 'pickup' ? pickupAddress || `Pinned location (${formatLatLng(existingPoint ?? DEFAULT_POINT)})` : dropAddress || `Pinned location (${formatLatLng(existingPoint ?? DEFAULT_POINT)})`
  );
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (existingPoint) {
      setSelectedPoint(existingPoint);
    }
  }, [existingPoint]);

  const useMyLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert('Location denied', 'You can still drag the map and confirm the pin manually.');
      return;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    setSelectedPoint(point);
    setSelectedLabel(`Pinned location (${formatLatLng(point)})`);
  };

  const confirmPoint = async () => {
    setResolving(true);

    const reverse = await Location.reverseGeocodeAsync(selectedPoint);
    const label = describeReverseGeocode(reverse[0], selectedPoint);

    navigation.replace('BookingLocation', {
      pickupAddress: mode === 'pickup' ? label : pickupAddress,
      pickupPoint: mode === 'pickup' ? selectedPoint : pickupPoint,
      dropAddress: mode === 'drop' ? label : dropAddress,
      dropPoint: mode === 'drop' ? selectedPoint : dropPoint,
    });

    setResolving(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="close" size={20} color="#0f172a" />
        </Pressable>

        <Text style={styles.headerTitle}>
          {mode === 'pickup' ? 'Pick pickup on map' : 'Pick dropoff on map'}
        </Text>

        <Pressable onPress={useMyLocation} style={styles.iconButton}>
          <Ionicons name="locate-outline" size={20} color="#0f172a" />
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          style={styles.map}
          initialRegion={existingPoint ? pointToRegion(existingPoint, 0.03) : DEFAULT_REGION}
          region={pointToRegion(selectedPoint, 0.03)}
          onRegionChangeComplete={(region) =>
            setSelectedPoint({
              latitude: region.latitude,
              longitude: region.longitude,
            })
          }
        >
          <Marker coordinate={selectedPoint} title={mode === 'pickup' ? 'Pickup pin' : 'Dropoff pin'} pinColor={mode === 'pickup' ? '#16a34a' : '#2563eb'} />
        </MapView>
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetLabel}>{mode === 'pickup' ? 'Selected pickup' : 'Selected dropoff'}</Text>
        <Text style={styles.sheetTitle}>{selectedLabel}</Text>

        <View style={styles.coordsPill}>
          <Ionicons name="navigate-outline" size={14} color="#475569" />
          <Text style={styles.coordsPillText}>{formatLatLng(selectedPoint)}</Text>
        </View>

        <Pressable style={styles.primaryButton} onPress={confirmPoint} disabled={resolving}>
          {resolving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Confirm {mode}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  headerRow: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  mapWrap: { flex: 1 },
  map: { width: '100%', height: '100%' },
  bottomSheet: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  sheetLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sheetTitle: { color: '#0f172a', fontSize: 24, fontWeight: '800', marginBottom: 14 },
  coordsPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  coordsPillText: { color: '#334155', fontSize: 12, fontWeight: '800', marginLeft: 6 },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
