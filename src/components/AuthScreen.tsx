import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, loading, error } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!email.trim()) return 'EMAIL REQUIRED';
    if (!email.includes('@')) return 'INVALID EMAIL FORMAT';
    if (password.length < 6) return 'PASSWORD MIN 6 CHARACTERS';
    if (mode === 'register' && password !== confirmPassword) return 'PASSWORDS DO NOT MATCH';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setLocalError(err); return; }
    setLocalError(null);
    if (mode === 'login') {
      await signIn(email.trim(), password);
    } else {
      await signUp(email.trim(), password);
    }
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.wordmark}>PATCHWORK</Text>
        <Text style={styles.tagline}>// CIVIC INFRASTRUCTURE NETWORK</Text>
        <View style={styles.divider} />

        <Text style={styles.modeLabel}>
          {mode === 'login' ? 'VERIFIER LOGIN' : 'NEW VERIFIER REGISTRATION'}
        </Text>

        {displayError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>ERR:// {displayError.toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderTextColor="#3a4a6b"
            placeholder="verifier@domain.com"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholderTextColor="#3a4a6b"
            placeholder="••••••••"
          />
        </View>

        {mode === 'register' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholderTextColor="#3a4a6b"
              placeholder="••••••••"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#0A1128" />
            : <Text style={styles.primaryBtnText}>
                {mode === 'login' ? 'ACCESS NETWORK' : 'REGISTER VERIFIER'}
              </Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchBtn}
          onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setLocalError(null); }}
          activeOpacity={0.7}
        >
          <Text style={styles.switchBtnText}>
            {mode === 'login' ? '// NEW? REGISTER AS VERIFIER' : '// ALREADY REGISTERED? LOGIN'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1128' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },

  wordmark: { fontFamily: 'monospace', fontSize: 28, color: '#00FFFF', letterSpacing: 6, textAlign: 'center' },
  tagline: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', textAlign: 'center', marginTop: 4, letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#6495ED', marginVertical: 28 },

  modeLabel: { fontFamily: 'monospace', fontSize: 10, color: '#6495ED', letterSpacing: 2, marginBottom: 20 },

  errorBanner: {
    borderWidth: 1, borderColor: '#FF5555',
    backgroundColor: 'rgba(255,85,85,0.08)',
    paddingVertical: 8, paddingHorizontal: 12, marginBottom: 16,
  },
  errorText: { fontFamily: 'monospace', fontSize: 9, color: '#FF5555', letterSpacing: 0.5 },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 2, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#6495ED',
    backgroundColor: 'rgba(100,149,237,0.06)',
    color: '#C8D8F8', fontFamily: 'monospace', fontSize: 13,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  primaryBtn: {
    backgroundColor: '#00FFFF',
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  primaryBtnDisabled: { backgroundColor: 'rgba(0,255,255,0.35)' },
  primaryBtnText: { fontFamily: 'monospace', fontSize: 11, color: '#0A1128', fontWeight: '700', letterSpacing: 2 },

  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchBtnText: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 1 },
});
