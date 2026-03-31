import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type CustomerAuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

type Props = NativeStackScreenProps<CustomerAuthStackParamList, 'Welcome'>;

const highlights = [
  {
    icon: 'flash-outline',
    title: 'Fast dispatch',
    text: 'Request a tow in seconds with a clean, map-first flow.',
  },
  {
    icon: 'navigate-outline',
    title: 'Live tracking',
    text: 'Watch your driver move toward you with ETA updates.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Trusted operators',
    text: 'Only approved tow drivers will appear in the live network.',
  },
] as const;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#0B1220', '#0A2540', '#111827']} style={styles.hero}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Ionicons name="car-sport" size={18} color="#ffffff" />
            </View>
            <Text style={styles.brandText}>TowSwift</Text>
          </View>

          <Text style={styles.heroEyebrow}>Premium roadside assistance</Text>
          <Text style={styles.heroTitle}>A towing app that feels world-class.</Text>
          <Text style={styles.heroSubtitle}>
            Beautiful, fast, and reliable towing requests with the kind of smooth experience users expect from top ride-hailing products.
          </Text>

          <View style={styles.heroCard}>
            <View style={styles.heroCardRow}>
              <View>
                <Text style={styles.heroCardLabel}>Average pickup ETA</Text>
                <Text style={styles.heroCardValue}>5-12 min</Text>
              </View>
              <View style={styles.heroCardPill}>
                <Text style={styles.heroCardPillText}>Live dispatch ready</Text>
              </View>
            </View>

            <View style={styles.fakeMap}>
              <View style={[styles.pin, { top: 22, left: 30, backgroundColor: '#22c55e' }]}>
                <Ionicons name="locate" size={14} color="#ffffff" />
              </View>
              <View style={styles.routeLine} />
              <View style={[styles.pin, { bottom: 22, right: 30, backgroundColor: '#2563eb' }]}>
                <Ionicons name="car-sport" size={14} color="#ffffff" />
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.highlightsList}>
          {highlights.map((item) => (
            <View key={item.title} style={styles.highlightCard}>
              <View style={styles.highlightIcon}>
                <Ionicons name={item.icon} size={18} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightTitle}>{item.title}</Text>
                <Text style={styles.highlightText}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.primaryButtonText}>Create customer account</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.secondaryButtonText}>I already have an account</Text>
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
    color: '#7dd3fc',
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
    color: '#dbeafe',
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
    color: '#cbd5e1',
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
    backgroundColor: '#38bdf8',
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
    backgroundColor: '#eff6ff',
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
    backgroundColor: '#2563eb',
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
