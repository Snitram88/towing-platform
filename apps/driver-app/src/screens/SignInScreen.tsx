import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import type { DriverAuthStackParamList } from '../types/app';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 4 && password.length >= 6, [email, password]);

  const handleSignIn = async () => {
    if (!canSubmit) return;

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }

    Alert.alert('Welcome back', 'Your driver session is active now.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#071A11', '#0B3B2E', '#111827']} style={styles.hero}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={18} color="#ffffff" />
            </Pressable>

            <Text style={styles.heroEyebrow}>Driver sign in</Text>
            <Text style={styles.heroTitle}>Back to the wheel.</Text>
            <Text style={styles.heroSubtitle}>
              Sign in to manage your verification status, availability, and upcoming towing operations.
            </Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Access driver workspace</Text>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="driver@example.com"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={secure}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  style={styles.passwordInput}
                />
                <Pressable onPress={() => setSecure((prev) => !prev)} style={styles.eyeButton}>
                  <Ionicons name={secure ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748b" />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={handleSignIn}
              style={[styles.primaryButton, !canSubmit || loading ? styles.primaryButtonDisabled : null]}
              disabled={!canSubmit || loading}
            >
              {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
            </Pressable>

            <Pressable onPress={() => navigation.navigate('SignUp')} style={styles.footerAction}>
              <Text style={styles.footerActionText}>
                New driver? <Text style={styles.footerActionStrong}>Create an account</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: '#d1fae5',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 300,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    ...shadowCard,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 18,
  },
  inputBlock: {
    marginBottom: 16,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingLeft: 16,
  },
  passwordInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },
  eyeButton: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  footerAction: {
    alignItems: 'center',
    marginTop: 16,
  },
  footerActionText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  footerActionStrong: {
    color: '#0f172a',
    fontWeight: '800',
  },
});
