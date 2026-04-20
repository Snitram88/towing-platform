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

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
};

type WalletPreview = {
  balance: number;
  currency: string;
  ready: boolean;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function initialsFromName(name?: string | null, fallback = 'C') {
  const safe = (name || '').trim();
  if (!safe) return fallback;

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatNaira(value: number) {
  return `₦${Number(value || 0).toFixed(2)}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
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

  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [walletPreview, setWalletPreview] = useState<WalletPreview>({
    balance: 0,
    currency: 'NGN',
    ready: false,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const hydrateForm = useCallback((row: ProfileRow | null) => {
    setProfile(row);
    setFullName(row?.full_name || '');
    setPhone(row?.phone || '');
  }, []);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;
    if (!user) throw new Error('No signed-in user found.');

    setUserId(user.id);

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const mergedProfile: ProfileRow = {
      id: user.id,
      full_name: profileRow?.full_name ?? user.user_metadata?.full_name ?? null,
      phone: profileRow?.phone ?? null,
      email: profileRow?.email ?? user.email ?? null,
      avatar_url: profileRow?.avatar_url ?? null,
    };

    hydrateForm(mergedProfile);

    const walletRes = await supabase
      .from('customer_wallets')
      .select('balance, currency')
      .eq('customer_id', user.id)
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
  }, [loadProfile]);

  const displayName = useMemo(() => {
    return profile?.full_name || profile?.email || 'Customer';
  }, [profile]);

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

      setProfile((current) =>
        current
          ? { ...current, avatar_url: publicData.publicUrl }
          : null
      );

      Alert.alert('Profile photo updated', 'Your profile photo was uploaded successfully.');
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

      setProfile((current) => (current ? { ...current, avatar_url: null } : current));
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
    try {
      setSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
        })
        .eq('id', userId);

      if (error) throw error;

      const nextProfile: ProfileRow = {
        id: userId,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        email: profile?.email ?? null,
        avatar_url: profile?.avatar_url ?? null,
      };

      hydrateForm(nextProfile);
      setIsEditing(false);
      Alert.alert('Saved', 'Customer profile updated successfully.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#ffffff" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Profile</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {initialsFromName(displayName, 'C')}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.heroEyebrow}>Customer account</Text>
          <Text style={styles.heroTitle}>{profile?.full_name || 'Your profile'}</Text>
          <Text style={styles.heroSubtitle}>{profile?.email || 'No email found'}</Text>

          <View style={styles.heroActionRow}>
            <Pressable
              style={[styles.primaryButtonSmall, uploading && styles.buttonDisabled]}
              onPress={pickAvatar}
              disabled={uploading}
            >
              <Text style={styles.primaryButtonSmallText}>
                {uploading ? 'Uploading...' : 'Choose photo'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButtonSmall, uploading && styles.buttonDisabled]}
              onPress={removeAvatar}
              disabled={uploading}
            >
              <Text style={styles.secondaryButtonSmallText}>Remove</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.walletEyebrow}>Wallet</Text>
          <Text style={styles.walletBalance}>{formatNaira(walletPreview.balance)}</Text>
          <Text style={styles.walletMeta}>
            {walletPreview.ready
              ? `Wallet connected • ${walletPreview.currency}`
              : 'Wallet foundation ready • backend top-up flow comes next'}
          </Text>

          <Pressable style={styles.walletButton} onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.walletButtonText}>Open wallet</Text>
          </Pressable>
        </View>

        {!isEditing ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Personal details</Text>
              <Pressable style={styles.editButton} onPress={() => setIsEditing(true)}>
                <Text style={styles.editButtonText}>Edit profile</Text>
              </Pressable>
            </View>

            <InfoRow label="Full name" value={profile?.full_name || 'Not set'} />
            <InfoRow label="Phone" value={profile?.phone || 'Not set'} />
            <InfoRow label="Email" value={profile?.email || 'No email'} />
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Edit profile</Text>
            </View>

            <Text style={styles.label}>Full name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Customer full name"
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
              <Text style={styles.readonlyText}>{profile?.email || 'No email'}</Text>
            </View>

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

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Next customer features</Text>
          <Text style={styles.noteText}>
            Next we will wire wallet top-up, saved cards, payment method selection, and customer rating of drivers after completed trips.
          </Text>
        </View>
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
  heroActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryButtonSmall: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonSmallText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButtonSmall: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryButtonSmallText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  walletCard: {
    backgroundColor: '#16a34a',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    ...shadowCard,
  },
  walletEyebrow: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  walletBalance: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
  },
  walletMeta: {
    color: '#dcfce7',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  walletButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  walletButtonText: {
    color: '#166534',
    fontSize: 14,
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
});
