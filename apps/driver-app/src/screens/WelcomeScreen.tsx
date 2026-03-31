import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DriverAuthStackParamList } from '../types/app';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'Welcome'>;

const highlights = [
  {
    icon: 'flash-outline',
    title: 'Fast request flow',
    text: 'Get nearby towing jobs with a clean, action-first driver experience.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Verified operations',
    text: 'Drivers are approved before receiving live towing requests.',
  },
  {
    icon: 'cash-outline',
    title: 'Transparent earnings',
    text: 'Track jobs, wallet balance, and payout flow in one premium workspace.',
  },
] as const;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#071A11', '#0B3B2E', '#111827']} style={styles.hero}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Ionicons name="car-sport" size={18} color="#ffffff" />
            </View>
            <Text style={styles.brandText}>TowSwift Driver</Text>
          </View>

          <Text style={styles.heroEyebrow}>Premium driver operations</Text>
          <Text style={styles.heroTitle}>A driver app that feels elite.</Text>
          <Text style={styles.heroSubtitle}>
            Beautiful onboarding, verified activation, and a reliable workflow for towing professionals.
          </Text>

          <View style={styles.heroCard}>
            <View style={styles.heroCardRow}>
              <View>
                <Text style={styles.heroCardLabel}>Driver mode</Text>
                <Text style={styles.heroCardValue}>Approval-first</Text>
              </View>
              <View style={styles.heroCardPill}>
                <Text style={styles.heroCardPillText}>Operations ready</Text>
              </View>
            </View>

            <View style={styles.fakeMap}>
              <View style={[styles.pin, { top: 22, left: 28, backgroundColor: '#22c55e' }]}>
                <Ionicons name="navigate" size={14} color="#ffffff" />
              </View>
              <View style={styles.routeLine} />
              <View style={[styles.pin, { bottom: 22, right: 28, backgroundColor: '#2563eb' }]}>
                <Ionicons name="car-sport" size={14} color="#ffffff" />
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.highlightsList}>
          {highlights.map((item) => (
            <View key={item.title} style={styles.highlightCard}>
              <View style={styles.highlightIcon}>
                <Ionicons name={item.icon} size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightTitle}>{item.title}</Text>
                <Text style={styles.highlightText}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.primaryButtonText}>Create driver account</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.secondaryButtonText}>I already have a driver account</Text>
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
    borderRadius: 30,
    padding: 22,
    marginBottom: 18,
    ...shadowCard,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
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
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    marginBottom: 10,
    maxWidth: 280,
  },
  heroSubtitle: {
    color: '#d1fae5',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 20,
    maxWidth: 310,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  heroCardLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroCardValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  heroCardPill: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroCardPillText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '800',
  },
  fakeMap: {
    height: 150,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
  },
  routeLine: {
    position: 'absolute',
    top: 56,
    left: 56,
    width: 150,
    height: 3,
    backgroundColor: '#34d399',
    transform: [{ rotate: '34deg' }],
    borderRadius: 999,
  },
  pin: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightsList: {
    marginBottom: 18,
  },
  highlightCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    ...shadowCard,
  },
  highlightIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  highlightTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  highlightText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
    ...shadowCard,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
    ...shadowCard,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});
