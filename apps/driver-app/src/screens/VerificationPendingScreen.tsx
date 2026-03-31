import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { DriverState } from '../types/app';

type Props = {
  driver: DriverState;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

const steps = [
  'Driver account created',
  'Admin review in progress',
  'Document upload flow arrives next',
  'Approval unlocks live jobs',
];

export default function VerificationPendingScreen({ driver, onRefresh, onSignOut }: Props) {
  const isRejected = driver.verification_status === 'rejected';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={isRejected ? ['#3f0a0a', '#7f1d1d', '#111827'] : ['#071A11', '#0B3B2E', '#111827']}
          style={styles.hero}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>Driver verification</Text>
              <Text style={styles.heroTitle}>
                {isRejected ? 'Verification needs attention.' : 'Verification in progress.'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {isRejected
                  ? 'Your driver account needs review updates before activation. Document management comes next in the build.'
                  : 'Your account is created and waiting for admin approval before live towing requests can be assigned.'}
              </Text>
            </View>

            <View style={[styles.statusBadge, isRejected ? styles.statusBadgeRejected : styles.statusBadgePending]}>
              <Text style={[styles.statusBadgeText, isRejected ? styles.statusBadgeRejectedText : styles.statusBadgePendingText]}>
                {driver.verification_status.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{driver.full_name || 'Driver account'}</Text>
            <Text style={styles.profileMeta}>{driver.email || 'No email found'}</Text>
            <Text style={styles.profileMeta}>{driver.phone || 'No phone found'}</Text>
          </View>
        </LinearGradient>

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Approval timeline</Text>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What happens next</Text>
          <Text style={styles.infoText}>
            In the next build stage, we’ll add driver document upload, vehicle details, admin approval tools,
            and full request management.
          </Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={async () => {
            await onRefresh();
            Alert.alert('Status refreshed', 'Your verification status has been refreshed from Supabase.');
          }}
        >
          <Text style={styles.primaryButtonText}>Refresh status</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={onSignOut}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06111F',
  },
  container: {
    padding: 18,
    paddingBottom: 30,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
    ...shadowCard,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  heroEyebrow: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    marginBottom: 8,
    maxWidth: 260,
  },
  heroSubtitle: {
    color: '#d1fae5',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 270,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgePending: {
    backgroundColor: 'rgba(245,158,11,0.16)',
  },
  statusBadgeRejected: {
    backgroundColor: 'rgba(239,68,68,0.16)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgePendingText: {
    color: '#fde68a',
  },
  statusBadgeRejectedText: {
    color: '#fecaca',
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  profileName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  profileMeta: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 21,
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepIndexText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#0B1220',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    ...shadowCard,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadowCard,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});
