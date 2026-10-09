/**
 * TrustPopupCard.tsx
 *
 * Overlay card rendered when a user taps a map node.
 * Displays cryptographic proof, trust score, coordinates, and attribution.
 *
 * Install prerequisite (if not already present):
 *   npx expo install expo-clipboard
 */

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AtmosphericBadge, GlassCard } from '@digitalcanopy/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = 'utility_box' | 'transit_stop' | 'network_node' | 'ar_anchor';

export interface TrustNodeData {
  id: string;
  type: NodeType;
  coordinates: { lat: number; lng: number };
  verification_hash: string;
  trust_score: number;
  discovered_by: string;
  timestamp: string;
}

interface TrustPopupCardProps {
  node: TrustNodeData;
  onClose: () => void;
}

// ─── Static maps ──────────────────────────────────────────────────────────────

const TYPE_META: Record<NodeType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  utility_box:  { label: 'UTILITY BOX',  icon: 'cube-outline'   },
  transit_stop: { label: 'TRANSIT STOP', icon: 'bus-outline'    },
  network_node: { label: 'NETWORK NODE', icon: 'wifi-outline'   },
  ar_anchor:    { label: 'AR ANCHOR',    icon: 'locate-outline' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function timeAgo(iso: string): string {
  const diffMs   = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60)  return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60)  return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function trustColor(score: number): string {
  if (score > 80)  return '#00FF88';
  if (score >= 60) return '#FFAA00';
  return '#FF5555';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrustPopupCard({ node, onClose }: TrustPopupCardProps) {
  const translateY = useRef(new Animated.Value(32)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);

  // Slide-up + fade-in entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0, duration: 300, useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 280, useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const meta      = TYPE_META[node.type] ?? TYPE_META.utility_box;
  const scoreColor = trustColor(node.trust_score);
  const barFilled  = Math.round(node.trust_score / 10); // 0–10 segments

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(node.verification_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently no-op
    }
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY }], opacity }]}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Ionicons name={meta.icon} size={16} color="#00FFFF" />
          </View>
          <View>
            <Text style={styles.typeLabel}>{meta.label}</Text>
            <Text style={styles.nodeId}>{node.id}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={styles.closeBtn}
          activeOpacity={0.6}
        >
          <Ionicons name="close" size={14} color="#6495ED" />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* ── TRUST SCORE ───────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{'// '}TRUST SCORE</Text>
        <View style={styles.scoreRow}>
          <View style={styles.barTrack}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.barSegment,
                  i < barFilled
                    ? { backgroundColor: scoreColor, borderColor: scoreColor }
                    : styles.barSegmentEmpty,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>
            {node.trust_score}/100
          </Text>
        </View>
        {node.trust_score > 80 && (
          <AtmosphericBadge label="HIGH CONFIDENCE" variant="success" statusDot size="sm" />
        )}
        {node.trust_score >= 60 && node.trust_score <= 80 && (
          <AtmosphericBadge label="MODERATE CONFIDENCE" variant="warning" statusDot size="sm" />
        )}
        {node.trust_score < 60 && (
          <AtmosphericBadge label="LOW CONFIDENCE — FLAGGED" variant="error" statusDot size="sm" />
        )}
      </View>

      <View style={styles.divider} />

      {/* ── CRYPTOGRAPHIC PROOF ───────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{'// '}VERIFICATION HASH</Text>
        <View style={styles.hashRow}>
          <Text style={styles.hashText} selectable>
            {truncateHash(node.verification_hash)}
          </Text>
          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnActive]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={11}
              color={copied ? '#00FF88' : '#6495ED'}
            />
            <Text style={[styles.copyLabel, copied && styles.copyLabelActive]}>
              {copied ? 'COPIED' : 'COPY'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── COORDINATES ───────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{'// '}COORDINATES</Text>
        <Text style={styles.coordText}>
          {'LAT '}
          {node.coordinates.lat.toFixed(6)}
          {'   LNG '}
          {node.coordinates.lng.toFixed(6)}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons name="person-outline" size={11} color="#6495ED" />
          <Text style={styles.footerText}>{node.discovered_by}</Text>
        </View>
        <Text style={styles.footerText}>{timeAgo(node.timestamp)}</Text>
      </View>

    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(10, 17, 40, 0.94)',
    borderWidth: 1,
    borderColor: '#6495ED',
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#00FFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 255, 255, 0.07)',
  },
  typeLabel: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  nodeId: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#6495ED',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#6495ED',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Divider
  divider: {
    height: 1,
    backgroundColor: '#6495ED',
    opacity: 0.3,
    marginHorizontal: 0,
  },

  // ── Section
  section: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  sectionLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#6495ED',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Trust Score
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flexDirection: 'row',
    gap: 3,
    flex: 1,
  },
  barSegment: {
    flex: 1,
    height: 10,
    borderWidth: 1,
    borderRadius: 1,
  },
  barSegmentEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(100, 149, 237, 0.3)',
  },
  scoreValue: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    minWidth: 52,
    textAlign: 'right',
  },
  statusGreen: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#00FF88',
    letterSpacing: 0.8,
  },
  statusAmber: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#FFAA00',
    letterSpacing: 0.8,
  },
  statusRed: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#FF5555',
    letterSpacing: 0.8,
  },

  // ── Hash
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  hashText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#00FFFF',
    letterSpacing: 0.4,
    flex: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#6495ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyBtnActive: {
    borderColor: '#00FF88',
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
  },
  copyLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#6495ED',
    letterSpacing: 1,
  },
  copyLabelActive: {
    color: '#00FF88',
  },

  // ── Coordinates
  coordText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#00FFFF',
    letterSpacing: 0.5,
  },

  // ── Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(100, 149, 237, 0.05)',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6495ED',
    letterSpacing: 0.5,
  },
});
