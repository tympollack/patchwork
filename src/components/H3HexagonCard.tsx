import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { H3HexagonCell } from '../types/h3';

export interface H3HexagonCardProps {
  hexagon: H3HexagonCell;
  onClose: () => void;
}

export default function H3HexagonCard({ hexagon, onClose }: H3HexagonCardProps) {
  const verifiedCount = (hexagon.statuses.verified || 0) + (hexagon.statuses.synced || 0);
  const pendingCount = (hexagon.statuses.pending || 0) + (hexagon.statuses.awaiting_verification || 0);
  const deniedCount = hexagon.statuses.denied || 0;

  return (
    <View style={styles.card} testID="h3-hexagon-card">
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.subHeader}>UBER H3 SPATIAL INDEX // RES 10</Text>
          <Text style={styles.title}>HEX CROWD DENSITY MASK</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Primary Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>NODE DENSITY</Text>
          <Text style={styles.metricValue}>{hexagon.count}</Text>
          <Text style={styles.metricSub}>REPORTS IN CELL</Text>
        </View>
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>DENSITY TIER</Text>
          <Text
            style={[
              styles.metricTier,
              hexagon.densityTier === 'critical'
                ? styles.tierCritical
                : hexagon.densityTier === 'high'
                ? styles.tierHigh
                : styles.tierMedium,
            ]}
          >
            {hexagon.densityTier.toUpperCase()}
          </Text>
          <Text style={styles.metricSub}>~66M BOUNDARY</Text>
        </View>
      </View>

      {/* Hex Index and Telemetry */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>H3 CELL INDEX</Text>
          <Text style={styles.infoMono}>{hexagon.h3Index}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>CELL CENTER</Text>
          <Text style={styles.infoMono}>
            {hexagon.center[0].toFixed(5)}, {hexagon.center[1].toFixed(5)}
          </Text>
        </View>
      </View>

      {/* Status Breakdown */}
      <View style={styles.breakdownRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusCount}>{verifiedCount}</Text>
          <Text style={styles.statusLabel}>VERIFIED</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={[styles.statusCount, { color: '#00FFFF' }]}>{pendingCount}</Text>
          <Text style={styles.statusLabel}>PENDING</Text>
        </View>
        {deniedCount > 0 && (
          <View style={styles.statusPill}>
            <Text style={[styles.statusCount, { color: '#FF5555' }]}>{deniedCount}</Text>
            <Text style={styles.statusLabel}>FLAGGED</Text>
          </View>
        )}
      </View>

      {/* Privacy Guarantee Notice */}
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyText}>
          PRIVACY PROTOCOL ACTIVE: Raw GPS coordinates are masked into this resolution-10
          spatial hexagon to prevent surveyor trajectory triangulation.
        </Text>
      </View>

      {/* Action button */}
      <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.75}>
        <Text style={styles.dismissBtnText}>DISMISS CELL INSPECTION</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0A1128',
    borderWidth: 1.5,
    borderColor: '#00FFFF',
    padding: 18,
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  subHeader: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6495ED',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  closeBtnText: {
    color: '#6495ED',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E2D5A',
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  metricBlock: {
    flex: 1,
    backgroundColor: '#0F1B3B',
    borderWidth: 1,
    borderColor: '#1E2D5A',
    padding: 10,
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#6495ED',
    letterSpacing: 1,
  },
  metricValue: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginVertical: 2,
  },
  metricTier: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginVertical: 6,
  },
  tierMedium: {
    color: '#00E5FF',
  },
  tierHigh: {
    color: '#38BDF8',
  },
  tierCritical: {
    color: '#818CF8',
  },
  metricSub: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#4A6FA5',
  },
  infoSection: {
    backgroundColor: '#060B1C',
    borderWidth: 1,
    borderColor: '#142042',
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6495ED',
  },
  infoMono: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#00FFFF',
    fontWeight: 'bold',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1B3B',
    borderWidth: 1,
    borderColor: '#1E2D5A',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  statusCount: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#34D399',
  },
  statusLabel: {
    fontFamily: 'sans-serif',
    fontSize: 9,
    fontWeight: '600',
    color: '#6495ED',
    letterSpacing: 0.5,
  },
  privacyNotice: {
    borderLeftWidth: 2,
    borderLeftColor: '#00FFFF',
    paddingLeft: 8,
    marginBottom: 14,
  },
  privacyText: {
    fontFamily: 'sans-serif',
    fontSize: 10,
    color: '#7AA7E8',
    lineHeight: 14,
  },
  dismissBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6495ED',
    paddingVertical: 10,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontFamily: 'sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#00FFFF',
    letterSpacing: 1,
  },
});
