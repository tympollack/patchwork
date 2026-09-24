import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNodeStore, useNodeSubscription } from '../store/useNodeStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { seedDatabase } from '../utils/seedDatabase';
import OSMMap from './OSMMap';
import TrustPopupCard, { TrustNodeData } from './TrustPopupCard';


export default function MapScreen() {
  const nodes = useNodeStore((s: any) => s.nodes);
  const addQuick = useNodeStore((s: any) => s.addQuickReport);
  const insets = useSafeAreaInsets();
  const { hapticsEnabled, seedOnLaunch, mapDefaultLat, mapDefaultLng } = useSettingsStore();
  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (hapticsEnabled) Haptics.impactAsync(style);
  };
  const [mode, setMode] = useState<'idle' | 'manual'>('idle');
  const [manualCoord, setManualCoord] = useState<{ lat: number; long: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [selectedNode, setSelectedNode] = useState<TrustNodeData | null>(null);
  // Keep a ref to current mode so event callbacks don't capture stale closures
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // subscribe to db
  useNodeSubscription();

  // Seed database with mock data on first load
  useEffect(() => {
    if (isReady && seedOnLaunch) {
      setTimeout(() => {
        try {
          seedDatabase();
        } catch (error) {
          console.error('Failed to seed database:', error);
        }
      }, 1000);
    }
  }, [isReady, seedOnLaunch]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission not granted');
          setIsReady(true);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setUserLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          heading: loc.coords.heading || 0
        });
        setIsReady(true);
      } catch (error) {
        console.error('Location error:', error);
        setIsReady(true);
      }
    })();
  }, []);

  const handleQuick = async () => {
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await addQuick(loc.coords.latitude, loc.coords.longitude);
      haptic(Haptics.ImpactFeedbackStyle.Light);
      setToastMsg('COORDINATES RECORDED');
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 2000);
      console.log('Quick capture:', loc.coords);
    } catch (e) {
      setToastMsg('GPS ERROR — RETRY');
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 2500);
    }
  };

  const handleMarkerPress = (id: string) => {
    const raw = nodes.find((n: any) => n.id === id);
    if (!raw) return;
    setSelectedNode(dbNodeToTrustData(raw));
  };

  const confirmManual = async () => {
    if (!manualCoord) return;
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
    await addQuick(manualCoord.lat, manualCoord.long);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    console.log('Manual pin:', manualCoord);
    setToastMsg('PIN CONFIRMED');
    setShowConfirm(true);
    setTimeout(() => setShowConfirm(false), 2000);
    setMode('idle');
    setManualCoord(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <OSMMap
        initialLat={userLocation?.lat || mapDefaultLat}
        initialLng={userLocation?.lng || mapDefaultLng}
        markers={nodes.map((n: any) => ({ id: n.id, lat: n.lat, lng: n.long, status: n.status }))}
        userLocation={userLocation}
        onMarkerPress={handleMarkerPress}
      />

      {/* Manual mode crosshair — centered, non-interactive */}
      {mode === 'manual' && (
        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
          <View style={styles.crosshairDot} />
        </View>
      )}

      {/* Live coordinate readout during manual mode */}
      {mode === 'manual' && manualCoord && (
        <View style={styles.coordReadout}>
          <Text style={styles.coordText}>
            LAT {manualCoord.lat.toFixed(6)}{'   '}LNG {manualCoord.long.toFixed(6)}
          </Text>
        </View>
      )}

      {/* Confirmation toast */}
      {showConfirm && (
        <View style={styles.confirmToast}>
          <Text style={styles.confirmText}>{toastMsg}</Text>
        </View>
      )}

      {/* TrustPopupCard — shown when a map node is tapped */}
      {selectedNode && (
        <View style={styles.popupWrap}>
          <TrustPopupCard node={selectedNode} onClose={() => setSelectedNode(null)} />
        </View>
      )}

      {/* HUD action plate — hidden while a node card is open */}
      {!selectedNode && <View style={styles.hudPlate}>
        {mode === 'idle' ? (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleQuick} activeOpacity={0.75}>
              <Text style={styles.primaryBtnText}>ONE-TAP CAPTURE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('manual')} activeOpacity={0.75}>
              <Text style={styles.secondaryBtnText}>MANUAL PIN</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.warningText}>
              WARN: Inaccurate remote reporting negatively impacts your Verifier Trust Score.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={confirmManual} activeOpacity={0.75}>
              <Text style={styles.primaryBtnText}>CONFIRM PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setMode('idle'); setManualCoord(null); }}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </>
        )}
      </View>}
    </View>
  );
}

// ─── Derive a TrustNodeData display object from a raw WatermelonDB node ──────

type NodeType = 'utility_box' | 'transit_stop' | 'network_node' | 'ar_anchor';
const NODE_TYPES: NodeType[] = ['utility_box', 'transit_stop', 'network_node', 'ar_anchor'];

function charSum(str: string): number {
  return str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function dbNodeToTrustData(raw: any): TrustNodeData {
  const sum = charSum(raw.id);
  const type = NODE_TYPES[sum % NODE_TYPES.length];

  const seed = `${raw.id}:${raw.lat.toFixed(8)}:${raw.long.toFixed(8)}`;
  let hash = '';
  for (let i = 0; i < seed.length; i++) {
    hash += seed.charCodeAt(i).toString(16).padStart(2, '0');
  }
  const verification_hash = hash.slice(0, 64).padEnd(64, '0');

  const base = sum % 20;
  let trust_score: number;
  switch (raw.status) {
    case 'verified':              trust_score = 80 + base; break;
    case 'awaiting_verification': trust_score = 60 + (base % 20); break;
    case 'denied':                trust_score = 10 + (base % 20); break;
    default:                      trust_score = 40 + (base % 20); break;
  }

  return {
    id: raw.id,
    type,
    coordinates: { lat: raw.lat, lng: raw.long },
    verification_hash,
    trust_score,
    discovered_by: `user_${(sum % 999).toString().padStart(3, '0')}`,
    timestamp: new Date(raw.timestamp).toISOString(),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },

  popupWrap: {
    position: 'absolute', bottom: 28, left: 0, right: 0,
  },

  crosshairWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  crosshairH: { position: 'absolute', width: 44, height: 1, backgroundColor: '#00FFFF', opacity: 0.9 },
  crosshairV: { position: 'absolute', width: 1, height: 44, backgroundColor: '#00FFFF', opacity: 0.9 },
  crosshairDot: {
    position: 'absolute', width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#00FFFF',
  },

  coordReadout: {
    position: 'absolute', top: 56, alignSelf: 'center',
    backgroundColor: 'rgba(10, 17, 40, 0.88)',
    borderWidth: 1, borderColor: '#6495ED',
    paddingHorizontal: 14, paddingVertical: 6,
  },
  coordText: { fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 0.5 },

  hudPlate: {
    position: 'absolute', bottom: 28, left: 16, right: 16,
    backgroundColor: 'rgba(10, 17, 40, 0.85)',
    borderWidth: 1, borderColor: '#6495ED',
    padding: 16, gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#00FFFF',
    paddingVertical: 13, alignItems: 'center', borderRadius: 4,
  },
  primaryBtnText: {
    fontFamily: 'monospace', fontSize: 11, color: '#0A1128', fontWeight: '700', letterSpacing: 2,
  },
  secondaryBtn: {
    borderWidth: 1, borderColor: '#6495ED',
    paddingVertical: 11, alignItems: 'center', borderRadius: 4,
  },
  secondaryBtnText: {
    fontFamily: 'monospace', fontSize: 11, color: '#6495ED', letterSpacing: 2,
  },
  cancelBtn: {
    borderWidth: 1, borderColor: '#FF5555',
    paddingVertical: 11, alignItems: 'center', borderRadius: 4,
  },
  cancelBtnText: {
    fontFamily: 'monospace', fontSize: 11, color: '#FF5555', letterSpacing: 2,
  },
  warningText: {
    fontFamily: 'monospace', fontSize: 9, color: '#6495ED', textAlign: 'center', letterSpacing: 0.3,
  },
  confirmToast: {
    position: 'absolute', top: 56, alignSelf: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.15)',
    borderWidth: 1, borderColor: '#00FFFF',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  confirmText: {
    fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 1, fontWeight: '700',
  },
});
