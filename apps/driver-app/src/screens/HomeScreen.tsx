import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { LocationSyncStatus, startDriverLocationSync } from '../lib/locationSync';

type DriverInfo = {
  profile_id: string;
  verification_status?: string | null;
  documents_status?: string | null;
  is_online?: boolean | null;
  is_available?: boolean | null;
  verified_badge?: boolean | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  rating_average?: number | null;
  rating_count?: number | null;
};

type PendingOffer = {
  offer_id: string;
  booking_id: string;
  vehicle_type_name?: string | null;
  quoted_amount?: number | null;
  pickup_address?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  drop_address?: string | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

type ActiveBooking = {
  booking_id: string;
  booking_status?: string | null;
  pickup_address?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  drop_address?: string | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  quoted_amount?: number | null;
  vehicle_type_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at?: string | null;
};

type DispatchState = {
  driver: DriverInfo | null;
  pending_offers: PendingOffer[];
  active_booking: ActiveBooking | null;
};

type Props = {
  navigation: any;
};

type BannerTone = 'info' | 'success' | 'warning';

type BannerState = {
  tone: BannerTone;
  message: string;
} | null;

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const TRIP_STAGES = [
  { key: 'driver_assigned', label: 'Assigned' },
  { key: 'driver_en_route', label: 'En route' },
  { key: 'driver_arrived', label: 'Arrived' },
  { key: 'in_service', label: 'Towing' },
  { key: 'completed', label: 'Completed' },
];

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function nextStatusAction(status?: string | null) {
  switch (status) {
    case 'driver_assigned':
      return { label: 'Start route', next: 'driver_en_route' };
    case 'driver_en_route':
      return { label: 'Mark arrived', next: 'driver_arrived' };
    case 'driver_arrived':
      return { label: 'Start tow', next: 'in_service' };
    case 'in_service':
      return { label: 'Complete trip', next: 'completed' };
    default:
      return null;
  }
}

function syncLabel(status: LocationSyncStatus) {
  switch (status) {
    case 'starting':
      return 'Sync starting';
    case 'active':
      return 'Live sync active';
    case 'denied':
      return 'Location denied';
    case 'error':
      return 'Sync issue';
    default:
      return 'Sync idle';
  }
}

function syncPillStyle(status: LocationSyncStatus) {
  switch (status) {
    case 'active':
      return { backgroundColor: 'rgba(34,197,94,0.16)', borderColor: 'rgba(34,197,94,0.3)', color: '#dcfce7' };
    case 'starting':
      return { backgroundColor: 'rgba(59,130,246,0.16)', borderColor: 'rgba(59,130,246,0.3)', color: '#dbeafe' };
    case 'denied':
    case 'error':
      return { backgroundColor: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.3)', color: '#fee2e2' };
    default:
      return { backgroundColor: 'rgba(148,163,184,0.16)', borderColor: 'rgba(148,163,184,0.3)', color: '#e2e8f0' };
  }
}

function bannerColors(tone: BannerTone) {
  switch (tone) {
    case 'success':
      return { backgroundColor: '#dcfce7', color: '#166534', icon: 'checkmark-circle' as const };
    case 'warning':
      return { backgroundColor: '#fef3c7', color: '#b45309', icon: 'alert-circle' as const };
    default:
      return { backgroundColor: '#dbeafe', color: '#1d4ed8', icon: 'information-circle' as const };
  }
}

function formatRelativeTime(date: Date | null) {
  if (!date) return 'Never';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatCountdown(expiresAt?: string | null, nowMs: number = Date.now()) {
  if (!expiresAt) return 'Unknown';

  const diff = new Date(expiresAt).getTime() - nowMs;
  if (diff <= 0) return 'Expired';

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function currentTripStageIndex(status?: string | null) {
  const idx = TRIP_STAGES.findIndex((stage) => stage.key === status);
  return idx === -1 ? -1 : idx;
}

function statusHelperText(status?: string | null) {
  switch (status) {
    case 'driver_assigned':
      return 'Proceed to the pickup point and begin navigation.';
    case 'driver_en_route':
      return 'You are on your way to the customer pickup location.';
    case 'driver_arrived':
      return 'Confirm arrival, secure the vehicle, and start the tow.';
    case 'in_service':
      return 'Vehicle is in service. Continue to the dropoff destination.';
    case 'completed':
      return 'Trip completed successfully.';
    default:
      return 'Awaiting trip activity.';
  }
}

function initialsFromName(name?: string | null, fallback = 'D') {
  const safe = (name || '').trim();
  if (!safe) return fallback;

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.round(value);

  return (
    <View style={styles.ratingStarsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={styles.ratingStar}>
          {star <= rounded ? '★' : '☆'}
        </Text>
      ))}
    </View>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [locationSyncStatus, setLocationSyncStatus] = useState<LocationSyncStatus>('idle');
  const [state, setState] = useState<DispatchState>({
    driver: null,
    pending_offers: [],
    active_booking: null,
  });
  const [banner, setBanner] = useState<BannerState>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());

  const initializedRef = useRef(false);
  const previousOfferIdsRef = useRef<string[]>([]);
  const previousBookingStatusRef = useRef<string | null>(null);

  const loadState = async () => {
    const { data, error } = await supabase.rpc('get_driver_dispatch_state');

    if (error) throw error;

    let rawDriver = data?.driver && data.driver.profile_id ? ({ ...data.driver } as DriverInfo) : null;
    const rawPendingOffers = Array.isArray(data?.pending_offers)
      ? (data.pending_offers as PendingOffer[])
      : [];
    const rawActiveBooking =
      data?.active_booking && data.active_booking.booking_id
        ? (data.active_booking as ActiveBooking)
        : null;

    if (rawDriver?.profile_id) {
      const [
        { data: profileMeta, error: profileMetaError },
        { data: driverMeta, error: driverMetaError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', rawDriver.profile_id)
          .maybeSingle(),
        supabase
          .from('drivers')
          .select('rating_average, rating_count')
          .eq('profile_id', rawDriver.profile_id)
          .maybeSingle(),
      ]);

      if (profileMetaError) throw profileMetaError;
      if (driverMetaError) throw driverMetaError;

      rawDriver = {
        ...rawDriver,
        avatar_url: profileMeta?.avatar_url ?? null,
        rating_average: driverMeta?.rating_average ?? 0,
        rating_count: driverMeta?.rating_count ?? 0,
      };
    }

    setState({
      driver: rawDriver,
      pending_offers: rawPendingOffers,
      active_booking: rawActiveBooking,
    });
    setLastUpdatedAt(new Date());
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await loadState();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load driver state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadState().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.log('[driver-home-poll]', message);
        setBanner({
          tone: 'warning',
          message: 'Refresh issue detected. Using latest available driver state.',
        });
      });
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let stopSync: (() => void) | null = null;
    let active = true;

    const canSync =
      Boolean(state.driver?.profile_id) &&
      state.driver?.verification_status === 'approved' &&
      state.driver?.documents_status === 'approved' &&
      Boolean(state.driver?.is_online);

    if (!canSync) {
      setLocationSyncStatus('idle');
      return;
    }

    startDriverLocationSync({
      bookingId: state.active_booking?.booking_id ?? null,
      onStatusChange: (status) => {
        if (active) setLocationSyncStatus(status);
      },
    })
      .then((cleanup) => {
        if (active) {
          stopSync = cleanup;
        } else {
          cleanup();
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.log('[driver-location-sync-start]', message);
        if (active) setLocationSyncStatus('error');
      });

    return () => {
      active = false;
      stopSync?.();
    };
  }, [
    state.driver?.profile_id,
    state.driver?.verification_status,
    state.driver?.documents_status,
    state.driver?.is_online,
    state.active_booking?.booking_id,
  ]);

  useEffect(() => {
    if (locationSyncStatus === 'error') {
      setBanner({
        tone: 'warning',
        message: 'Live location sync hit an issue. The app will keep retrying.',
      });
    }
  }, [locationSyncStatus]);

  useEffect(() => {
    const currentOfferIds = state.pending_offers.map((offer) => offer.offer_id).sort();
    const previousOfferIds = previousOfferIdsRef.current;
    const currentBookingStatus = state.active_booking?.booking_status ?? null;

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousOfferIdsRef.current = currentOfferIds;
      previousBookingStatusRef.current = currentBookingStatus;
      return;
    }

    const newOfferCount = currentOfferIds.filter((id) => !previousOfferIds.includes(id)).length;

    if (newOfferCount > 0) {
      setBanner({
        tone: 'success',
        message: `${newOfferCount} new dispatch offer${newOfferCount > 1 ? 's' : ''} received.`,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    if (
      previousBookingStatusRef.current &&
      currentBookingStatus &&
      previousBookingStatusRef.current !== currentBookingStatus
    ) {
      setBanner({
        tone: 'info',
        message: `Trip status updated: ${titleize(currentBookingStatus)}.`,
      });
      void Haptics.selectionAsync().catch(() => {});
    }

    previousOfferIdsRef.current = currentOfferIds;
    previousBookingStatusRef.current = currentBookingStatus;
  }, [state.pending_offers, state.active_booking?.booking_status]);

  const handleSignOut = async () => {
    try {
      if (Boolean(state.driver?.is_online)) {
        await supabase.rpc('set_driver_online_status', { p_is_online: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[driver-signout-offline]', message);
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign out failed', error.message);
    }
  };

  const toggleOnline = async () => {
    if (!state.driver) return;

    try {
      setBusyKey('toggle-online');

      const { data, error } = await supabase.rpc('set_driver_online_status', {
        p_is_online: !Boolean(state.driver.is_online),
      });

      if (error) throw error;

      if (!data?.success) {
        Alert.alert('Cannot go online', data?.message || 'Driver is not eligible to go online yet.');
      }

      await loadState();

      if (!Boolean(state.driver.is_online)) {
        setBanner({ tone: 'success', message: 'You are now online and ready to receive dispatch offers.' });
      } else {
        setBanner({ tone: 'info', message: 'You are now offline and hidden from dispatch.' });
      }
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Could not update online status');
    } finally {
      setBusyKey(null);
    }
  };

  const acceptOffer = async (offerId: string) => {
    try {
      setBusyKey(`accept-${offerId}`);
      const { data, error } = await supabase.rpc('accept_driver_offer', {
        p_offer_id: offerId,
      });

      if (error) throw error;

      if (!data?.success) {
        Alert.alert('Offer unavailable', data?.message || 'This booking was already claimed.');
      } else {
        setBanner({ tone: 'success', message: 'Dispatch offer accepted successfully.' });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      await loadState();
    } catch (error) {
      Alert.alert('Accept failed', error instanceof Error ? error.message : 'Could not accept offer');
    } finally {
      setBusyKey(null);
    }
  };

  const rejectOffer = async (offerId: string) => {
    try {
      setBusyKey(`reject-${offerId}`);
      const { error } = await supabase.rpc('reject_driver_offer', {
        p_offer_id: offerId,
      });

      if (error) throw error;

      await loadState();
      setBanner({ tone: 'info', message: 'Dispatch offer rejected.' });
    } catch (error) {
      Alert.alert('Reject failed', error instanceof Error ? error.message : 'Could not reject offer');
    } finally {
      setBusyKey(null);
    }
  };

  const updateBookingStatus = async (bookingId: string, nextStatus: string) => {
    try {
      setBusyKey(`status-${bookingId}-${nextStatus}`);
      const { data, error } = await supabase.rpc('update_driver_booking_status', {
        p_booking_id: bookingId,
        p_status: nextStatus,
      });

      if (error) throw error;
      if (!data?.success) {
        Alert.alert('Status update failed', data?.message || 'Could not update booking status.');
      }

      await loadState();
    } catch (error) {
      Alert.alert('Status update failed', error instanceof Error ? error.message : 'Could not update booking status');
    } finally {
      setBusyKey(null);
    }
  };

  const callCustomer = async () => {
    const phone = state.active_booking?.customer_phone;
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

  const activeAction = useMemo(
    () => (state.active_booking ? nextStatusAction(state.active_booking.booking_status) : null),
    [state.active_booking]
  );

  const syncColors = syncPillStyle(locationSyncStatus);
  const activeStageIndex = currentTripStageIndex(state.active_booking?.booking_status);
  const driver = state.driver;
  const activeBannerColors = banner ? bannerColors(banner.tone) : null;
  const driverRatingAverage = Number(driver?.rating_average ?? 0);
  const driverRatingCount = Number(driver?.rating_count ?? 0);
  const driverDisplayName = driver?.full_name || driver?.email || 'Driver';

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
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#ffffff" />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>Tow operator</Text>
              <Text style={styles.heroTitle}>Driver operations</Text>
              <Text style={styles.heroSubtitle}>
                Receive dispatch offers automatically and update job status from here.
              </Text>
            </View>

            <Pressable style={styles.signOutButton} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {driver ? (
            <View style={styles.driverSummaryCard}>
              {driver.avatar_url ? (
                <Image source={{ uri: driver.avatar_url }} style={styles.driverAvatarImage} />
              ) : (
                <View style={styles.driverAvatarFallback}>
                  <Text style={styles.driverAvatarFallbackText}>
                    {initialsFromName(driverDisplayName, 'D')}
                  </Text>
                </View>
              )}

              <View style={styles.driverSummaryTextWrap}>
                <View style={styles.driverSummaryNameRow}>
                  <Text style={styles.driverSummaryName}>{driverDisplayName}</Text>
                  {driver.verified_badge || driver.verification_status === 'approved' ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedBadgeText}>Verified</Text>
                    </View>
                  ) : null}
                </View>

                {driverRatingCount > 0 ? (
                  <>
                    <RatingStars value={driverRatingAverage} />
                    <Text style={styles.driverSummaryMeta}>
                      {driverRatingAverage.toFixed(1)} • {driverRatingCount} rating{driverRatingCount === 1 ? '' : 's'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.driverSummaryMeta}>No ratings yet</Text>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.heroStatsRow}>
            <View
              style={[
                styles.heroStatPill,
                { backgroundColor: Boolean(driver?.is_online) ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.16)' },
              ]}
            >
              <Text style={styles.heroStatText}>
                {Boolean(driver?.is_online) ? 'Online' : 'Offline'}
              </Text>
            </View>

            <View
              style={[
                styles.heroStatPill,
                {
                  backgroundColor: syncColors.backgroundColor,
                  borderColor: syncColors.borderColor,
                },
              ]}
            >
              <Text style={[styles.heroStatText, { color: syncColors.color }]}>
                {syncLabel(locationSyncStatus)}
              </Text>
            </View>

            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatText}>
                {titleize(driver?.verification_status)}
              </Text>
            </View>
          </View>

          <Text style={styles.lastUpdatedText}>
            Last updated: {formatRelativeTime(lastUpdatedAt)}
          </Text>
        </View>

        {banner && activeBannerColors ? (
          <View style={[styles.bannerCard, { backgroundColor: activeBannerColors.backgroundColor }]}>
            <View style={styles.bannerContent}>
              <Ionicons name={activeBannerColors.icon} size={18} color={activeBannerColors.color} />
              <Text style={[styles.bannerText, { color: activeBannerColors.color }]}>
                {banner.message}
              </Text>
            </View>

            <Pressable onPress={() => setBanner(null)}>
              <Ionicons name="close" size={18} color={activeBannerColors.color} />
            </Pressable>
          </View>
        ) : null}

        {!driver ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>No driver profile was found for this account.</Text>
          </View>
        ) : driver.verification_status !== 'approved' || driver.documents_status !== 'approved' ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Approval still pending</Text>
            <Text style={styles.pendingText}>
              Account status: {titleize(driver.verification_status)}{'\n'}
              Document status: {titleize(driver.documents_status)}{'\n\n'}
              Both must be approved before this driver can go online and receive customer jobs.
            </Text>

            <Pressable style={styles.documentsButton} onPress={() => navigation.navigate('Documents')}>
              <Text style={styles.documentsButtonText}>
                {(driver.documents_status ?? 'not_submitted') === 'not_submitted' ? 'Submit documents' : 'View documents'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.controlsRow}>
              <Pressable
                style={[styles.toggleButton, Boolean(driver.is_online) ? styles.toggleButtonOnline : styles.toggleButtonOffline]}
                onPress={toggleOnline}
                disabled={busyKey === 'toggle-online'}
              >
                <Text style={styles.toggleButtonText}>
                  {busyKey === 'toggle-online'
                    ? 'Updating...'
                    : Boolean(driver.is_online)
                    ? 'Go offline'
                    : 'Go online'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.quickLinksGrid}>
              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('Documents')}>
                <Ionicons name="document-text-outline" size={18} color="#1d4ed8" />
                <Text style={styles.quickLinkText}>Documents</Text>
              </Pressable>

              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('TripMap')}>
                <Ionicons
                  name="map-outline"
                  size={18}
                  color={state.active_booking ? '#1d4ed8' : '#0f766e'}
                />
                <Text style={[styles.quickLinkText, { color: state.active_booking ? '#1d4ed8' : '#0f766e' }]}>
                  {state.active_booking ? 'Trip map' : 'Standby map'}
                </Text>
              </Pressable>

              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('History')}>
                <Ionicons name="time-outline" size={18} color="#7c3aed" />
                <Text style={[styles.quickLinkText, { color: '#7c3aed' }]}>History</Text>
              </Pressable>

              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('Earnings')}>
                <Ionicons name="wallet-outline" size={18} color="#166534" />
                <Text style={[styles.quickLinkText, { color: '#166534' }]}>Earnings</Text>
              </Pressable>

              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('Profile')}>
                <Ionicons name="person-circle-outline" size={18} color="#0f172a" />
                <Text style={[styles.quickLinkText, { color: '#0f172a' }]}>Profile</Text>
              </Pressable>

              <Pressable style={styles.quickLinkCardHalf} onPress={() => navigation.navigate('Support')}>
                <Ionicons name="warning-outline" size={18} color="#dc2626" />
                <Text style={[styles.quickLinkText, { color: '#dc2626' }]}>Support</Text>
              </Pressable>
            </View>

            {state.active_booking ? (
              <View style={styles.activeCard}>
                <Text style={styles.cardEyebrow}>Active booking</Text>
                <Text style={styles.activeTitle}>{state.active_booking.vehicle_type_name || 'Tow job'}</Text>
                <Text style={styles.activeSubtitle}>
                  {titleize(state.active_booking.booking_status)}
                </Text>

                <View style={styles.progressWrap}>
                  {TRIP_STAGES.map((stage, index) => {
                    const completed = activeStageIndex >= index;
                    const current = activeStageIndex === index;

                    return (
                      <View key={stage.key} style={styles.progressItem}>
                        <View
                          style={[
                            styles.progressDot,
                            completed && styles.progressDotCompleted,
                            current && styles.progressDotCurrent,
                          ]}
                        />
                        <Text
                          style={[
                            styles.progressLabel,
                            completed && styles.progressLabelCompleted,
                          ]}
                        >
                          {stage.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <Text style={styles.helperText}>
                  {statusHelperText(state.active_booking.booking_status)}
                </Text>

                <View style={styles.routeBlock}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeValue}>{state.active_booking.pickup_address || 'Pickup not available'}</Text>
                </View>

                <View style={styles.routeBlock}>
                  <Text style={styles.routeLabel}>Dropoff</Text>
                  <Text style={styles.routeValue}>{state.active_booking.drop_address || 'Dropoff not available'}</Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>Customer: {state.active_booking.customer_name || 'Customer'}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>{money(state.active_booking.quoted_amount)}</Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Pressable style={styles.secondaryTripButtonHalf} onPress={() => navigation.navigate('TripMap')}>
                    <Ionicons name="map-outline" size={16} color="#1d4ed8" />
                    <Text style={styles.secondaryTripButtonText}>Trip map</Text>
                  </Pressable>

                  <Pressable style={styles.secondaryTripButtonHalf} onPress={callCustomer}>
                    <Ionicons name="call-outline" size={16} color="#1d4ed8" />
                    <Text style={styles.secondaryTripButtonText}>Call</Text>
                  </Pressable>

                  <Pressable style={styles.secondaryTripButtonHalf} onPress={() => navigation.navigate('Support')}>
                    <Ionicons name="warning-outline" size={16} color="#dc2626" />
                    <Text style={[styles.secondaryTripButtonText, { color: '#dc2626' }]}>Issue</Text>
                  </Pressable>
                </View>

                {activeAction ? (
                  <Pressable
                    style={styles.primaryButton}
                    disabled={busyKey === `status-${state.active_booking.booking_id}-${activeAction.next}`}
                    onPress={() => updateBookingStatus(state.active_booking!.booking_id, activeAction.next)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {busyKey === `status-${state.active_booking.booking_id}-${activeAction.next}`
                        ? 'Updating...'
                        : activeAction.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.standbyCard}>
                <Text style={styles.standbyTitle}>Standby mode</Text>
                <Text style={styles.standbyText}>
                  You have no active towing job right now. Open the standby map to see your live position and stay ready for the next dispatch.
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>{syncLabel(locationSyncStatus)}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>Mode: Standby</Text>
                  </View>
                </View>

                <Pressable style={styles.secondaryTripButton} onPress={() => navigation.navigate('TripMap')}>
                  <Ionicons name="map-outline" size={16} color="#1d4ed8" />
                  <Text style={styles.secondaryTripButtonText}>Open standby map</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Incoming offers</Text>
              <Text style={styles.sectionSubtitle}>
                Automatic dispatch offers arrive here while you are online.
              </Text>
            </View>

            {state.pending_offers.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateText}>
                  {Boolean(driver.is_online)
                    ? 'No incoming offers yet.'
                    : 'Go online to start receiving dispatch requests.'}
                </Text>
              </View>
            ) : (
              state.pending_offers.map((offer) => (
                <View key={offer.offer_id} style={styles.offerCard}>
                  <View style={styles.offerTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.offerTitle}>{offer.vehicle_type_name || 'Tow offer'}</Text>
                      <Text style={styles.offerSubtitle}>
                        {(offer.customer_name || 'Customer')} • {offer.created_at ? new Date(offer.created_at).toLocaleString() : 'Now'}
                      </Text>
                    </View>

                    <View style={styles.priceChip}>
                      <Text style={styles.priceChipText}>{money(offer.quoted_amount)}</Text>
                    </View>
                  </View>

                  <View style={styles.offerAlertRow}>
                    <View style={styles.offerCountdownPill}>
                      <Ionicons name="time-outline" size={14} color="#b45309" />
                      <Text style={styles.offerCountdownText}>
                        Expires in {formatCountdown(offer.expires_at, clockNow)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.routeBlock}>
                    <Text style={styles.routeLabel}>Pickup</Text>
                    <Text style={styles.routeValue}>{offer.pickup_address || 'Pickup not available'}</Text>
                  </View>

                  <View style={styles.routeBlock}>
                    <Text style={styles.routeLabel}>Dropoff</Text>
                    <Text style={styles.routeValue}>{offer.drop_address || 'Dropoff not available'}</Text>
                  </View>

                  <View style={styles.offerActions}>
                    <Pressable
                      style={styles.acceptButton}
                      disabled={busyKey === `accept-${offer.offer_id}`}
                      onPress={() => acceptOffer(offer.offer_id)}
                    >
                      <Text style={styles.acceptButtonText}>
                        {busyKey === `accept-${offer.offer_id}` ? 'Accepting...' : 'Accept'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.rejectButton}
                      disabled={busyKey === `reject-${offer.offer_id}`}
                      onPress={() => rejectOffer(offer.offer_id)}
                    >
                      <Text style={styles.rejectButtonText}>
                        {busyKey === `reject-${offer.offer_id}` ? 'Rejecting...' : 'Reject'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { padding: 18, paddingBottom: 30 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#0B1220', borderRadius: 28, padding: 22, marginBottom: 18, ...shadowCard },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  heroEyebrow: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  heroTitle: { color: '#ffffff', fontSize: 30, fontWeight: '800', marginBottom: 8 },
  heroSubtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 21, maxWidth: 270 },
  signOutButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  driverSummaryCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  driverAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#1e293b',
    marginRight: 14,
  },
  driverAvatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  driverAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  driverSummaryTextWrap: {
    flex: 1,
  },
  driverSummaryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  driverSummaryName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 8,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedBadgeText: {
    color: '#dcfce7',
    fontSize: 11,
    fontWeight: '800',
  },
  driverSummaryMeta: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  ratingStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    color: '#f59e0b',
    fontSize: 16,
    marginRight: 2,
  },

  heroStatsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  heroStatPill: {
    backgroundColor: 'rgba(125,211,252,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.2)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
  },
  heroStatText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  lastUpdatedText: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginTop: 4 },

  bannerCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadowCard,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },

  controlsRow: { marginBottom: 14 },
  toggleButton: { borderRadius: 18, paddingVertical: 16, alignItems: 'center', ...shadowCard },
  toggleButtonOnline: { backgroundColor: '#ef4444' },
  toggleButtonOffline: { backgroundColor: '#16a34a' },
  toggleButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

  quickLinksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quickLinkCardHalf: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...shadowCard,
  },
  quickLinkText: { color: '#1d4ed8', fontSize: 12, fontWeight: '800', marginTop: 8 },

  pendingCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, marginBottom: 16, ...shadowCard },
  pendingTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  pendingText: { color: '#475569', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  documentsButton: {
    backgroundColor: '#2563eb',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  documentsButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

  activeCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 18, marginBottom: 18, ...shadowCard },
  standbyCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 18, marginBottom: 18, ...shadowCard },
  standbyTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  standbyText: { color: '#475569', fontSize: 14, lineHeight: 22, marginBottom: 14 },
  cardEyebrow: { color: '#16a34a', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  activeTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  activeSubtitle: { color: '#1d4ed8', fontSize: 14, fontWeight: '800', marginBottom: 14 },

  progressWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  progressDotCompleted: {
    backgroundColor: '#16a34a',
  },
  progressDotCurrent: {
    transform: [{ scale: 1.25 }],
    backgroundColor: '#2563eb',
  },
  progressLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressLabelCompleted: {
    color: '#0f172a',
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },

  routeBlock: { marginBottom: 12 },
  routeLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  routeValue: { color: '#0f172a', fontSize: 15, fontWeight: '700', lineHeight: 21 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  metaPill: { backgroundColor: '#f8fafc', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, marginRight: 10, marginBottom: 10 },
  metaPillText: { color: '#334155', fontSize: 12, fontWeight: '800' },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  secondaryTripButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  secondaryTripButtonHalf: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryTripButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 8,
  },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sectionSubtitle: { color: '#94a3b8', fontSize: 13 },

  stateCard: { backgroundColor: '#ffffff', borderRadius: 22, padding: 20, alignItems: 'center', marginBottom: 16, ...shadowCard },
  stateText: { color: '#334155', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  offerCard: { backgroundColor: '#ffffff', borderRadius: 24, padding: 18, marginBottom: 14, ...shadowCard },
  offerTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  offerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  offerSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  priceChip: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  priceChipText: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
  offerAlertRow: { marginBottom: 12 },
  offerCountdownPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  offerCountdownText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  offerActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  acceptButton: { flex: 1, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  acceptButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  rejectButton: { flex: 1, backgroundColor: '#fee2e2', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  rejectButtonText: { color: '#b91c1c', fontSize: 14, fontWeight: '800' },
});