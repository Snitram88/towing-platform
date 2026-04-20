import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
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
  MapPoint,
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

/* =========================================================
   TYPES
========================================================= */

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
  avatar_url: string | null;
};

type ActiveBooking = {
  id: string;
  booking_status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_address: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  quoted_amount: number | null;
  created_at: string | null;
};

type Props = {
  navigation: any;
};

type Stage = 'idle' | 'search' | 'quote' | 'tracking';
type ActiveField = 'pickup' | 'drop';
type PinTarget = 'pickup' | 'drop' | null;
type PaymentMethod = 'wallet' | 'cash' | 'paystack';

type WalletPreview = {
  balance: number;
  currency: string;
  ready: boolean;
};

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVE_BOOKING_STATUSES = [
  'searching_driver',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_service',
];

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

/* =========================================================
   HELPERS
========================================================= */

function quoteFor(vehicle: VehicleType, route: RouteResult | null) {
  if (!route) return Number(vehicle.base_fare);
  return (
    Number(vehicle.base_fare) +
    Number(vehicle.per_km_rate) * route.distanceKm +
    Number(vehicle.per_min_rate) * route.durationMin
  );
}

function initialsFromName(name?: string | null, fallback = 'C') {
  const safe = (name || '').trim();
  if (!safe) return fallback;

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatNaira(value?: number | null) {
  return `₦${Number(value || 0).toFixed(2)}`;
}

function trackingTitle(status?: string | null) {
  switch (status) {
    case 'searching_driver':
      return 'Finding a tow truck';
    case 'driver_assigned':
    case 'driver_en_route':
      return 'Driver is on the way';
    case 'driver_arrived':
      return 'Driver has arrived';
    case 'in_service':
      return 'Trip in progress';
    case 'completed':
      return 'Trip completed';
    default:
      return 'Track your booking';
  }
}

function trackingSubtitle(status?: string | null) {
  switch (status) {
    case 'searching_driver':
      return 'We are matching your request with the nearest available driver.';
    case 'driver_assigned':
    case 'driver_en_route':
      return 'Your tow driver has been assigned and is heading to your pickup point.';
    case 'driver_arrived':
      return 'Your driver has arrived at the pickup point.';
    case 'in_service':
      return 'Your vehicle is currently being transported to the destination.';
    case 'completed':
      return 'Your towing request has been completed successfully.';
    default:
      return 'Your booking details will appear here.';
  }
}

function canCallDriver(status?: string | null, phone?: string | null) {
  if (!phone) return false;
  if (!status) return false;

  return ![
    'searching_driver',
    'completed',
    'canceled_by_customer',
    'canceled_by_driver',
    'canceled_by_admin',
  ].includes(status);
}

function bookingLine(
  booking: ActiveBooking | null,
  liveDriverPoint: MapPoint | null,
  routePolyline: MapPoint[]
) {
  if (booking) {
    const pickup =
      booking.pickup_lat != null && booking.pickup_lng != null
        ? { latitude: Number(booking.pickup_lat), longitude: Number(booking.pickup_lng) }
        : null;

    const drop =
      booking.drop_lat != null && booking.drop_lng != null
        ? { latitude: Number(booking.drop_lat), longitude: Number(booking.drop_lng) }
        : null;

    if (
      ['driver_assigned', 'driver_en_route'].includes(booking.booking_status || '') &&
      liveDriverPoint &&
      pickup
    ) {
      return [liveDriverPoint, pickup];
    }

    if (booking.booking_status === 'in_service' && liveDriverPoint && drop) {
      return [liveDriverPoint, drop];
    }

    if (pickup && drop) {
      return [pickup, drop];
    }
  }

  return routePolyline;
}

/* =========================================================
   SCREEN
========================================================= */

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

  /* =======================================================
     STATE
  ======================================================= */

  const [sheetIndex, setSheetIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [userId, setUserId] = useState('');

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

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [walletPreview, setWalletPreview] = useState<WalletPreview>({
    balance: 0,
    currency: 'NGN',
    ready: false,
  });

  const [creatingBooking, setCreatingBooking] = useState(false);
  const [trackingBookingId, setTrackingBookingId] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [liveDriverPoint, setLiveDriverPoint] = useState<MapPoint | null>(null);

  /* =======================================================
     MEMOS
  ======================================================= */

  const displayName = useMemo(() => {
    if (profile?.full_name?.trim()) return profile.full_name.split(' ')[0];
    if (profile?.email) return profile.email.split('@')[0];
    return 'there';
  }, [profile]);

  const displayInitials = useMemo(() => {
    return initialsFromName(profile?.full_name || profile?.email, 'C');
  }, [profile]);

  const selectedVehicle = useMemo(
    () => vehicleTypes.find((item) => item.id === selectedVehicleId) ?? null,
    [vehicleTypes, selectedVehicleId]
  );

  const resolvedPickupPoint = useMemo(() => {
    if (activeBooking?.pickup_lat != null && activeBooking?.pickup_lng != null) {
      return {
        latitude: Number(activeBooking.pickup_lat),
        longitude: Number(activeBooking.pickup_lng),
      };
    }
    return pickupPoint;
  }, [activeBooking, pickupPoint]);

  const resolvedDropPoint = useMemo(() => {
    if (activeBooking?.drop_lat != null && activeBooking?.drop_lng != null) {
      return {
        latitude: Number(activeBooking.drop_lat),
        longitude: Number(activeBooking.drop_lng),
      };
    }
    return dropPoint;
  }, [activeBooking, dropPoint]);

  const activeRoutePolyline = useMemo(() => {
    return bookingLine(activeBooking, liveDriverPoint, routeData?.polyline ?? []);
  }, [activeBooking, liveDriverPoint, routeData]);

  const mapRegion: Region = useMemo(() => {
    if (pinTarget) return pointToRegion(pinCandidate, 0.02);
    if (liveDriverPoint) return pointToRegion(liveDriverPoint, 0.04);
    if (resolvedPickupPoint) return pointToRegion(resolvedPickupPoint, 0.06);
    return pointToRegion(currentPoint, 0.08);
  }, [pinTarget, pinCandidate, liveDriverPoint, resolvedPickupPoint, currentPoint]);

  /* =======================================================
     DATA LOADERS
  ======================================================= */

  const loadWalletPreview = useCallback(async (customerId: string) => {
  const walletRes = await supabase
    .from('customer_wallets')
    .select('balance, currency')
    .eq('customer_id', customerId)
    .maybeSingle();

  if (!walletRes.error && walletRes.data) {
    setWalletPreview({
      balance: Number(walletRes.data.balance ?? 0),
      currency: walletRes.data.currency ?? 'NGN',
      ready: true,
    });
  } else {
    setWalletPreview({
      balance: 0,
      currency: 'NGN',
      ready: false,
    });
  }
}, []);

  const loadBookingDetails = useCallback(
    async (customerId: string, explicitBookingId?: string | null) => {
      let bookingRow: any = null;

      if (explicitBookingId) {
        const { data, error } = await supabase
          .from('bookings')
          .select(
            'id, booking_status, payment_status, payment_method, driver_id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, quoted_amount, created_at'
          )
          .eq('customer_id', customerId)
          .eq('id', explicitBookingId)
          .maybeSingle();

        if (error) throw error;
        bookingRow = data;
      } else {
        const { data, error } = await supabase
          .from('bookings')
          .select(
            'id, booking_status, payment_status, payment_method, driver_id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, quoted_amount, created_at'
          )
          .eq('customer_id', customerId)
          .in('booking_status', ACTIVE_BOOKING_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        bookingRow = data?.[0] ?? null;
      }

      if (!bookingRow) {
        if (!explicitBookingId) {
          setActiveBooking(null);
          setLiveDriverPoint(null);
        }
        return null;
      }

      let driverName: string | null = null;
      let driverPhone: string | null = null;

      if (bookingRow.driver_id) {
        const { data: driverProfile, error: driverProfileError } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', bookingRow.driver_id)
          .maybeSingle();

        if (!driverProfileError && driverProfile) {
          driverName = driverProfile.full_name ?? null;
          driverPhone = driverProfile.phone ?? null;
        }

        const { data: locationRows, error: driverLocationError } = await supabase
          .from('driver_locations')
          .select('latitude, longitude, updated_at')
          .eq('driver_id', bookingRow.driver_id)
          .eq('booking_id', bookingRow.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!driverLocationError && locationRows?.length) {
          const latest = locationRows[0];
          setLiveDriverPoint({
            latitude: Number(latest.latitude),
            longitude: Number(latest.longitude),
          });
        } else {
          setLiveDriverPoint(null);
        }
      } else {
        setLiveDriverPoint(null);
      }

      const nextBooking: ActiveBooking = {
        id: bookingRow.id,
        booking_status: bookingRow.booking_status ?? null,
        payment_status: bookingRow.payment_status ?? null,
        payment_method: bookingRow.payment_method ?? null,
        driver_id: bookingRow.driver_id ?? null,
        driver_name: driverName,
        driver_phone: driverPhone,
        pickup_address: bookingRow.pickup_address ?? null,
        pickup_lat: bookingRow.pickup_lat ?? null,
        pickup_lng: bookingRow.pickup_lng ?? null,
        drop_address: bookingRow.drop_address ?? null,
        drop_lat: bookingRow.drop_lat ?? null,
        drop_lng: bookingRow.drop_lng ?? null,
        quoted_amount: bookingRow.quoted_amount ?? null,
        created_at: bookingRow.created_at ?? null,
      };

      setActiveBooking(nextBooking);
      setTrackingBookingId(bookingRow.id);
      return nextBooking;
    },
    []
  );

  const loadBootstrap = useCallback(async () => {
    setLoading(true);

    try {
      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;

      if (user) {
        setUserId(user.id);
        await loadWalletPreview(user.id);

        const [{ data: profileRow }, { data: vehicleRows }] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, email, avatar_url')
            .eq('id', user.id)
            .single(),
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
            avatar_url: null,
          }
        );
        setVehicleTypes((vehicleRows ?? []) as VehicleType[]);

        const existingBooking = await loadBookingDetails(user.id);
        if (existingBooking) {
          setStage('tracking');
        }
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
    } finally {
      setLoading(false);
    }
  }, [loadBookingDetails, loadWalletPreview]);

  /* =======================================================
     EFFECTS
  ======================================================= */

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!selectedVehicleId && vehicleTypes.length > 0) {
      setSelectedVehicleId(vehicleTypes[0].id);
    }
  }, [vehicleTypes, selectedVehicleId]);

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
    if (!userId || !trackingBookingId) return;

    const interval = setInterval(() => {
      loadBookingDetails(userId, trackingBookingId).catch((error) => {
        console.log(
          '[customer-booking-poll]',
          error instanceof Error ? error.message : String(error)
        );
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [userId, trackingBookingId, loadBookingDetails]);

  useEffect(() => {
    if (pickupPoint && dropPoint) {
      void buildRoute();
    }
  }, [pickupPoint, dropPoint]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) {
        void loadWalletPreview(userId);
        void loadBookingDetails(userId, trackingBookingId);
      }
    });

    return () => sub.remove();
  }, [userId, trackingBookingId, loadWalletPreview, loadBookingDetails]);

  /* =======================================================
     ACTIONS
  ======================================================= */

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
    if (activeBooking && ACTIVE_BOOKING_STATUSES.includes(activeBooking.booking_status || '')) {
      Alert.alert(
        'Booking in progress',
        'You already have an active towing request. Please finish it before creating another one.'
      );
      return;
    }

    setStage('search');
    sheetRef.current?.snapToIndex(2);
  };

  const goBackToIdle = () => {
    setPinTarget(null);
    setStage('idle');
    sheetRef.current?.snapToIndex(0);
  };

  const backToSearch = () => {
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

    if (userId) {
      await loadWalletPreview(userId);
    }

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

 const handleCreateBooking = async () => {
  if (!pickupPoint || !dropPoint || !selectedVehicle || !routeData) return;

  setCreatingBooking(true);

  try {
    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!user) {
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    const estimate = Number(quoteFor(selectedVehicle, routeData).toFixed(2));

    if (paymentMethod === 'wallet') {
      const walletRes = await supabase
        .from('customer_wallets')
        .select('balance')
        .eq('customer_id', user.id)
        .maybeSingle();

      const balance = Number(walletRes.data?.balance ?? 0);

      if (balance < estimate) {
        Alert.alert(
          'Insufficient wallet balance',
          `Your wallet balance is ${formatNaira(balance)}`
        );
        return;
      }
    }

    const initialPaymentStatus =
      paymentMethod === 'paystack' ? 'pending' : 'unpaid';

    const { data: bookingRow, error } = await supabase
      .from('bookings')
      .insert({
        customer_id: user.id,
        vehicle_type_id: selectedVehicle.id,
        booking_status: 'searching_driver',
        payment_status: initialPaymentStatus,
        payment_method: paymentMethod,
        pickup_address: pickupText,
        pickup_lat: pickupPoint.latitude,
        pickup_lng: pickupPoint.longitude,
        drop_address: dropText,
        drop_lat: dropPoint.latitude,
        drop_lng: dropPoint.longitude,
        estimated_distance_meters: Math.round(routeData.distanceKm * 1000),
        estimated_duration_seconds: Math.round(routeData.durationMin * 60),
        quoted_amount: estimate,
      })
      .select('id')
      .single();

    if (error || !bookingRow) {
      Alert.alert('Booking failed', error?.message || 'Error creating booking');
      return;
    }

    if (paymentMethod === 'wallet') {
      const { data, error: walletError } = await supabase.rpc(
        'pay_customer_booking_with_wallet',
        {
          p_booking_id: bookingRow.id,
          p_customer_id: user.id,
        }
      );

      if (walletError || !data?.success) {
        await supabase
          .from('bookings')
          .delete()
          .eq('id', bookingRow.id)
          .eq('customer_id', user.id);

        Alert.alert(
          'Wallet payment failed',
          walletError?.message || data?.message || 'Could not complete wallet payment.'
        );
        return;
      }

      await loadWalletPreview(user.id);
    }

    await supabase.from('booking_status_history').insert({
      booking_id: bookingRow.id,
      new_status: 'searching_driver',
      changed_by: user.id,
      note: `Customer created booking. Payment method: ${paymentMethod}.`,
    });

    setTrackingBookingId(bookingRow.id);
    await loadBookingDetails(user.id, bookingRow.id);

    setStage('tracking');
    sheetRef.current?.snapToIndex(1);

    if (paymentMethod === 'paystack') {
      const { data, error: paystackError } = await supabase.functions.invoke(
        'paystack-initialize-booking-payment',
        {
          body: {
            booking_id: bookingRow.id,
            email: user.email,
            amount: estimate,
          },
        }
      );

      if (paystackError || !data?.data?.authorization_url) {
        Alert.alert(
          'Payment init failed',
          paystackError?.message ||
            data?.error ||
            'Could not start Paystack payment.'
        );
        return;
      }

      Alert.alert(
        'Continue payment',
        'You will now be redirected to Paystack to complete payment.'
      );

      await Linking.openURL(data.data.authorization_url);
    }
  } catch (error) {
    Alert.alert(
      'Booking failed',
      error instanceof Error ? error.message : 'Something went wrong.'
    );
  } finally {
    setCreatingBooking(false);
  }
};

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  };

  const callDriver = async () => {
    const phone = activeBooking?.driver_phone;

    if (!phone) {
      Alert.alert('Driver unavailable', 'A driver phone number is not available yet.');
      return;
    }

    const url = `tel:${phone}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Call failed', 'Your device could not open the phone dialer.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Call failed', 'Could not start the phone call.');
    }
  };

  const closeCompletedBooking = () => {
    setTrackingBookingId(null);
    setActiveBooking(null);
    setLiveDriverPoint(null);
    setPickupText('');
    setDropText('');
    setPickupPoint(null);
    setDropPoint(null);
    setRouteData(null);
    setStage('idle');
    sheetRef.current?.snapToIndex(0);
  };

  const renderSheetHeader = (title: string, onBack: () => void) => {
    return (
      <View style={styles.sheetHeaderRow}>
        <Pressable style={styles.sheetBackButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={16} color="#0f172a" />
          <Text style={styles.sheetBackText}>Back</Text>
        </Pressable>
        <Text style={styles.sheetHeaderSpacer}>{title}</Text>
      </View>
    );
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

          <View style={styles.actionGrid}>
            <Pressable style={styles.actionCard} onPress={openSearch}>
              <Ionicons name="car-sport-outline" size={20} color="#2563eb" />
              <Text style={styles.actionText}>Book tow</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => navigation.navigate('History')}>
              <Ionicons name="time-outline" size={20} color="#0f766e" />
              <Text style={styles.actionText}>Rides</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => navigation.navigate('Profile')}>
              <Ionicons name="person-circle-outline" size={20} color="#7c3aed" />
              <Text style={styles.actionText}>Profile</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => navigation.navigate('Wallet')}>
              <Ionicons name="wallet-outline" size={20} color="#16a34a" />
              <Text style={styles.actionText}>Wallet</Text>
            </Pressable>
          </View>
        </BottomSheetScrollView>
      );
    }

    if (stage === 'search') {
      return (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {renderSheetHeader('Search', goBackToIdle)}

          <Text style={styles.sheetTitle}>Set your route</Text>
          <Text style={styles.sheetSubtitle}>
            Type addresses, use current location, or pin the exact point on the map.
          </Text>

          <View
            style={[
              styles.inputCard,
              activeField === 'pickup' ? styles.inputCardActive : null,
            ]}
          >
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

          <View
            style={[
              styles.inputCard,
              activeField === 'drop' ? styles.inputCardActive : null,
            ]}
          >
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
              <Pressable
                key={item.id}
                style={styles.suggestionRow}
                onPress={() => selectSuggestion(item)}
              >
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
      const currentEstimate = Number(
        quoteFor(selectedVehicle as VehicleType, routeData).toFixed(2)
      );
      const walletShort = walletPreview.balance < currentEstimate;

      return (
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {renderSheetHeader('Confirm route', backToSearch)}

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
                    <Text
                      style={[
                        styles.vehicleTitle,
                        active ? styles.vehicleTitleActive : null,
                      ]}
                    >
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
                  <Text style={styles.vehicleEtaLabel}>
                    {Math.max(5, routeData?.durationMin || estimateDurationMinutes(6))} min arrival
                  </Text>
                  <Text style={styles.vehiclePrice}>{formatNaira(estimate)}</Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={styles.sectionHeading}>Payment</Text>

          <View style={styles.paymentWrap}>
            <Pressable
              style={[
                styles.paymentOptionCard,
                paymentMethod === 'wallet' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setPaymentMethod('wallet')}
            >
              <View style={styles.paymentOptionTopRow}>
                <View>
                  <Text
                    style={[
                      styles.paymentOptionTitle,
                      paymentMethod === 'wallet' && styles.paymentOptionTitleActive,
                    ]}
                  >
                    Wallet
                  </Text>
                  <Text style={styles.paymentOptionSubtitle}>
                    Pay now using your wallet balance
                  </Text>
                </View>

                <Ionicons
                  name={paymentMethod === 'wallet' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentMethod === 'wallet' ? '#16a34a' : '#94a3b8'}
                />
              </View>

              <View style={styles.paymentMetaPill}>
                <Text style={styles.paymentMetaPillText}>
                  Balance: {formatNaira(walletPreview.balance)}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.paymentOptionCard,
                paymentMethod === 'paystack' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setPaymentMethod('paystack')}
            >
              <View style={styles.paymentOptionTopRow}>
                <View>
                  <Text
                    style={[
                      styles.paymentOptionTitle,
                      paymentMethod === 'paystack' && styles.paymentOptionTitleActive,
                    ]}
                  >
                    Paystack
                  </Text>
                  <Text style={styles.paymentOptionSubtitle}>
                    Pay securely with card or bank
                  </Text>
                </View>

                <Ionicons
                  name={paymentMethod === 'paystack' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentMethod === 'paystack' ? '#16a34a' : '#94a3b8'}
                />
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.paymentOptionCard,
                paymentMethod === 'cash' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setPaymentMethod('cash')}
            >
              <View style={styles.paymentOptionTopRow}>
                <View>
                  <Text
                    style={[
                      styles.paymentOptionTitle,
                      paymentMethod === 'cash' && styles.paymentOptionTitleActive,
                    ]}
                  >
                    Cash
                  </Text>
                  <Text style={styles.paymentOptionSubtitle}>
                    Pay after the towing service
                  </Text>
                </View>

                <Ionicons
                  name={paymentMethod === 'cash' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={paymentMethod === 'cash' ? '#16a34a' : '#94a3b8'}
                />
              </View>
            </Pressable>

            {paymentMethod === 'wallet' && walletShort ? (
              <View style={styles.paymentWarningCard}>
                <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
                <Text style={styles.paymentWarningText}>
                  Wallet balance is lower than this trip estimate. Top up your wallet or switch to
                  cash.
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              !selectedVehicle || creatingBooking ? styles.primaryButtonDisabled : null,
            ]}
            disabled={!selectedVehicle || creatingBooking}
            onPress={handleCreateBooking}
          >
            {creatingBooking ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {paymentMethod === 'wallet'
                  ? 'Pay & request tow'
                  : paymentMethod === 'paystack'
                  ? 'Continue to Paystack'
                  : 'Request tow'}
              </Text>
            )}
          </Pressable>
        </BottomSheetScrollView>
      );
    }

    return (
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>{trackingTitle(activeBooking?.booking_status)}</Text>
        <Text style={styles.sheetSubtitle}>{trackingSubtitle(activeBooking?.booking_status)}</Text>

        <View style={styles.trackingCard}>
          <Text style={styles.trackingLabel}>Booking</Text>
          <Text style={styles.trackingValue}>
            {activeBooking?.id || trackingBookingId || 'Pending'}
          </Text>

          <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Status</Text>
          <Text style={styles.trackingValue}>
            {titleize(activeBooking?.booking_status || 'searching_driver')}
          </Text>

          <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Driver</Text>
          <Text style={styles.trackingValue}>
            {activeBooking?.driver_name ||
              (activeBooking?.driver_id ? 'Assigned driver' : 'Waiting for assignment')}
          </Text>

          <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Payment method</Text>
          <Text style={styles.trackingValue}>
            {titleize(activeBooking?.payment_method || 'cash')}
          </Text>

          <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Payment status</Text>
          <Text style={styles.trackingValue}>
            {titleize(activeBooking?.payment_status || 'unpaid')}
          </Text>

          {activeBooking?.quoted_amount != null ? (
            <>
              <Text style={[styles.trackingLabel, { marginTop: 14 }]}>Estimate</Text>
              <Text style={styles.trackingValue}>
                {formatNaira(Number(activeBooking.quoted_amount))}
              </Text>
            </>
          ) : null}
        </View>

        {!activeBooking?.driver_id ? (
          <View style={styles.statusNoticeCard}>
            <Ionicons name="time-outline" size={18} color="#b45309" />
            <Text style={styles.statusNoticeText}>
              We are still searching for an available tow driver for this request.
            </Text>
          </View>
        ) : null}

        {activeBooking?.driver_phone ? (
          <View style={styles.driverPhoneCard}>
            <Text style={styles.driverPhoneLabel}>Driver phone</Text>
            <Text style={styles.driverPhoneValue}>{activeBooking.driver_phone}</Text>
          </View>
        ) : null}

        <View style={styles.helperRow}>
          {canCallDriver(activeBooking?.booking_status, activeBooking?.driver_phone) ? (
            <Pressable style={styles.helperButton} onPress={callDriver}>
              <Ionicons name="call-outline" size={16} color="#16a34a" />
              <Text style={styles.helperButtonText}>Call driver</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.helperButton} onPress={() => navigation.navigate('History')}>
            <Ionicons name="time-outline" size={16} color="#2563eb" />
            <Text style={styles.helperButtonText}>View rides</Text>
          </Pressable>
        </View>

        {activeBooking?.booking_status === 'completed' ? (
          <Pressable style={styles.primaryButton} onPress={closeCompletedBooking}>
            <Text style={styles.primaryButtonText}>Back home</Text>
          </Pressable>
        ) : null}
      </BottomSheetScrollView>
    );
  };

  /* =======================================================
     MAIN RETURN
  ======================================================= */

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
          {stage !== 'tracking' &&
            towUnits.map((unit) => (
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

          {resolvedPickupPoint ? (
            <Marker coordinate={resolvedPickupPoint} title="Pickup" pinColor="#16a34a" />
          ) : null}

          {resolvedDropPoint ? (
            <Marker coordinate={resolvedDropPoint} title="Dropoff" pinColor="#2563eb" />
          ) : null}

          {stage === 'tracking' && liveDriverPoint ? (
            <Marker coordinate={liveDriverPoint} title="Tow truck">
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
            <View style={styles.topCardRow}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.topAvatarImage} />
              ) : (
                <View style={styles.topAvatarFallback}>
                  <Text style={styles.topAvatarFallbackText}>{displayInitials}</Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={styles.topEyebrow}>TowSwift</Text>
                <Text style={styles.topTitle}>Hi, {displayName}</Text>
                <Text style={styles.topSubtitle}>
                  {pinTarget
                    ? `Move the map and confirm the exact ${pinTarget} point`
                    : activeBooking
                    ? 'Track your booking, contact the driver, or review your rides.'
                    : 'Swipe the sheet down for more map or up for the full route builder.'}
                </Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#0f172a" />
          </Pressable>
        </View>

        {sheetIndex === 0 && !pinTarget && stage !== 'tracking' ? (
          <Pressable
            style={styles.reopenButton}
            onPress={() => sheetRef.current?.snapToIndex(2)}
          >
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
          index={stage === 'tracking' ? 1 : 0}
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

/* =========================================================
   STYLES
========================================================= */

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
  topCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e2e8f0',
    marginRight: 12,
  },
  topAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
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
    fontSize: 22,
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

  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sheetBackText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  sheetHeaderSpacer: {
    color: 'transparent',
    marginLeft: 8,
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

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
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

  paymentWrap: {
    marginBottom: 16,
  },
  paymentOptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentOptionCardActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  paymentOptionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentOptionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  paymentOptionTitleActive: {
    color: '#166534',
  },
  paymentOptionSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  paymentMetaPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paymentMetaPillText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  paymentWarningCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentWarningText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginLeft: 8,
    flex: 1,
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

  statusNoticeCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusNoticeText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginLeft: 10,
    flex: 1,
  },

  driverPhoneCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
  },
  driverPhoneLabel: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  driverPhoneValue: {
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