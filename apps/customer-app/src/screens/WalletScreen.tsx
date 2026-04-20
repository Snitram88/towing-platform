import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

type WalletTransactionRow = {
  id: string;
  amount: number | null;
  transaction_type: string | null;
  status: string | null;
  description: string | null;
  created_at: string | null;
};

const shadowCard = {
  shadowColor: '#020617',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000];

function formatNaira(value: number) {
  return `₦${Number(value || 0).toFixed(2)}`;
}

function titleize(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return 'Unknown date';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function parsePositiveAmount(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '');
  const amount = Number(sanitized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number(amount.toFixed(2));
}

export default function WalletScreen({ navigation }: { navigation: any }) {
  const [loading, setLoading] = useState(true);
  const [startingTopup, setStartingTopup] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('NGN');
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [amountInput, setAmountInput] = useState('5000');
  const [lastReference, setLastReference] = useState<string | null>(null);

  const resolvedAmount = useMemo(() => parsePositiveAmount(amountInput), [amountInput]);

  const loadWallet = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;
    if (!user) throw new Error('No signed-in user found.');

    const walletRes = await supabase
      .from('customer_wallets')
      .select('balance, currency, updated_at')
      .eq('customer_id', user.id)
      .maybeSingle();

    const transactionsRes = await supabase
      .from('wallet_transactions')
      .select('id, amount, transaction_type, status, description, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!walletRes.error && walletRes.data) {
      setBalance(Number(walletRes.data.balance ?? 0));
      setCurrency(walletRes.data.currency ?? 'NGN');
      setWalletReady(true);
    } else {
      setBalance(0);
      setCurrency('NGN');
      setWalletReady(false);
    }

    if (!transactionsRes.error && transactionsRes.data) {
      setTransactions((transactionsRes.data ?? []) as WalletTransactionRow[]);
      if (transactionsRes.data.length > 0) {
        setWalletReady(true);
      }
    } else {
      setTransactions([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadWallet();
    } catch (error) {
      Alert.alert(
        'Wallet load failed',
        error instanceof Error ? error.message : 'Could not load wallet'
      );
    } finally {
      setLoading(false);
    }
  }, [loadWallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadWallet();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadWallet]);

  const handleQuickAmount = (value: number) => {
    setAmountInput(String(value));
  };

  const handleStartTopup = async () => {
  if (!resolvedAmount) {
    Alert.alert('Invalid amount', 'Enter a valid wallet top-up amount.');
    return;
  }

  try {
    setStartingTopup(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    if (!session?.access_token) {
      throw new Error('No active session found. Please sign in again.');
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase app environment values.');
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/paystack-initialize-wallet-topup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: resolvedAmount,
        }),
      }
    );

    const responseJson = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        responseJson?.error ||
          responseJson?.message ||
          `Top-up init failed with status ${response.status}`
      );
    }

    const authorizationUrl = responseJson?.data?.authorization_url;
    const reference = responseJson?.data?.reference;

    if (!authorizationUrl) {
      throw new Error('No Paystack authorization URL was returned.');
    }

    setLastReference(reference ?? null);

    await WebBrowser.openBrowserAsync(authorizationUrl);

    Alert.alert(
      'Payment started',
      'Complete the Paystack payment in the browser, then return to the app.'
    );

    setTimeout(() => {
      void loadWallet();
    }, 2500);
  } catch (error) {
    Alert.alert(
      'Top-up failed',
      error instanceof Error ? error.message : 'Could not start wallet top-up.'
    );
  } finally {
    setStartingTopup(false);
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
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#ffffff" />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Wallet</Text>

          <View style={{ width: 42 }} />
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceEyebrow}>Available balance</Text>
          <Text style={styles.balanceAmount}>{formatNaira(balance)}</Text>
          <Text style={styles.balanceMeta}>
            {walletReady ? `Live wallet • ${currency}` : 'Wallet is ready for your first top-up'}
          </Text>

          {lastReference ? (
            <View style={styles.referencePill}>
              <Text style={styles.referencePillText}>Last ref: {lastReference}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top up wallet</Text>
          <Text style={styles.sectionText}>
            Enter an amount, continue to Paystack checkout, then return to the app after payment.
          </Text>

          <Text style={styles.label}>Amount (NGN)</Text>
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="5000"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <View style={styles.quickAmountsWrap}>
            {QUICK_AMOUNTS.map((amount) => {
              const active = resolvedAmount === amount;
              return (
                <Pressable
                  key={amount}
                  style={[styles.quickAmountChip, active && styles.quickAmountChipActive]}
                  onPress={() => handleQuickAmount(amount)}
                >
                  <Text
                    style={[
                      styles.quickAmountChipText,
                      active && styles.quickAmountChipTextActive,
                    ]}
                  >
                    {formatNaira(amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.primaryButton, startingTopup && { opacity: 0.7 }]}
            disabled={startingTopup}
            onPress={handleStartTopup}
          >
            {startingTopup ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Top up with Paystack</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ride payments</Text>
          <Text style={styles.sectionText}>
            Wallet top-up is now connected. Next, we will use wallet, card, or cash as the payment
            method during ride booking and completion.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent wallet activity</Text>

          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>No wallet transactions yet.</Text>
          ) : (
            transactions.map((item) => (
              <View key={item.id} style={styles.transactionCard}>
                <View style={styles.transactionTopRow}>
                  <Text style={styles.transactionTitle}>{titleize(item.transaction_type)}</Text>
                  <Text style={styles.transactionAmount}>
                    {formatNaira(Number(item.amount ?? 0))}
                  </Text>
                </View>

                <Text style={styles.transactionMeta}>
                  {item.description || 'Wallet activity'}
                </Text>
                <Text style={styles.transactionMeta}>
                  {titleize(item.status)} • {formatDate(item.created_at)}
                </Text>
              </View>
            ))
          )}
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

  balanceCard: {
    backgroundColor: '#16a34a',
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    ...shadowCard,
  },
  balanceEyebrow: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },
  balanceMeta: {
    color: '#dcfce7',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  referencePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  referencePillText: {
    color: '#ffffff',
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
    marginBottom: 12,
  },
  sectionText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },

  label: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },

  quickAmountsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    marginBottom: 18,
  },
  quickAmountChip: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  quickAmountChipActive: {
    backgroundColor: '#dbeafe',
  },
  quickAmountChipText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  quickAmountChipTextActive: {
    color: '#1e3a8a',
  },

  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadowCard,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  emptyText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },

  transactionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  transactionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  transactionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  transactionAmount: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
  },
  transactionMeta: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 2,
  },
});