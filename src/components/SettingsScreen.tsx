import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';

type RowProps = { label: string; sub?: string; children: React.ReactNode };

function Row({ label, sub, children }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <View style={styles.rowRight}>{children}</View>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const { user, signOut } = useAuthStore();
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (settings.hapticsEnabled) Haptics.impactAsync(style);
  };

  const handleResetLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { showToast('GPS PERMISSION DENIED'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      settings.set({ mapDefaultLat: loc.coords.latitude, mapDefaultLng: loc.coords.longitude });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const place = [geo.name, geo.city, geo.region].filter(Boolean).join(', ');
        showToast(`DEFAULT SET TO ${place || `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`}`);
      } catch {
        showToast(`DEFAULT SET TO ${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
      }
    } catch (e) {
      console.warn('Could not get location:', e);
      showToast('GPS ERROR — COULD NOT UPDATE');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.root}>
      {toast && (
        <View style={[styles.toast, { top: insets.top + 12 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.screenTitle}>PATCHWORK // SETTINGS</Text>
      <Text style={styles.screenSub}>{user?.email ?? 'VERIFIER CONFIG'}</Text>
      <View style={styles.divider} />

      <Section title="INPUT" />

      <Row label="HAPTICS" sub="Vibration feedback on actions">
        <Switch
          value={settings.hapticsEnabled}
          onValueChange={(v) => {
            if (v) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            settings.set({ hapticsEnabled: v });
          }}
          trackColor={{ false: '#1e2a44', true: 'rgba(0,255,255,0.35)' }}
          thumbColor={settings.hapticsEnabled ? '#00FFFF' : '#6495ED'}
        />
      </Row>

      <Row label="CAMERA QUALITY" sub={`${Math.round(settings.cameraQuality * 100)}%`}>
        <View style={styles.stepRow}>
          {[0.5, 0.75, 1.0].map((q) => (
            <TouchableOpacity
              key={q}
              style={[styles.stepBtn, settings.cameraQuality === q && styles.stepBtnActive]}
              onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Light); settings.set({ cameraQuality: q }); }}
            >
              <Text style={[styles.stepBtnText, settings.cameraQuality === q && styles.stepBtnTextActive]}>
                {Math.round(q * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Row>

      <Section title="MAP" />

      <Row
        label="DEFAULT LOCATION"
        sub={`${settings.mapDefaultLat.toFixed(5)}, ${settings.mapDefaultLng.toFixed(5)}`}
      >
        <TouchableOpacity
          style={[styles.stepBtn, styles.stepBtnActive]}
          onPress={handleResetLocation}
          disabled={locating}
        >
          {locating
            ? <ActivityIndicator size="small" color="#00FFFF" />
            : <Text style={styles.stepBtnTextActive}>USE CURRENT</Text>}
        </TouchableOpacity>
      </Row>

      <Section title="DANGER ZONE" />

      <TouchableOpacity style={styles.resetBtn} onPress={() => settings.reset()}>
        <Text style={styles.resetBtnText}>RESET TO DEFAULTS</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.resetBtn, styles.signOutBtn]} onPress={signOut}>
        <Text style={[styles.resetBtnText, styles.signOutBtnText]}>SIGN OUT</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1128' },
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },

  toast: {
    position: 'absolute', left: 16, right: 16, zIndex: 99,
    backgroundColor: 'rgba(10, 17, 40, 0.95)',
    borderWidth: 1, borderColor: '#00FFFF',
    paddingVertical: 10, paddingHorizontal: 14,
  },
  toastText: { fontFamily: 'monospace', fontSize: 10, color: '#00FFFF', letterSpacing: 0.5 },

  screenTitle: { fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 1 },
  screenSub: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', marginTop: 2, marginBottom: 12 },
  divider: { height: 1, backgroundColor: '#6495ED', marginBottom: 20 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 2, marginRight: 10 },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(100,149,237,0.25)' },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(100,149,237,0.15)',
  },
  rowLeft: { flex: 1, paddingRight: 16 },
  rowLabel: { fontFamily: 'monospace', fontSize: 11, color: '#C8D8F8', letterSpacing: 0.5 },
  rowSub: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },

  monoVal: { fontFamily: 'monospace', fontSize: 12, color: '#00FFFF' },

  stepRow: { flexDirection: 'row', gap: 6 },
  stepBtn: {
    borderWidth: 1, borderColor: '#6495ED',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  stepBtnActive: { borderColor: '#00FFFF', backgroundColor: 'rgba(0,255,255,0.12)' },
  stepBtnText: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED' },
  stepBtnTextActive: { color: '#00FFFF' },

  resetBtn: {
    marginTop: 24, borderWidth: 1, borderColor: '#FF5555',
    paddingVertical: 14, alignItems: 'center',
  },
  resetBtnText: { fontFamily: 'monospace', fontSize: 10, color: '#FF5555', letterSpacing: 2 },
  signOutBtn: { marginTop: 10, borderColor: '#6495ED' },
  signOutBtnText: { color: '#6495ED' },
});
