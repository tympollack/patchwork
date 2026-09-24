import React, { useState } from 'react';
import {
  ScrollView,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNodeStore, useNodeSubscription } from '../store/useNodeStore';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Color + indicator per status

function statusColor(status: string, syncStatus: string): string {
  if (syncStatus === 'pending_sync') return '#888888';
  if (status === 'awaiting_verification') return '#C8A84B'; // Muted amber
  if (status === 'verified') return '#00FF88';             // Green
  if (status === 'denied') return '#FF5555';               // Red
  return '#6495ED';                                        // Cornflower (pending)
}

function statusIndicator(status: string, syncStatus: string): string {
  if (syncStatus === 'pending_sync') return '◌';
  if (status === 'awaiting_verification') return '●';
  if (status === 'verified') return '✓';
  if (status === 'denied') return '✕';
  return '○';
}

// ------------------------------------------------------------------
// LEDGER ITEM COMPONENT (The Expandable Card)
// ------------------------------------------------------------------
const LedgerItem = ({ item, isExpanded, onToggle, onUpdateDescription }: any) => {
  const [descText, setDescText] = useState(item.description || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const color = statusColor(item.status, item.syncStatus);
  const indicator = statusIndicator(item.status, item.syncStatus);
  const isEditable = item.status === 'awaiting_verification' || item.syncStatus === 'pending_sync';

  const handleSave = async () => {
    if (!onUpdateDescription) return;
    try {
      await onUpdateDescription(item.id, descText);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  return (
    <View style={[styles.cardContainer, { borderColor: color }]}>
      {/* HEADER */}
      <TouchableOpacity activeOpacity={0.7} onPress={() => onToggle(item.id)} style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={[styles.indicator, { color }]}>{indicator}</Text>
          <View>
            <Text style={[styles.coord, { color }]}>
              {item.lat.toFixed(5)}, {item.long.toFixed(5)}
            </Text>
            <Text style={styles.cardDate}>
              {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'UNKNOWN'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.statusText, { color }]}>
            {item.status.replace(/_/g, ' ').toUpperCase()}
          </Text>
          <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {/* EXPANDED BODY */}
      {isExpanded && (
        <View style={styles.cardBody}>
          <View style={styles.expandedRow}>
            {/* LEFT */}
            <View style={styles.leftPanel}>
              <Text style={styles.dataLabel}>LAT</Text>
              <Text style={[styles.dataValue, { color }]}>{item.lat.toFixed(6)}</Text>
              <Text style={styles.dataLabel}>LON</Text>
              <Text style={[styles.dataValue, { color }]}>{item.long.toFixed(6)}</Text>
              <Text style={styles.dataLabel}>DESC</Text>
              {isEditable ? (
                <TextInput
                  style={styles.textInput}
                  placeholder="[ FIELD NOTES ]"
                  placeholderTextColor="rgba(100, 149, 237, 0.4)"
                  value={descText}
                  onChangeText={setDescText}
                  multiline
                  textAlignVertical="top"
                />
              ) : (
                <Text style={styles.readOnlyText}>{item.description || '[ NONE ]'}</Text>
              )}
              {isEditable && (
                <TouchableOpacity
                  style={[styles.updateBtn, saveStatus === 'saved' && styles.updateBtnSaved, saveStatus === 'error' && styles.updateBtnError]}
                  onPress={handleSave}
                >
                  <Text style={styles.updateBtnText}>
                    {saveStatus === 'saved' ? '✓ SAVED' : saveStatus === 'error' ? '✕ ERROR' : 'UPDATE LOG'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* RIGHT: map thumbnail */}
            <View style={styles.mapContainer}>
              <Image
                source={{ uri: `https://static-maps.yandex.ru/1.x/?ll=${item.long},${item.lat}&z=15&l=map&size=200,200` }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.crosshairVertical} />
              <View style={styles.crosshairHorizontal} />
              <View style={[styles.pin, { borderColor: color }]}>
                <View style={[styles.pinDot, { backgroundColor: color }]} />
              </View>
            </View>
          </View>

          <Text style={styles.metadata}>
            ID: {item.id} | TS: {item.timestamp ? new Date(item.timestamp).toISOString() : 'UNKNOWN'}
          </Text>
        </View>
      )}
    </View>
  );
};

// ------------------------------------------------------------------
// MAIN LEDGER SCREEN
// ------------------------------------------------------------------
const ALL_STATUSES = ['pending', 'awaiting_verification', 'verified', 'denied'];
const FILTER_ORDER = ['pending', 'awaiting_verification', 'verified', 'denied'];

export default function LedgerScreen() {
  useNodeSubscription();
  const nodes = useNodeStore((s) => s.nodes);
  const insets = useSafeAreaInsets();
  const updateDescription = useNodeStore((s) => s.updateNodeDescription);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([...ALL_STATUSES]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const toggleGroup = (status: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedGroups(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleFilter = (status: string) => {
    setSelectedFilters(prev =>
      prev.includes(status) ? prev.filter(f => f !== status) : [...prev, status]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await new Promise(resolve => setTimeout(resolve, 500));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(false);
  };

  // Filter and group by STATUS_ORDER, newest-first within each group
  const groups: { status: string; data: any[] }[] = FILTER_ORDER
    .filter(s => selectedFilters.includes(s))
    .map(s => ({
      status: s,
      data: nodes
        .filter((n: any) => n.status === s)
        .sort((a: any, b: any) => b.timestamp - a.timestamp),
    }))
    .filter(g => g.data.length > 0);

  const filtered = groups.reduce((acc: any[], g) => acc.concat(g.data), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.title}>PATCHWORK // NODE LEDGER</Text>
          <Text style={styles.subtitle}>VERIFIER: ACTIVE</Text>
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
          <Text style={styles.filterBtnText}>
            FILTER {selectedFilters.length < ALL_STATUSES.length ? `[${selectedFilters.length}]` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statLabel}>TOTAL ENTRIES:</Text>
        <Text style={styles.statValue}>{filtered.length}</Text>
      </View>
      <View style={styles.divider} />

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FFFF" colors={['#00FFFF']} />
        }
      >
        {groups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>// NO NODES MATCH FILTER</Text>
          </View>
        ) : (
          groups.map(({ status, data }) => {
            const color = statusColor(status, 'synced');
            return (
              <View key={status} style={styles.group}>
                <TouchableOpacity
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(status)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.groupTitle, { color }]}>
                    {collapsedGroups.includes(status) ? '▶ ' : '▼ '}
                    {status.replace(/_/g, '\u00A0').toUpperCase()}
                  </Text>
                  <Text style={styles.groupCount}>{data.length}</Text>
                </TouchableOpacity>
                {!collapsedGroups.includes(status) && data.map((item: any) => (
                  <LedgerItem
                    key={item.id}
                    item={item}
                    isExpanded={expandedId === item.id}
                    onToggle={toggleExpand}
                    onUpdateDescription={updateDescription}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FILTER MODAL */}
      <Modal visible={filterModalVisible} transparent animationType="fade" onRequestClose={() => setFilterModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>FILTER BY STATUS</Text>
            <View style={styles.filterOptions}>
              {ALL_STATUSES.map(s => {
                const active = selectedFilters.includes(s);
                const color = statusColor(s, 'synced');
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterOption, active && { borderColor: color, backgroundColor: `${color}22` }]}
                    onPress={() => toggleFilter(s)}
                  >
                    <Text style={[styles.filterOptionText, active && { color }]}>
                      {active ? '▪ ' : '  '}{s.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ------------------------------------------------------------------
// STYLESHEET
// ------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },

  screenHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  title: { fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 1 },
  subtitle: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', marginTop: 2 },
  filterBtn: { borderWidth: 1, borderColor: '#6495ED', paddingHorizontal: 12, paddingVertical: 6 },
  filterBtnText: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 1 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  statLabel: { fontFamily: 'monospace', fontSize: 10, color: '#6495ED' },
  statValue: { fontFamily: 'monospace', fontSize: 10, color: '#00FFFF' },
  divider: { height: 1, backgroundColor: '#6495ED', marginHorizontal: 16, marginBottom: 12 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  group: { marginBottom: 16 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  groupTitle: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 },
  groupCount: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED' },

  cardContainer: { borderWidth: 1, backgroundColor: '#0A1128', marginBottom: 8 },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  indicator: { fontSize: 13, marginRight: 8 },
  coord: { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.4 },
  cardDate: { fontFamily: 'monospace', fontSize: 9, color: '#3a4a6b', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, marginRight: 8 },
  chevron: { color: '#6495ED', fontSize: 10 },

  cardBody: { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(100, 149, 237, 0.3)' },
  expandedRow: { flexDirection: 'row', marginBottom: 8, gap: 10 },
  leftPanel: { flex: 1 },
  dataLabel: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 1.5, marginTop: 6 },
  dataValue: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.5 },

  mapContainer: {
    width: '45%', aspectRatio: 1, borderWidth: 1, borderColor: '#6495ED',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  thumbnail: { width: '100%', height: '100%', opacity: 0.8 },
  crosshairVertical: { position: 'absolute', width: 1, height: 20, backgroundColor: '#00FFFF' },
  crosshairHorizontal: { position: 'absolute', width: 20, height: 1, backgroundColor: '#00FFFF' },
  pin: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(10, 17, 40, 0.6)',
  },
  pinDot: { width: 6, height: 6, borderRadius: 3 },

  textInput: {
    borderBottomWidth: 1, borderBottomColor: '#6495ED',
    color: '#00FFFF', fontFamily: 'monospace', fontSize: 11,
    paddingVertical: 4, minHeight: 32, textAlignVertical: 'top',
  },
  readOnlyText: { fontFamily: 'monospace', fontSize: 11, color: '#6495ED', fontStyle: 'italic' },
  updateBtn: { borderWidth: 1, borderColor: '#00FFFF', paddingVertical: 8, alignItems: 'center', marginTop: 6 },
  updateBtnText: { fontFamily: 'monospace', fontSize: 10, color: '#00FFFF', letterSpacing: 1 },
  updateBtnSaved: { borderColor: '#00FF88', backgroundColor: 'rgba(0, 255, 136, 0.1)' },
  updateBtnError: { borderColor: '#FF5555', backgroundColor: 'rgba(255, 85, 85, 0.1)' },

  metadata: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', opacity: 0.5, textAlign: 'right', marginTop: 4 },

  emptyWrap: { paddingTop: 56, alignItems: 'center' },
  emptyText: { fontFamily: 'monospace', fontSize: 12, color: '#6495ED' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  modalContent: { backgroundColor: '#0A1128', borderWidth: 1, borderColor: '#6495ED', padding: 20, width: '100%', maxWidth: 320 },
  modalTitle: { fontFamily: 'monospace', fontSize: 12, color: '#00FFFF', letterSpacing: 1, marginBottom: 16, textAlign: 'center' },
  filterOptions: { gap: 8, marginBottom: 16 },
  filterOption: { borderWidth: 1, borderColor: '#6495ED', paddingVertical: 10, paddingHorizontal: 12 },
  filterOptionText: { fontFamily: 'monospace', fontSize: 10, color: '#6495ED', letterSpacing: 1 },
  modalClose: { borderWidth: 1, borderColor: '#6495ED', paddingVertical: 10, alignItems: 'center' },
  modalCloseText: { fontFamily: 'monospace', fontSize: 10, color: '#6495ED', letterSpacing: 1 },
});