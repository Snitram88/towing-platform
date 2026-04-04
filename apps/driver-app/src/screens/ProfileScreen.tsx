import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type DriverProfile = {
  profile_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
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

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<DriverProfile>({});

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [towCapacity, setTowCapacity] = useState('');

  const hydrateForm = (data: DriverProfile) => {
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
  };

  const loadProfile = async () => {
    const { data, error } = await supabase.rpc('get_driver_profile_bundle');

    if (error) throw error;

    hydrateForm((data || {}) as DriverProfile);
  };

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
    refresh();
  }, []);

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

      hydrateForm((data.profile || {}) as DriverProfile);
      Alert.alert('Saved', 'Driver profile and vehicle details updated successfully.');
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

  const verificationChip = profile.verification_status === 'approved'
    ? statusChip('#dcfce7', '#166534')
    : statusChip('#fef3c7', '#b45309');

  const docsChip = profile.documents_status === 'approved'
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
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>

          <Text style={styles.headerTitle}>Profile & vehicle</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Driver account</Text>
          <Text style={styles.heroTitle}>Manage profile and tow vehicle</Text>
          <Text style={styles.heroSubtitle}>
            Keep your profile, contact details, and vehicle information accurate for operations and compliance.
          </Text>
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
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Personal details</Text>

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
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Vehicle details</Text>

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
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Operational note</Text>
          <Text style={styles.noteText}>
            Later we will expand this page with payout account setup, compliance notes, vehicle photos, and richer account settings.
          </Text>
        </View>

        <Pressable
          style={[styles.saveButton, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={handleSave}
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Save profile</Text>}
        </Pressable>
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
    ...shadowCard,
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
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
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
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...shadowCard,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 14,
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
  saveButton: {
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
});
