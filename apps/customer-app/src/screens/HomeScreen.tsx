import React, { useEffect, useMemo, useState } from 'react';
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
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  createNearbyTowUnits,
  DEFAULT_POINT,
  DEFAULT_REGION,
  describeReverseGeocode,
  MapPoint,
  pointToRegion,
  TowUnit,
} from '../lib/booking';

type VehicleType = {
  id: string;
  name: string;
  tonnage_min: number;
  tonnage_max: number;
  base_fare: number;
};

type Profile = {
  full_name: string | null;
  email: string | null;
};

type Props = {
  navigation: any;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

export default function HomeScreen({ navigation }: Props) {
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapPoint, setMapPoint] = useState<MapPoint>(DEFAULT_POINT);
  const [mapLabel, setMapLabel] = useState('Lagos live dispatch area');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [towUnits, setTowUnits] = useState<TowUnit[]>(createNearbyTowUnits(DEFAULT_POINT));

  const displayName = useMemo(() => {
    if (profile?.full_name && profile.full_name.trim().length > 0) {
      return profile.full_name.split(' ')[0];
    }
    if (profile?.email) {
      return profile.email.split('@')[0];
    }
    return 'there';
  }, [profile]);

  const loadCurrentLocationIfAllowed = async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    const granted = permission.status === 'granted';
    setHasLocationPermission(granted);

    if (!granted) {
      setMapPoint(DEFAULT_POINT);
      setMapLabel('Lagos live dispatch area');
      setTowUnits(createNearbyTowUnits(DEFAULT_POINT));
      return;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const nextPoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    setMapPoint(nextPoint);
    setTowUnits(createNearbyTowUnits(nextPoint));

    const reverse = await Location.reverseGeocodeAsync(nextPoint);
    setMapLabel(describeReverseGeocode(reverse[0], nextPoint));
  };

  const loadHome = async () => {
    setLoading(true);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (user) {
      const [{ data: profileRow }, { data: vehicleRows }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', user.id).single(),
        supabase
          .from('vehicle_types')
          .select('id, name, tonnage_min, tonnage_max, base_fare')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
      ]);

      setProfile(
        profileRow ?? {
          full_name: user.user_metadata?.full_name ?? null,
          email: user.email ?? null,
        }
      );
      setVehicleTypes((vehicleRows ?? []) as VehicleType[]);
    }

    await loadCurrentLocationIfAllowed();
    setLoading(false);
  };

  useEffect(() => {
    loadHome();
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  };

  const openBooking = () => {
    navigation.navigate('BookingLocation', {
      pickupAddress: hasLocationPermission ? mapLabel : '',
      pickupPoint: hasLocationPermission ? mapPoint : null,
      dropAddress: '',
      dropPoint: null,
    });
  };

  const featured = vehicleTypes.slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadHome} tintColor="#ffffff" />}
      >
        <View style={styles.mapShell}>
          <MapView
            style={styles.map}
            initialRegion={DEFAULT_REGION}
            region={pointToRegion(mapPoint, 0.08)}
          >
            <Marker coordinate={mapPoint} title="You">
              <View style={styles.userMarker}>
                <Ionicons name="locate" size={15} color="#ffffff" />
              </View>
            </Marker>

            {towUnits.map((unit) => (
              <Marker
                key={unit.id}
                coordinate={unit.point}
                title={unit.title}
                description={`${unit.etaMin} min away`}
              >
                <View style={styles.truckMarker}>
                  <Ionicons name="car-sport" size={14} color="#ffffff" />
                </View>
              </Marker>
            ))}
          </MapView>

          <View style={styles.topOverlay}>
            <View>
              <Text style={styles.heroEyebrow}>Nearby towing network</Text>
              <Text style={styles.heroTitle}>Hi, {displayName}</Text>
              <Text style={styles.heroSubtitle}>See nearby tow units and start a fast pickup flow.</Text>
            </View>

            <Pressable style={styles.iconButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#0f172a" />
            </Pressable>
          </View>

          <Pressable style={styles.locationChip} onPress={openBooking}>
            <Ionicons name="location-outline" size={14} color="#0f172a" />
            <Text style={styles.locationChipText}>{mapLabel}</Text>
          </Pressable>
        </View>

        <View style={styles.sheetCard}>
          <Pressable style={styles.searchCard} onPress={openBooking}>
            <View style={styles.searchIconShell}>
              <Ionicons name="search" size={18} color="#0f172a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.searchLabel}>Where to?</Text>
              <Text style={styles.searchHint}>
                Use current location, type an address, or pin pickup on the map
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#64748b" />
          </Pressable>

          <View style={styles.quickRow}>
            <Pressable style={styles.quickAction} onPress={openBooking}>
              <View style={[styles.quickIconShell, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="car-sport-outline" size={18} color="#2563eb" />
              </View>
              <Text style={styles.quickLabel}>Book tow</Text>
            </Pressable>

            <Pressable style={styles.quickAction}>
              <View style={[styles.quickIconShell, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="wallet-outline" size={18} color="#7c3aed" />
              </View>
              <Text style={styles.quickLabel}>Wallet</Text>
            </Pressable>

            <Pressable style={styles.quickAction}>
              <View style={[styles.quickIconShell, { backgroundColor: '#ccfbf1' }]}>
                <Ionicons name="time-outline" size={18} color="#0f766e" />
              </View>
              <Text style={styles.quickLabel}>Rides</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Tow classes</Text>
            <Text style={styles.sectionSubtitle}>Live categories loaded from Supabase</Text>
          </View>
          <View style={styles.connectedChip}>
            <Ionicons name="cloud-done-outline" size={14} color="#166534" />
            <Text style={styles.connectedChipText}>Connected</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.stateText}>Loading dispatch map...</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
            {featured.map((item) => (
              <View key={item.id} style={styles.vehicleCard}>
                <Text style={styles.vehicleTitle}>{item.name}</Text>
                <Text style={styles.vehicleSubtitle}>
                  {item.tonnage_min}t - {item.tonnage_max}t
                </Text>
                <Text style={styles.vehiclePrice}>${Number(item.base_fare).toFixed(2)} base</Text>
                <Pressable style={styles.vehicleButton} onPress={openBooking}>
                  <Text style={styles.vehicleButtonText}>Choose</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { paddingBottom: 28 },
  mapShell: {
    height: 470,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#dbeafe',
    marginBottom: 16,
  },
  map: { width: '100%', height: '100%' },
  topOverlay: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroEyebrow: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 230,
    fontWeight: '600',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  locationChip: {
    position: 'absolute',
    top: 122,
    left: 18,
    right: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadowCard,
  },
  locationChipText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
    flex: 1,
  },
  userMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  truckMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  sheetCard: {
    marginHorizontal: 18,
    marginTop: -74,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 18,
    ...shadowCard,
    marginBottom: 18,
  },
  searchCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchIconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  searchLabel: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 3,
  },
  searchHint: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAction: { width: '31.5%', alignItems: 'center' },
  quickIconShell: {
    width: 46,
    height: 46,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickLabel: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  sectionHeader: {
    marginHorizontal: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  sectionTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sectionSubtitle: { color: '#94a3b8', fontSize: 13 },
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  connectedChipText: { color: '#166534', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  stateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 18,
    ...shadowCard,
  },
  stateText: { color: '#334155', fontSize: 14, fontWeight: '700', marginTop: 10 },
  horizontalCards: { paddingLeft: 18, paddingRight: 8 },
  vehicleCard: {
    width: 220,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginRight: 14,
    ...shadowCard,
  },
  vehicleTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  vehicleSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  vehiclePrice: { color: '#1d4ed8', fontSize: 15, fontWeight: '800', marginBottom: 14 },
  vehicleButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  vehicleButtonText: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
});
