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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

export default function HomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [locationSyncStatus, setLocationSyncStatus] = useState<LocationSyncStatus>('idle');
  const [state, setState] = useState<DispatchState>({
    driver: null,
    pending_offers: [],
    active_booking: null,
  });

  const loadState = async () => {
    const { data, error } = await supabase.rpc('get_driver_dispatch_state');

    if (error) throw error;

    const rawDriver = data?.driver && data.driver.profile_id ? (data.driver as DriverInfo) : null;
    const rawPendingOffers = Array.isArray(data?.pending_offers)
      ? (data.pending_offers as PendingOffer[])
      : [];
    const rawActiveBooking =
      data?.active_booking && data.active_booking.booking_id
        ? (data.active_booking as ActiveBooking)
        : null;

    setState({
      driver: rawDriver,
      pending_offers: rawPendingOffers,
      active_booking: rawActiveBooking,
    });
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
    refresh();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadState().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.log('[driver-home-poll]', message);
      });
    }, 8000);

    return () => clearInterval(interval);
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

  const activeAction = useMemo(
    () => (state.active_booking ? nextStatusAction(state.active_booking.booking_status) : null),
    [state.active_booking]
  );

  const syncColors = syncPillStyle(locationSyncStatus);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const driver = state.driver;

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

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatText}>
                {driver?.full_name || driver?.email || 'Driver'}
              </Text>
            </View>

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
          </View>
        </View>

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

            <View style={styles.quickLinksRow}>
              <Pressable style={styles.quickLinkCard} onPress={() => navigation.navigate('Documents')}>
                <Ionicons name="document-text-outline" size={18} color="#1d4ed8" />
                <Text style={styles.quickLinkText}>Documents</Text>
              </Pressable>

              <Pressable
                style={styles.quickLinkCard}
                onPress={() => navigation.navigate('TripMap')}
              >
                <Ionicons
                  name="map-outline"
                  size={18}
                  color={state.active_booking ? '#1d4ed8' : '#0f766e'}
                />
                <Text style={[styles.quickLinkText, { color: state.active_booking ? '#1d4ed8' : '#0f766e' }]}>
                  {state.active_booking ? 'Trip map' : 'Standby map'}
                </Text>
              </Pressable>

              <View style={styles.quickLinkCardMuted}>
                <Ionicons name="wallet-outline" size={18} color="#64748b" />
                <Text style={styles.quickLinkTextMuted}>Earnings next</Text>
              </View>
            </View>

            {state.active_booking ? (
              <View style={styles.activeCard}>
                <Text style={styles.cardEyebrow}>Active booking</Text>
                <Text style={styles.activeTitle}>{state.active_booking.vehicle_type_name || 'Tow job'}</Text>
                <Text style={styles.activeSubtitle}>
                  {titleize(state.active_booking.booking_status)}
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
                    <Text style={styles.metaPillText}>${Number(state.active_booking.quoted_amount || 0).toFixed(2)}</Text>
                  </View>
                </View>

                <Pressable style={styles.secondaryTripButton} onPress={() => navigation.navigate('TripMap')}>
                  <Ionicons name="map-outline" size={16} color="#1d4ed8" />
                  <Text style={styles.secondaryTripButtonText}>Open trip map</Text>
                </Pressable>

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
                    <View>
                      <Text style={styles.offerTitle}>{offer.vehicle_type_name || 'Tow offer'}</Text>
                      <Text style={styles.offerSubtitle}>
                        {(offer.customer_name || 'Customer')} • {offer.created_at ? new Date(offer.created_at).toLocaleString() : 'Now'}
                      </Text>
                    </View>

                    <View style={styles.priceChip}>
                      <Text style={styles.priceChipText}>${Number(offer.quoted_amount || 0).toFixed(2)}</Text>
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

                  <View style={styles.offerFooter}>
                    <Text style={styles.expiryText}>
                      Expires: {offer.expires_at ? new Date(offer.expires_at).toLocaleTimeString() : 'Soon'}
                    </Text>
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
  heroStatsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  heroStatPill: { backgroundColor: 'rgba(125,211,252,0.12)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.2)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 10, marginBottom: 10 },
  heroStatText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  controlsRow: { marginBottom: 14 },
  toggleButton: { borderRadius: 18, paddingVertical: 16, alignItems: 'center', ...shadowCard },
  toggleButtonOnline: { backgroundColor: '#ef4444' },
  toggleButtonOffline: { backgroundColor: '#16a34a' },
  toggleButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  quickLinksRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  quickLinkCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  quickLinkCardMuted: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.82,
    ...shadowCard,
  },
  quickLinkText: { color: '#1d4ed8', fontSize: 12, fontWeight: '800', marginTop: 8 },
  quickLinkTextMuted: { color: '#64748b', fontSize: 12, fontWeight: '800', marginTop: 8 },
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
  routeBlock: { marginBottom: 12 },
  routeLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  routeValue: { color: '#0f172a', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  metaPill: { backgroundColor: '#f8fafc', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, marginRight: 10, marginBottom: 10 },
  metaPillText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  secondaryTripButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  secondaryTripButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
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
  offerTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  offerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  offerSubtitle: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  priceChip: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  priceChipText: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
  offerFooter: { marginBottom: 12 },
  expiryText: { color: '#b45309', fontSize: 12, fontWeight: '800' },
  offerActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  acceptButton: { flex: 1, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  acceptButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  rejectButton: { flex: 1, backgroundColor: '#fee2e2', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  rejectButtonText: { color: '#b91c1c', fontSize: 14, fontWeight: '800' },
});
