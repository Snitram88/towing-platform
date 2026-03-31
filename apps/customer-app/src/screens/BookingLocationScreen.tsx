import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  describeReverseGeocode,
  estimateDurationMinutes,
  haversineKm,
  MapPoint,
  pointToRegion,
  suggestAddresses,
  AddressSuggestion,
} from '../lib/booking';

type Props = {
  navigation: any;
  route: {
    params?: {
      pickupAddress?: string;
      pickupPoint?: MapPoint | null;
      dropAddress?: string;
      dropPoint?: MapPoint | null;
    };
  };
};

type ActiveField = 'pickup' | 'drop';

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

export default function BookingLocationScreen({ navigation, route }: Props) {
  const [pickupAddress, setPickupAddress] = useState(route.params?.pickupAddress ?? '');
  const [pickupPoint, setPickupPoint] = useState<MapPoint | null>(route.params?.pickupPoint ?? null);
  const [dropAddress, setDropAddress] = useState(route.params?.dropAddress ?? '');
  const [dropPoint, setDropPoint] = useState<MapPoint | null>(route.params?.dropPoint ?? null);
  const [activeField, setActiveField] = useState<ActiveField>('pickup');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (route.params?.pickupAddress !== undefined) {
      setPickupAddress(route.params.pickupAddress ?? '');
      setPickupPoint(route.params.pickupPoint ?? null);
    }
    if (route.params?.dropAddress !== undefined) {
      setDropAddress(route.params.dropAddress ?? '');
      setDropPoint(route.params.dropPoint ?? null);
    }
  }, [route.params]);

  const activeQuery = activeField === 'pickup' ? pickupAddress : dropAddress;
  const suggestions = useMemo(() => suggestAddresses(activeQuery), [activeQuery]);

  const routeDistanceKm = pickupPoint && dropPoint ? haversineKm(pickupPoint, dropPoint) : 0;
  const routeDurationMin = routeDistanceKm ? estimateDurationMinutes(routeDistanceKm) : 0;

  const applySuggestion = (suggestion: AddressSuggestion) => {
    if (activeField === 'pickup') {
      setPickupAddress(suggestion.label);
      setPickupPoint(suggestion.point);
      setActiveField('drop');
    } else {
      setDropAddress(suggestion.label);
      setDropPoint(suggestion.point);
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);

    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      setLocating(false);
      Alert.alert(
        'Location not granted',
        'You can still type the pickup address manually or pin the pickup point on the map.'
      );
      return;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    const reverse = await Location.reverseGeocodeAsync(point);
    const label = describeReverseGeocode(reverse[0], point);

    setPickupAddress(label);
    setPickupPoint(point);
    setActiveField('drop');
    setLocating(false);
  };

  const canContinue = Boolean(pickupAddress && dropAddress && pickupPoint && dropPoint);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#0f172a" />
            </Pressable>
            <Text style={styles.headerTitle}>Your route</Text>
            <View style={{ width: 42 }} />
          </View>

          <View style={styles.formCard}>
            <View style={[styles.inputWrap, activeField === 'pickup' ? styles.inputWrapActive : null]}>
              <View style={styles.inputIconShell}>
                <Ionicons name="locate" size={16} color="#16a34a" />
              </View>
              <TextInput
                value={pickupAddress}
                onFocus={() => setActiveField('pickup')}
                onChangeText={(value) => {
                  setPickupAddress(value);
                  setPickupPoint(null);
                  setActiveField('pickup');
                }}
                placeholder="Pickup address"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
              <Pressable
                style={styles.mapButton}
                onPress={() =>
                  navigation.navigate('MapPicker', {
                    mode: 'pickup',
                    pickupAddress,
                    pickupPoint,
                    dropAddress,
                    dropPoint,
                  })
                }
              >
                <Text style={styles.mapButtonText}>Map</Text>
              </Pressable>
            </View>

            <View style={styles.connectorLine} />

            <View style={[styles.inputWrap, activeField === 'drop' ? styles.inputWrapActive : null]}>
              <View style={styles.inputIconShell}>
                <Ionicons name="flag" size={16} color="#2563eb" />
              </View>
              <TextInput
                value={dropAddress}
                onFocus={() => setActiveField('drop')}
                onChangeText={(value) => {
                  setDropAddress(value);
                  setDropPoint(null);
                  setActiveField('drop');
                }}
                placeholder="Dropoff location"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
              <Pressable
                style={styles.mapButton}
                onPress={() =>
                  navigation.navigate('MapPicker', {
                    mode: 'drop',
                    pickupAddress,
                    pickupPoint,
                    dropAddress,
                    dropPoint,
                  })
                }
              >
                <Text style={styles.mapButtonText}>Map</Text>
              </Pressable>
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.smallAction} onPress={useCurrentLocation}>
                <Ionicons name="locate-outline" size={16} color="#16a34a" />
                <Text style={styles.smallActionText}>{locating ? 'Locating...' : 'Use current location'}</Text>
              </Pressable>

              <Pressable
                style={styles.smallAction}
                onPress={() =>
                  navigation.navigate('MapPicker', {
                    mode: activeField,
                    pickupAddress,
                    pickupPoint,
                    dropAddress,
                    dropPoint,
                  })
                }
              >
                <Ionicons name="map-outline" size={16} color="#2563eb" />
                <Text style={styles.smallActionText}>Pick on map</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.suggestionsCard}>
            <Text style={styles.cardTitle}>
              {activeField === 'pickup' ? 'Pickup suggestions' : 'Dropoff suggestions'}
            </Text>

            {suggestions.map((suggestion) => (
              <Pressable key={suggestion.id} style={styles.suggestionRow} onPress={() => applySuggestion(suggestion)}>
                <View style={styles.suggestionIconShell}>
                  <Ionicons name="time-outline" size={16} color="#475569" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle}>{suggestion.label}</Text>
                  <Text style={styles.suggestionSubtitle}>{suggestion.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {(pickupPoint || dropPoint) ? (
            <View style={styles.mapPreviewCard}>
              <Text style={styles.cardTitle}>Route preview</Text>
              <MapView
                style={styles.previewMap}
                initialRegion={pointToRegion(pickupPoint ?? dropPoint!, 0.09)}
                region={pointToRegion(pickupPoint ?? dropPoint!, 0.09)}
              >
                {pickupPoint ? <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" /> : null}
                {dropPoint ? <Marker coordinate={dropPoint} title="Dropoff" pinColor="#2563eb" /> : null}
                {pickupPoint && dropPoint ? (
                  <Polyline
                    coordinates={[pickupPoint, dropPoint]}
                    strokeColor="#2563eb"
                    strokeWidth={4}
                  />
                ) : null}
              </MapView>

              {pickupPoint && dropPoint ? (
                <View style={styles.previewMetaRow}>
                  <View style={styles.metaPill}>
                    <Ionicons name="navigate-outline" size={14} color="#475569" />
                    <Text style={styles.metaPillText}>{routeDistanceKm.toFixed(1)} km</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Ionicons name="time-outline" size={14} color="#475569" />
                    <Text style={styles.metaPillText}>{routeDurationMin} min</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
            disabled={!canContinue}
            onPress={() =>
              navigation.navigate('BookingVehicle', {
                pickupAddress,
                pickupPoint,
                dropAddress,
                dropPoint,
                distanceKm: routeDistanceKm,
                durationMin: routeDurationMin,
              })
            }
          >
            <Text style={styles.primaryButtonText}>Continue to tow classes</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    ...shadowCard,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    paddingHorizontal: 12,
    minHeight: 60,
  },
  inputWrapActive: {
    borderColor: '#16a34a',
    backgroundColor: '#ffffff',
  },
  inputIconShell: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  mapButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
  },
  mapButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  connectorLine: {
    width: 2,
    height: 18,
    backgroundColor: '#cbd5e1',
    marginLeft: 28,
    marginVertical: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  smallAction: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 8,
    textAlign: 'center',
  },
  suggestionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    ...shadowCard,
  },
  cardTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionIconShell: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  suggestionSubtitle: { color: '#64748b', fontSize: 13 },
  mapPreviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    ...shadowCard,
  },
  previewMap: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewMetaRow: { flexDirection: 'row', marginTop: 14 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  metaPillText: { color: '#334155', fontSize: 12, fontWeight: '800', marginLeft: 6 },
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
