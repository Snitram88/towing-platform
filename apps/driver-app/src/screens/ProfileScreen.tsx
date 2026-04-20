import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

type DriverProfile = {
  profile_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  verification_status?: string | null;
  documents_status?: string | null;
  is_online?: boolean | null;
  is_available?: boolean | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  tow_capacity_tons?: number | null;
  verified_badge?: boolean | null;
  rating_average?: number | null;
  rating_count?: number | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusChip(bg: string, color: string) {
  return {
    backgroundColor: bg,
    color,
  };
}

function initialsFromName(name?: string | null, fallback = 'D') {
  const safe = (name || '').trim();
  if (!safe) return fallback;

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatReviewDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.round(value);

  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={styles.star}>
          {star <= rounded ? '★' : '☆'}
        </Text>
      ))}
    </View>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [profile, setProfile] = useState<DriverProfile>({});
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [userId, setUserId] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [towCapacity, setTowCapacity] = useState('');

  const hydrateForm = useCallback((data: DriverProfile) => {
    setProfile(data);
    setFullName(data.full_name || '');
    setPhone(data.phone || '');
    setVehicleMake(data.vehicle_make || '');
    setVehicleModel(data.vehicle_model || '');
    setVehicleYear(data.vehicle_year ? String(data.vehicle_year) : '');
    setPlateNumber(data.plate_number || '');
    setVehicleColor(data.vehicle_color || '');
    setTowCapacity(
      typeof data.tow_capacity_tons === 'number' ? String(data.tow_capacity_tons) : ''
    );
  }, []);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;
    if (!user) throw new Error('No signed-in user found.');

    setUserId(user.id);

    const [
      { data: bundle, error: bundleError },
      { data: profileRow, error: profileError },
      { data: driverRow, error: driverError },
      { data: reviewsData, error: reviewsError },
    ] = await Promise.all([
      supabase.rpc('get_driver_profile_bundle'),
      supabase
        .from('profiles')
        .select('id, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('drivers')
        .select('rating_average, rating_count')
        .eq('profile_id', user.id)
        .maybeSingle(),
      supabase
        .from('driver_reviews')
        .select('id, rating, review_text, created_at')
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (bundleError) throw bundleError;
    if (profileError) throw profileError;
    if (driverError) throw driverError;
    if (reviewsError) throw reviewsError;

    const merged: DriverProfile = {
      ...((bundle || {}) as DriverProfile),
      profile_id: user.id,
      email: user.email ?? ((bundle as DriverProfile | null)?.email ?? null),
      avatar_url: profileRow?.avatar_url ?? null,
      rating_average: driverRow?.rating_average ?? 0,
      rating_count: driverRow?.rating_count ?? 0,
    };

    hydrateForm(merged);
    setReviews((reviewsData as ReviewRow[]) ?? []);
  }, [hydrateForm]);

  const refresh = async () => {
    setLoading(true);
    try {
      await loadProfile();
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const cancelEdit = () => {
    hydrateForm(profile);
    setIsEditing(false);
  };

  const pickAvatar = async () => {
    try {
      if (!userId) {
        Alert.alert('Upload failed', 'User session not ready.');
        return;
      }

      setUploading(true);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow photo library access to upload your profile photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const contentType = asset.mimeType ?? 'image/jpeg';
      const extension =
        contentType.includes('png')
          ? 'png'
          : contentType.includes('webp')
          ? 'webp'
          : 'jpg';

      const filePath = `${userId}/avatar.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicData.publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setProfile((current) => ({
        ...current,
        avatar_url: publicData.publicUrl,
      }));

      Alert.alert('Profile photo updated', 'Your driver avatar was uploaded successfully.');
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error ? error.message : 'Could not upload profile photo.'
      );
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!userId) return;

    try {
      setUploading(true);

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (error) throw error;

      setProfile((current) => ({
        ...current,
        avatar_url: null,
      }));

      Alert.alert('Profile photo removed', 'Your avatar has been cleared.');
    } catch (error) {
      Alert.alert(
        'Remove failed',
        error instanceof Error ? error.message : 'Could not remove profile photo.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const yearValue = vehicleYear.trim() ? Number(vehicleYear) : null;
    const capacityValue = towCapacity.trim() ? Number(towCapacity) : null;

    if (vehicleYear.trim() && Number.isNaN(yearValue)) {
      Alert.alert('Invalid year', 'Vehicle year must be a valid number.');
      return;
    }

    if (towCapacity.trim() && Number.isNaN(capacityValue)) {
      Alert.alert('Invalid capacity', 'Tow capacity must be a valid number.');
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase.rpc('update_driver_profile_bundle', {
        p_full_name: fullName,
        p_phone: phone,
        p_vehicle_make: vehicleMake,
        p_vehicle_model: vehicleModel,
        p_vehicle_year: yearValue,
        p_plate_number: plateNumber,
        p_vehicle_color: vehicleColor,
        p_tow_capacity_tons: capacityValue,
      });

      if (error) throw error;

      if (!data?.success) {
        Alert.alert('Save failed', data?.message || 'Could not save profile');
        return;
      }

      await loadProfile();
      setIsEditing(false);
      Alert.alert('Saved', 'Driver profile and vehicle details updated successfully.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const ratingAverage = useMemo(
    () => Number(profile.rating_average ?? 0),
    [profile.rating_average]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const verificationChip =
    profile.verification_status === 'approved'
      ? statusChip('#dcfce7', '#166534')
      : statusChip('#fef3c7', '#b45309');

  const docsChip =
    profile.documents_status === 'approved'
      ? statusChip('#dcfce7', '#166534')
      : statusChip('#ede9fe', '#6d28d9');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#ffffff" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Profile & vehicle</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {initialsFromName(profile.full_name, 'D')}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.heroEyebrow}>Driver account</Text>
          <Text style={styles.heroTitle}>{profile.full_name || 'Manage profile and tow vehicle'}</Text>
          <Text style={styles.heroSubtitle}>
            Keep your profile, contact details, and vehicle information accurate for operations and compliance.
          </Text>

          <View style={styles.avatarButtonsRow}>
            <Pressable
              style={[styles.avatarPrimaryButton, uploading && styles.buttonDisabled]}
              disabled={uploading}
              onPress={pickAvatar}
            >
              <Text style={styles.avatarPrimaryButtonText}>
                {uploading ? 'Uploading...' : 'Choose photo'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.avatarSecondaryButton, uploading && styles.buttonDisabled]}
              disabled={uploading}
              onPress={removeAvatar}
            >
              <Text style={styles.avatarSecondaryButtonText}>Remove</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: verificationChip.backgroundColor }]}>
            <Text style={[styles.statusBadgeText, { color: verificationChip.color }]}>
              Account: {titleize(profile.verification_status)}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: docsChip.backgroundColor }]}>
            <Text style={[styles.statusBadgeText, { color: docsChip.color }]}>
              Docs: {titleize(profile.documents_status)}
            </Text>
          </View>

          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>{profile.is_online ? 'Online' : 'Offline'}</Text>
          </View>

          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>{profile.is_available ? 'Available' : 'Busy'}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Driver rating</Text>

          <View style={styles.ratingHero}>
            <Text style={styles.ratingNumber}>{ratingAverage.toFixed(1)}</Text>
            <View>
              <RatingStars value={ratingAverage} />
              <Text style={styles.ratingCaption}>
                {profile.rating_count ?? 0} rating{(profile.rating_count ?? 0) === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          <Text style={styles.noteText}>
            Customers will be able to rate the driver after completed trips.
          </Text>
        </View>

        {!isEditing ? (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Personal details</Text>
                <Pressable style={styles.editButton} onPress={() => setIsEditing(true)}>
                  <Text style={styles.editButtonText}>Edit profile</Text>
                </Pressable>
              </View>

              <InfoRow label="Full name" value={profile.full_name || 'Not set'} />
              <InfoRow label="Phone" value={profile.phone || 'Not set'} />
              <InfoRow label="Email" value={profile.email || 'No email'} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Vehicle details</Text>

              <InfoRow label="Vehicle make" value={profile.vehicle_make || 'Not set'} />
              <InfoRow label="Vehicle model" value={profile.vehicle_model || 'Not set'} />
              <InfoRow
                label="Vehicle year"
                value={profile.vehicle_year ? String(profile.vehicle_year) : 'Not set'}
              />
              <InfoRow label="Plate number" value={profile.plate_number || 'Not set'} />
              <InfoRow label="Vehicle color" value={profile.vehicle_color || 'Not set'} />
              <InfoRow
                label="Tow capacity"
                value={
                  typeof profile.tow_capacity_tons === 'number'
                    ? `${profile.tow_capacity_tons} tons`
                    : 'Not set'
                }
              />
            </View>
          </>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Edit profile</Text>
            </View>

            <Text style={styles.label}>Full name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Driver full name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Email</Text>
            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>{profile.email || 'No email'}</Text>
            </View>

            <Text style={styles.sectionSubtitle}>Vehicle details</Text>

            <Text style={styles.label}>Vehicle make</Text>
            <TextInput
              value={vehicleMake}
              onChangeText={setVehicleMake}
              placeholder="e.g. Isuzu"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />

            <Text style={styles.label}>Vehicle model</Text>
            <TextInput
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g. NPR Tow Truck"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />

            <Text style={styles.label}>Vehicle year</Text>
            <TextInput
              value={vehicleYear}
              onChangeText={setVehicleYear}
              placeholder="e.g. 2022"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Plate number</Text>
            <TextInput
              value={plateNumber}
              onChangeText={setPlateNumber}
              placeholder="Plate number"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />

            <Text style={styles.label}>Vehicle color</Text>
            <TextInput
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder="e.g. White"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />

            <Text style={styles.label}>Tow capacity (tons)</Text>
            <TextInput
              value={towCapacity}
              onChangeText={setTowCapacity}
              placeholder="e.g. 5"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              style={styles.input}
            />

            <View style={styles.editActionsRow}>
              <Pressable
                style={[styles.cancelButton, saving && { opacity: 0.7 }]}
                disabled={saving}
                onPress={cancelEdit}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.saveButtonHalf, saving && { opacity: 0.7 }]}
                disabled={saving}
                onPress={handleSave}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent reviews</Text>

          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>No ratings or written reviews yet.</Text>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <RatingStars value={review.rating} />
                  <Text style={styles.reviewDate}>{formatReviewDate(review.created_at)}</Text>
                </View>
                <Text style={styles.reviewText}>
                  {review.review_text?.trim() || 'No written comment for this rating.'}
                </Text>
              </View>
            ))
          )}
        </View>

        {!isEditing ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Operational note</Text>
            <Text style={styles.noteText}>
              Later we will expand this page with payout account setup, compliance notes, vehicle photos, and richer account settings.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { padding: 18, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  backArrow: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginTop: -1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: '#0B1220',
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    ...shadowCard,
  },
  avatarWrap: {
    marginBottom: 14,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#1e293b',
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  heroEyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  avatarButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  avatarPrimaryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  avatarPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  avatarSecondaryButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  avatarSecondaryButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 10,
    marginBottom: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  liveBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 10,
    marginBottom: 10,
  },
  liveBadgeText: {
    color: '#075985',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadowCard,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 14,
  },
  sectionSubtitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 10,
  },
  editButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingHero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratingNumber: {
    color: '#0f172a',
    fontSize: 42,
    fontWeight: '900',
    marginRight: 14,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    color: '#f59e0b',
    fontSize: 18,
    marginRight: 2,
  },
  ratingCaption: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  label: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  readonlyBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  readonlyText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  saveButtonHalf: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadowCard,
  },
  noteTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  noteText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  reviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewDate: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
  reviewText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
});