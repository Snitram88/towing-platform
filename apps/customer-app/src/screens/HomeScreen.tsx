import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  createNearbyTowUnits,
  estimateDurationMinutes,
  fallbackSuggestions,
  formatMoney,
  interpolatePoint,
  MapPoint,
  nearestTowUnit,
  pointToRegion,
  TowUnit,
  DEFAULT_POINT,
  DEFAULT_REGION,
  AddressSuggestion,
  RouteResult,
  randomSessionToken,
} from '../lib/booking';
import {
  autocompleteNigeriaAddresses,
  computeDrivingRoute,
  getPlaceDetails,
  reverseGeocodePoint,
} from '../lib/googleMaps';

type VehicleType = {
  id: string;
  name: string;
  tonnage_min: number;
  tonnage_max: number;
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
};

type Profile = {
  full_name: string | null;
  email: string | null;
};

type Props = {
  navigation: any;
};

type Stage = 'idle' | 'search' | 'quote' | 'tracking';
type ActiveField = 'pickup' | 'drop';
type PinTarget = 'pickup' | 'drop' | null;
type TrackingPhase = 'toPickup' | 'toDrop' | 'done';

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function quoteFor(vehicle: VehicleType, route: RouteResult | null) {
  if (!route) return Number(vehicle.base_fare);
  return (
    Number(vehicle.base_fare) +
    Number(vehicle.per_km_rate) * route.distanceKm +
    Number(vehicle.per_min_rate) * route.durationMin
  );
}

export default function HomeScreen({ navigation }: Props) {
  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ['24%', '50%', '88%'], []);
  const backdropComponent = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={1} disappearsOnIndex={0} opacity={0.16} />
    ),
    []
  );

  const [sheetIndex, setSheetIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [stage, setStage] = useState<Stage>('idle');

  const [currentPoint, setCurrentPoint] = useState<MapPoint>(DEFAULT_POINT);
  const [currentAddress, setCurrentAddress] = useState('Lagos live dispatch area');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [towUnits, setTowUnits] = useState<TowUnit[]>(createNearbyTowUnits(DEFAULT_POINT));

  const [pickupText, setPickupText] = useState('');
  const [dropText, setDropText] = useState('');
  const [pickupPoint, setPickupPoint] = useState<MapPoint | null>(null);
  const [dropPoint, setDropPoint] = useState<MapPoint | null>(null);
  const [activeField, setActiveField] = useState<ActiveField>('pickup');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>(fallbackSuggestions(''));
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [placesSessionToken] = useState(randomSessionToken());

  const [pinTarget, setPinTarget] = useState<PinTarget>(null);
  const [pinCandidate, setPinCandidate] = useState<MapPoint>(DEFAULT_POINT);

  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [creatingBooking, setCreatingBooking] = useState(false);
  const [trackingPhase, setTrackingPhase] = useState<TrackingPhase>('toPickup');
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [assignedTowStart, setAssignedTowStart] = useState<MapPoint | null>(null);

  const displayName = useMemo(() => {
    if (profile?.full_name?.trim()) return profile.full_name.split(' ')[0];
    if (profile?.email) return profile.email.split('@')[0];
    return 'there';
  }, [profile]);

  const selectedVehicle = useMemo(
    () => vehicleTypes.find((item) => item.id === selectedVehicleId) ?? null,
    [vehicleTypes, selectedVehicleId]
  );

  const trackingDriverPoint = useMemo(() => {
    if (!assignedTowStart || !pickupPoint || !dropPoint) return null;

    if (trackingPhase === 'toPickup') {
      return interpolatePoint(assignedTowStart, pickupPoint, trackingProgress);
    }

    if (trackingPhase === 'toDrop') {
      return interpolatePoint(pickupPoint, dropPoint, trackingProgress);
    }

    return dropPoint;
  }, [assignedTowStart, pickupPoint, dropPoint, trackingPhase, trackingProgress]);

  const activeRoutePolyline = useMemo(() => {
    if (stage === 'tracking' && trackingDriverPoint && pickupPoint && dropPoint) {
      if (trackingPhase === 'toPickup') return [trackingDriverPoint, pickupPoint];
      if (trackingPhase === 'toDrop') return [trackingDriverPoint, dropPoint];
      return [pickupPoint, dropPoint];
    }

    if (routeData?.polyline?.length) return routeData.polyline;
    return [];
  }, [stage, trackingDriverPoint, pickupPoint, dropPoint, trackingPhase, routeData]);

  useEffect(() => {
    if (!selectedVehicleId && vehicleTypes.length > 0) {
      setSelectedVehicleId(vehicleTypes[0].id);
    }
  }, [vehicleTypes, selectedVehicleId]);

  const loadBootstrap = async () => {
    setLoading(true);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (user) {
      const [{ data: profileRow }, { data: vehicleRows }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', user.id).single(),
        supabase
          .from('vehicle_types')
          .select('id, name, tonnage_min, tonnage_max, base_fare, per_km_rate, per_min_rate')
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

    const permission = await Location.getForegroundPermissionsAsync();
    const granted = permission.status === 'granted';
    setHasLocationPermission(granted);

    if (granted) {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const point = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCurrentPoint(point);
      setTowUnits(createNearbyTowUnits(point));

      const reverseLabel = await reverseGeocodePoint(point);
      setCurrentAddress(reverseLabel);
    } else {
      setCurrentPoint(DEFAULT_POINT);
      setCurrentAddress('Lagos live dispatch area');
      setTowUnits(createNearbyTowUnits(DEFAULT_POINT));
    }

    setLoading(false);
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (stage !== 'search') return;

    const query = activeField === 'pickup' ? pickupText : dropText;

    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      const results = await autocompleteNigeriaAddresses(query, placesSessionToken, currentPoint);
      setSuggestions(results);
      setSuggestionsLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [stage, activeField, pickupText, dropText, placesSessionToken, currentPoint]);

  useEffect(() => {
    if (stage !== 'tracking' || !assignedTowStart || !pickupPoint || !dropPoint) return;

    const interval = setInterval(() => {
      setTrackingProgress((prev) => {
        if (prev >= 1) {
          if (trackingPhase === 'toPickup') {
            setTrackingPhase('toDrop');
            return 0;
          }

          if (trackingPhase === 'toDrop') {
            setTrackingPhase('done');
            return 1;
          }

          return 1;
        }

        return Math.min(1, prev + 0.14);
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [stage, trackingPhase, assignedTowStart, pickupPoint, dropPoint]);

  const askForCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert(
        'Location not granted',
        'You can still type your pickup or set the exact point on the map.'
      );
      return;
    }

    setHasLocationPermission(true);

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    const label = await reverseGeocodePoint(point);

    setCurrentPoint(point);
    setCurrentAddress(label);
    setTowUnits(createNearbyTowUnits(point));
    setPickupPoint(point);
    setPickupText(label);
    setActiveField('drop');
    setStage('search');
    sheetRef.current?.snapToIndex(2);
    mapRef.current?.animateToRegion(pointToRegion(point, 0.03), 400);
  };

  const openSearch = () => {
    setStage('search');
    sheetRef.current?.snapToIndex(2);
  };

  const useCurrentForPickup = async () => {
    if (!hasLocationPermission) {
      await askForCurrentLocation();
      return;
    }

    setPickupPoint(currentPoint);
    setPickupText(currentAddress);
    setActiveField('drop');
    sheetRef.current?.snapToIndex(2);
  };

  const startPinMode = (target: PinTarget) => {
    setPinTarget(target);
    setStage('search');

    const focusPoint =
      target === 'pickup'
        ? pickupPoint || currentPoint
        : dropPoint || pickupPoint || currentPoint;

    setPinCandidate(focusPoint);
    mapRef.current?.animateToRegion(pointToRegion(focusPoint, 0.02), 300);
    sheetRef.current?.snapToIndex(0);
  };

  const confirmPinnedPoint = async () => {
    if (!pinTarget) return;

    const label = await reverseGeocodePoint(pinCandidate);

    if (pinTarget === 'pickup') {
      setPickupPoint(pinCandidate);
      setPickupText(label);
      setActiveField('drop');
    } else {
      setDropPoint(pinCandidate);
      setDropText(label);
    }

    setPinTarget(null);
    sheetRef.current?.snapToIndex(2);
  };

  const selectSuggestion = async (suggestion: AddressSuggestion) => {
    let point = suggestion.point;
    let title = suggestion.title;
    let subtitle = suggestion.subtitle;

    if (!point && suggestion.placeId) {
      const details = await getPlaceDetails(suggestion.placeId);
      if (!details) return;
      point = details.point;
      title = details.title;
      subtitle = details.subtitle;
    }

    if (!point) return;

    const fullLabel = subtitle ? `${title}, ${subtitle}` : title;

    if (activeField === 'pickup') {
      setPickupPoint(point);
      setPickupText(fullLabel);
      setActiveField('drop');
      mapRef.current?.animateToRegion(pointToRegion(point, 0.03), 300);
    } else {
      setDropPoint(point);
      setDropText(fullLabel);
      mapRef.current?.animateToRegion(pointToRegion(point, 0.03), 300);
    }
  };

  const buildRoute = async () => {
    if (!pickupPoint || !dropPoint) return;

    setRouteLoading(true);
    const route = await computeDrivingRoute(pickupPoint, dropPoint);
    setRouteData(route);
    setRouteLoading(false);
    setStage('quote');
    sheetRef.current?.snapToIndex(1);

    if (route.polyline.length > 1) {
      mapRef.current?.fitToCoordinates(route.polyline, {
        edgePadding: { top: 160, right: 40, bottom: 240, left: 40 },
        animated: true,
      });
    }
  };

  useEffect(() => {
    if (pickupPoint && dropPoint) {
      buildRoute();
    }
  }, [pickupPoint, dropPoint]);

  const handleCreateBooking = async () => {
    if (!pickupPoint || !dropPoint || !selectedVehicle || !routeData) return;

    setCreatingBooking(true);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!user) {
      setCreatingBooking(false);
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    const estimate = quoteFor(selectedVehicle, routeData);

    const { data: bookingRow, error } = await supabase
      .from('bookings')
      .insert({
        customer_id: user.id,
        vehicle_type_id: selectedVehicle.id,
        booking_status: 'searching_driver',
        payment_status: 'unpaid',
        pickup_address: pickupText,
        pickup_lat: pickupPoint.latitude,
        pickup_lng: pickupPoint.longitude,
        drop_address: dropText,
        drop_lat: dropPoint.latitude,
        drop_lng: dropPoint.longitude,
        estimated_distance_meters: Math.round(routeData.distanceKm * 1000),
        estimated_duration_seconds: Math.round(routeData.durationMin * 60),
        quoted_amount: Number(estimate.toFixed(2)),
      })
      .select('id')
      .single();

    if (error || !bookingRow) {
      setCreatingBooking(false);
      Alert.alert('Booking failed', error?.message || 'Could not create booking.');
      return;
    }

    await supabase.from('booking_status_history').insert({
      booking_id: bookingRow.id,
      new_status: 'searching_driver',
      changed_by: user.id,
      note: 'Customer created booking from map-first mobile flow',
    });

    const assigned = nearestTowUnit(pickupPoint, towUnits);

    setTrackingBookingId(bookingRow.id);
    setAssignedTowStart(assigned.point);
    setTrackingPhase('toPickup');
    setTrackingProgress(0);
    setStage('tracking');
    setCreatingBooking(false);
    sheetRef.current?.snapToIndex(1);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  };

  const renderSheetContent = () => {
    if (stage === 'idle') {
      return (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Pressable style={styles.whereCard} onPress={openSearch}>
            <View style={styles.whereIcon}>
              <Ionicons name="search" size={18} color="#0f172a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.whereTitle}>Where to?</Text>
              <Text style={styles.whereSubtitle}>Choose pickup, dropoff, or exact pin on map</Text>
            </View>
          </Pressable>

          <View style={styles.actionRow}>
            <Pressable style={styles.actionCard} onPress={openSearch}>
              <Ionicons name="car-sport-outline" size={20} color="#2563eb" />
              <Text style={styles.actionText}>Book tow</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => navigation.navigate('History')}>
              <Ionicons name="time-outline" size={20} color="#0f766e" />
              <Text style={styles.actionText}>Rides</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#7c3aed" />
              <Text style={styles.actionText}>Logout</Text>
            </Pressable>
          </View>
        </BottomSheetScrollView>
      );
    }

    if (stage === 'search') {
      return (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Set your route</Text>
          <Text style={styles.sheetSubtitle}>
            Type addresses, use current location, or pin the exact point on the map.
          </Text>

          <View style={[styles.inputCard, activeField === 'pickup' ? styles.inputCardActive : null]}>
            <View style={styles.inputMarkerShell}>
              <Ionicons name="locate" size={16} color="#16a34a" />
            </View>
            <BottomSheetTextInput
              value={pickupText}
              onFocus={() => {
                setActiveField('pickup');
                sheetRef.current?.snapToIndex(2);
              }}
              onChangeText={(value) => {
                setPickupText(value);
                setPickupPoint(null);
                setActiveField('pickup');
                setStage('search');
              }}
              placeholder="Pickup address"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <Pressable style={styles.inlineMapButton} onPress={() => startPinMode('pickup')}>
              <Text style={styles.inlineMapButtonText}>Pin</Text>
            </Pressable>
          </View>

          <View style={styles.connectorLine} />

          <View style={[styles.inputCard, activeField === 'drop' ? styles.inputCardActive : null]}>
            <View style={styles.inputMarkerShell}>
              <Ionicons name="flag" size={16} color="#2563eb" />
            </View>
            <BottomSheetTextInput
              value={dropText}
              onFocus={() => {
                setActiveField('drop');
                sheetRef.current?.snapToIndex(2);
              }}
              onChangeText={(value) => {
                setDropText(value);
                setDropPoint(null);
                setActiveField('drop');
                setStage('search');
              }}
              placeholder="Dropoff location"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <Pressable style={styles.inlineMapButton} onPress={() => startPinMode('drop')}>
              <Text style={styles.inlineMapButtonText}>Pin</Text>
            </Pressable>
          </View>

          <View style={styles.helperRow}>
            <Pressable style={styles.helperButton} onPress={useCurrentForPickup}>
              <Ionicons name="locate-outline" size={16} color="#16a34a" />
              <Text style={styles.helperButtonText}>Use current location</Text>
            </Pressable>

            <Pressable style={styles.helperButton} onPress={() => startPinMode(activeField)}>
              <Ionicons name="map-outline" size={16} color="#2563eb" />
              <Text style={styles.helperButtonText}>Pick exact spot</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeading}>
            {activeField === 'pickup' ? 'Pickup suggestions' : 'Dropoff suggestions'}
          </Text>

          {suggestionsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.loadingText}>Searching addresses…</Text>
            </View>
          ) : (
            suggestions.map((item) => (
              <Pressable key={item.id} style={styles.suggestionRow} onPress={() => selectSuggestion(item)}>
                <View style={styles.suggestionIconShell}>
                  <Ionicons name="location-outline" size={16} color="#475569" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle}>{item.title}</Text>
                  <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text>
                </View>
              </Pressable>
            ))
          )}
        </BottomSheetScrollView>
      );
    }

    if (stage === 'quote') {
      return (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Confirm your route</Text>
          <Text style={styles.sheetSubtitle}>
            Route, ETA, and tow class are ready. Pick the truck class that fits the vehicle.
          </Text>

          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeAddress}>{pickupText}</Text>
            <Text style={styles.routeArrow}>↓</Text>
            <Text style={styles.routeAddress}>{dropText}</Text>

            <View style={styles.routeMetaRow}>
              <View style={styles.metaPill}>
                <Ionicons name="navigate-outline" size={14} color="#475569" />
                <Text style={styles.metaPillText}>
                  {routeLoading ? '...' : `${routeData?.distanceKm.toFixed(1)} km`}
                </Text>
              </View>

              <View style={styles.metaPill}>
                <Ionicons name="time-outline" size={14} color="#475569" />
                <Text style={styles.metaPillText}>
                  {routeLoading ? '...' : `${routeData?.durationMin} min`}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Tow classes</Text>

          {vehicleTypes.map((vehicle, index) => {
            const active = vehicle.id === selectedVehicleId;
            const estimate = routeData ? quoteFor(vehicle, routeData) : Number(vehicle.base_fare);

            return (
              <Pressable
                key={vehicle.id}
                style={[styles.vehicleCard, active ? styles.vehicleCardActive : null]}
                onPress={() => setSelectedVehicleId(vehicle.id)}
              >
                <View style={styles.vehicleTopRow}>
                  <View>
                    <Text style={[styles.vehicleTitle, active ? styles.vehicleTitleActive : null]}>
                      {vehicle.name}
                    </Text>
                    <Text style={styles.vehicleSubtitle}>
                      {vehicle.tonnage_min}t - {vehicle.tonnage_max}t capacity
                    </Text>
                  </View>

                  {index === 0 ? (
                    <View style={styles.recommendedChip}>
                      <Text style={styles.recommendedChipText}>Recommended</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.vehicleQuoteRow}>
                  <Text style={styles.vehicleEtaLabel}>{Math.max(5, routeData?.durationMin || estimateDurationMinutes(6))} min arrival</Text>
                  <Text style={styles.vehiclePrice}>{formatMoney(estimate)}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.primaryButton, (!selectedVehicle || creatingBooking) ? styles.primaryButtonDisabled : null]}
            disabled={!selectedVehicle || creatingBooking}
            onPress={handleCreateBooking}
          >
            {creatingBooking ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Confirm tow</Text>}
          </Pressable>
        </BottomSheetScrollView>
      );
    }

    return (
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>
          {trackingPhase === 'toPickup'
            ? trackingProgress >= 1
              ? 'Tow truck arrived'
              : 'Tow truck is coming'
            : trackingPhase === 'toDrop'
            ? 'Heading to destination'
            : 'Trip completed'}
        </Text>

        <Text style={styles.sheetSubtitle}>
          {trackingPhase === 'toPickup'
            ? 'Watch the truck move toward your pickup point.'
            : trackingPhase === 'toDrop'
            ? 'The truck is moving toward your dropoff point now.'
            : 'Your demo tracking flow is complete.'}
        </Text>

        <View style={styles.trackingCard}>
          <Text style={styles.trackingLabel}>Booking</Text>
          <Text style={styles.trackingValue}>{trackingBookingId || 'Pending'}</Text>

          <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Status</Text>
          <Text style={styles.trackingValue}>
            {trackingPhase === 'toPickup'
              ? trackingProgress >= 1
                ? 'Driver arrived'
                : 'Driver en route'
              : trackingPhase === 'toDrop'
              ? 'In service'
              : 'Completed'}
          </Text>
        </View>

        <View style={styles.helperRow}>
          <Pressable style={styles.helperButton} onPress={() => Alert.alert('Driver contact', 'Call/chat hooks come next.')}>
            <Ionicons name="call-outline" size={16} color="#16a34a" />
            <Text style={styles.helperButtonText}>Call driver</Text>
          </Pressable>

          <Pressable style={styles.helperButton} onPress={() => navigation.navigate('History')}>
            <Ionicons name="time-outline" size={16} color="#2563eb" />
            <Text style={styles.helperButtonText}>View rides</Text>
          </Pressable>
        </View>
      </BottomSheetScrollView>
    );
  };

  const mapRegion: Region = useMemo(() => {
    if (pinTarget) return pointToRegion(pinCandidate, 0.02);
    if (trackingDriverPoint) return pointToRegion(trackingDriverPoint, 0.06);
    if (pickupPoint) return pointToRegion(pickupPoint, 0.06);
    return pointToRegion(currentPoint, 0.08);
  }, [pinTarget, pinCandidate, trackingDriverPoint, pickupPoint, currentPoint]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          initialRegion={DEFAULT_REGION}
          region={mapRegion}
          onRegionChangeComplete={(region) => {
            if (!pinTarget) return;
            setPinCandidate({
              latitude: region.latitude,
              longitude: region.longitude,
            });
          }}
          showsUserLocation={hasLocationPermission}
          showsMyLocationButton={false}
        >
          {stage !== 'tracking' && towUnits.map((unit) => (
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

          {pickupPoint ? <Marker coordinate={pickupPoint} title="Pickup" pinColor="#16a34a" /> : null}
          {dropPoint ? <Marker coordinate={dropPoint} title="Dropoff" pinColor="#2563eb" /> : null}

          {stage === 'tracking' && trackingDriverPoint ? (
            <Marker coordinate={trackingDriverPoint} title="Tow truck">
              <View style={styles.driverMarker}>
                <Ionicons name="car-sport" size={14} color="#ffffff" />
              </View>
            </Marker>
          ) : null}

          {activeRoutePolyline.length > 1 ? (
            <Polyline coordinates={activeRoutePolyline} strokeColor="#2563eb" strokeWidth={4} />
          ) : null}
        </MapView>

        <View style={styles.topOverlay}>
          <View style={styles.topCard}>
            <Text style={styles.topEyebrow}>TowSwift</Text>
            <Text style={styles.topTitle}>Hi, {displayName}</Text>
            <Text style={styles.topSubtitle}>
              {pinTarget
                ? `Move the map and confirm the exact ${pinTarget} point`
                : 'Swipe the sheet down for more map or up for the full route builder.'}
            </Text>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#0f172a" />
          </Pressable>
        </View>

        {sheetIndex === 0 && !pinTarget ? (
          <Pressable style={styles.reopenButton} onPress={() => sheetRef.current?.snapToIndex(2)}>
            <Ionicons name="search" size={16} color="#ffffff" />
            <Text style={styles.reopenButtonText}>Where to?</Text>
          </Pressable>
        ) : null}

        {pinTarget ? (
          <>
            <View pointerEvents="none" style={styles.centerPinWrap}>
              <View style={styles.centerPin}>
                <Ionicons
                  name={pinTarget === 'pickup' ? 'locate' : 'flag'}
                  size={18}
                  color="#ffffff"
                />
              </View>
            </View>

            <View style={styles.pinConfirmCard}>
              <Text style={styles.pinConfirmTitle}>
                Confirm exact {pinTarget === 'pickup' ? 'pickup' : 'dropoff'}
              </Text>
              <Pressable style={styles.primaryButton} onPress={confirmPinnedPoint}>
                <Text style={styles.primaryButtonText}>Use this point</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          onChange={(index) => setSheetIndex(index)}
          backdropComponent={backdropComponent}
          enablePanDownToClose={false}
          handleIndicatorStyle={styles.handleIndicator}
          backgroundStyle={styles.sheetBackground}
        >
          {renderSheetContent()}
        </BottomSheet>

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#ffffff" size="large" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  root: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    padding: 16,
    marginRight: 10,
    ...shadowCard,
  },
  topEyebrow: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  topTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  topSubtitle: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  logoutButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  reopenButton: {
    position: 'absolute',
    bottom: 122,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadowCard,
  },
  reopenButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  truckMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  driverMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  centerPinWrap: {
    position: 'absolute',
    top: '47%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
  },
  centerPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  pinConfirmCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 120,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    padding: 16,
    ...shadowCard,
  },
  pinConfirmTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  handleIndicator: {
    backgroundColor: '#cbd5e1',
    width: 44,
  },
  sheetBackground: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  whereCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  whereIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  whereTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 3,
  },
  whereSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  actionCard: {
    width: '31.5%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  sectionHeading: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  sheetSubtitle: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
  },
  inputCardActive: {
    borderColor: '#16a34a',
    backgroundColor: '#ffffff',
  },
  inputMarkerShell: {
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
  inlineMapButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inlineMapButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  connectorLine: {
    width: 2,
    height: 18,
    backgroundColor: '#cbd5e1',
    marginLeft: 28,
    marginVertical: 8,
  },
  helperRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 16,
  },
  helperButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 10,
  },
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
  suggestionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  suggestionSubtitle: {
    color: '#64748b',
    fontSize: 12,
  },
  routeSummaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },
  routeAddress: {
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  routeArrow: {
    color: '#94a3b8',
    fontSize: 16,
    marginVertical: 8,
  },
  routeMetaRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
  },
  metaPillText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  vehicleCardActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  vehicleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    alignItems: 'center',
  },
  vehicleTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  vehicleTitleActive: {
    color: '#166534',
  },
  vehicleSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  recommendedChip: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recommendedChipText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  vehicleQuoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleEtaLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  vehiclePrice: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  trackingCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  trackingLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  trackingValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,17,31,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
