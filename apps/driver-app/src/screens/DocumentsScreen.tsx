import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: any;
};

type DriverRow = {
  documents_status: string;
  government_id_url: string | null;
  drivers_license_url: string | null;
  vehicle_license_url: string | null;
  vehicle_photo_url: string | null;
};

type PickedFile = DocumentPicker.DocumentPickerAsset | null;

const BUCKET = 'driver-documents';

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fileNameFromPath(path: string | null) {
  if (!path) return null;
  const parts = path.split('/');
  return parts[parts.length - 1];
}

function inferExtension(name?: string | null, mimeType?: string | null) {
  if (name && name.includes('.')) {
    return name.split('.').pop() || 'bin';
  }

  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType?.includes('jpeg')) return 'jpg';
  if (mimeType?.includes('png')) return 'png';
  return 'bin';
}

async function uploadPickedFile(
  driverId: string,
  docKey: string,
  asset: DocumentPicker.DocumentPickerAsset
) {
  const extension = inferExtension(asset.name, asset.mimeType);
  const path = `${driverId}/${docKey}-${Date.now()}.${extension}`;

  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: asset.mimeType || 'application/octet-stream',
    upsert: true,
  });

  if (error) {
    throw error;
  }

  return path;
}

export default function DocumentsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [driverRow, setDriverRow] = useState<DriverRow | null>(null);

  const [governmentId, setGovernmentId] = useState<PickedFile>(null);
  const [driversLicense, setDriversLicense] = useState<PickedFile>(null);
  const [vehicleLicense, setVehicleLicense] = useState<PickedFile>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<PickedFile>(null);

  const loadDriverDocs = async () => {
    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;

    if (!user) {
      throw new Error('Session expired');
    }

    const { data, error } = await supabase
      .from('drivers')
      .select(
        'documents_status, government_id_url, drivers_license_url, vehicle_license_url, vehicle_photo_url'
      )
      .eq('profile_id', user.id)
      .single();

    if (error) throw error;

    setDriverRow(data as DriverRow);
  };

  useEffect(() => {
    loadDriverDocs()
      .catch((error) => {
        Alert.alert('Load failed', error instanceof Error ? error.message : 'Could not load documents');
      })
      .finally(() => setLoading(false));
  }, []);

  const pickFile = async (
    setter: React.Dispatch<React.SetStateAction<PickedFile>>,
    acceptsImagesOnly = false
  ) => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: acceptsImagesOnly ? ['image/*'] : ['image/*', 'application/pdf'],
    });

    if (result.canceled) return;

    setter(result.assets[0]);
  };

  const canSubmit = useMemo(() => {
    return (
      governmentId !== null ||
      driversLicense !== null ||
      vehicleLicense !== null ||
      vehiclePhoto !== null ||
      !!driverRow?.government_id_url ||
      !!driverRow?.drivers_license_url ||
      !!driverRow?.vehicle_license_url ||
      !!driverRow?.vehicle_photo_url
    );
  }, [governmentId, driversLicense, vehicleLicense, vehiclePhoto, driverRow]);

  const allRequiredPresent = useMemo(() => {
    return Boolean(
      governmentId || driverRow?.government_id_url
    ) && Boolean(
      driversLicense || driverRow?.drivers_license_url
    ) && Boolean(
      vehicleLicense || driverRow?.vehicle_license_url
    ) && Boolean(
      vehiclePhoto || driverRow?.vehicle_photo_url
    );
  }, [governmentId, driversLicense, vehicleLicense, vehiclePhoto, driverRow]);

  const submitDocuments = async () => {
    if (!allRequiredPresent) {
      Alert.alert('Missing documents', 'Please provide all required files before submitting.');
      return;
    }

    setSaving(true);

    try {
      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;

      if (!user) {
        throw new Error('Session expired');
      }

      let governmentIdPath = driverRow?.government_id_url || null;
      let driversLicensePath = driverRow?.drivers_license_url || null;
      let vehicleLicensePath = driverRow?.vehicle_license_url || null;
      let vehiclePhotoPath = driverRow?.vehicle_photo_url || null;

      if (governmentId) {
        governmentIdPath = await uploadPickedFile(user.id, 'government-id', governmentId);
      }

      if (driversLicense) {
        driversLicensePath = await uploadPickedFile(user.id, 'drivers-license', driversLicense);
      }

      if (vehicleLicense) {
        vehicleLicensePath = await uploadPickedFile(user.id, 'vehicle-license', vehicleLicense);
      }

      if (vehiclePhoto) {
        vehiclePhotoPath = await uploadPickedFile(user.id, 'vehicle-photo', vehiclePhoto);
      }

      const { error } = await supabase
        .from('drivers')
        .update({
          government_id_url: governmentIdPath,
          drivers_license_url: driversLicensePath,
          vehicle_license_url: vehicleLicensePath,
          vehicle_photo_url: vehiclePhotoPath,
          documents_status: 'pending',
          is_online: false,
          is_available: false,
        })
        .eq('profile_id', user.id);

      if (error) throw error;

      Alert.alert(
        'Documents submitted',
        'Your documents have been sent to admin for review.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert(
        'Submission failed',
        error instanceof Error ? error.message : 'Could not submit documents'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderDocCard = (
    title: string,
    subtitle: string,
    pickedFile: PickedFile,
    existingPath: string | null,
    onPick: () => void
  ) => (
    <View style={styles.docCard}>
      <View style={styles.docHeader}>
        <View>
          <Text style={styles.docTitle}>{title}</Text>
          <Text style={styles.docSubtitle}>{subtitle}</Text>
        </View>

        <Pressable style={styles.pickButton} onPress={onPick}>
          <Text style={styles.pickButtonText}>{pickedFile || existingPath ? 'Replace' : 'Choose'}</Text>
        </Pressable>
      </View>

      <View style={styles.fileInfoBox}>
        <Ionicons name="document-text-outline" size={18} color="#475569" />
        <Text style={styles.fileInfoText}>
          {pickedFile?.name || fileNameFromPath(existingPath) || 'No file selected yet'}
        </Text>
      </View>
    </View>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </Pressable>
          <Text style={styles.headerTitle}>Driver documents</Text>
          <View style={{ width: 42 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Compliance</Text>
          <Text style={styles.heroTitle}>Submit your required documents</Text>
          <Text style={styles.heroSubtitle}>
            Once submitted, admin reviews them before you can go online and receive jobs.
          </Text>

          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              Current status: {titleize(driverRow?.documents_status || 'not_submitted')}
            </Text>
          </View>
        </View>

        {renderDocCard(
          'Government ID',
          'National ID, passport, or other valid government-issued ID',
          governmentId,
          driverRow?.government_id_url || null,
          () => pickFile(setGovernmentId, false)
        )}

        {renderDocCard(
          "Driver's license",
          'Upload a clear copy of the valid driver’s license',
          driversLicense,
          driverRow?.drivers_license_url || null,
          () => pickFile(setDriversLicense, false)
        )}

        {renderDocCard(
          'Vehicle papers',
          'Upload the tow truck or vehicle registration/license document',
          vehicleLicense,
          driverRow?.vehicle_license_url || null,
          () => pickFile(setVehicleLicense, false)
        )}

        {renderDocCard(
          'Vehicle photo',
          'Upload a clear photo of the tow vehicle',
          vehiclePhoto,
          driverRow?.vehicle_photo_url || null,
          () => pickFile(setVehiclePhoto, true)
        )}

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>What happens next</Text>
          <Text style={styles.noteText}>
            After submission, your document status becomes pending. Admin will review and approve or reject the submission.
          </Text>
        </View>

        <Pressable
          style={[styles.primaryButton, (!canSubmit || saving) && styles.primaryButtonDisabled]}
          disabled={!canSubmit || saving}
          onPress={submitDocuments}
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Submit documents</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06111F' },
  container: { padding: 18, paddingBottom: 36 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
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
    marginBottom: 10,
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
    marginBottom: 16,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusPillText: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '800',
  },
  docCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  docTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  docSubtitle: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 230,
  },
  pickButton: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  pickButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  fileInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fileInfoText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 10,
    flex: 1,
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginTop: 4,
    marginBottom: 16,
    ...shadowCard,
  },
  noteTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  noteText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
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
});
