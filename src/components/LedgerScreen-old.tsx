import { FlatList, StyleSheet, Text, View, TouchableOpacity, Modal, ScrollView, TextInput, Image, LayoutAnimation, Platform, UIManager, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useNodeStore, useNodeSubscription } from '../store/useNodeStore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface NodeData {
  id: string;
  lat: number;
  long: number;
  timestamp: number;
  status: string;
  syncStatus: string;
  description?: string | null;
}

function StatusIndicator({ status, syncStatus }: { status: string; syncStatus: string }) {
  if (syncStatus === 'pending_sync') {
    return <View style={[styles.dot, styles.dotGray]} />;
  }
  if (status === 'denied') {
    return (
      <View style={styles.dotXWrap}>
        <Text style={styles.dotXText}>✕</Text>
      </View>
    );
  }
  if (status === 'awaiting_verification') {
    return <View style={[styles.dot, styles.dotCyan]} />;
  }
  return <View style={[styles.dot, styles.dotGray]} />;
}

export default function LedgerScreen() {
  useNodeSubscription();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const nodes = useNodeStore((s: any) => s.nodes);
  const updateNodeDescription = useNodeStore((s: any) => s.updateNodeDescription);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['pending', 'awaiting_verification', 'verified']);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [descriptionText, setDescriptionText] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Force a refresh by waiting a moment - the subscription will update data
    await new Promise(resolve => setTimeout(resolve, 500));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(false);
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleFilter = (status: string) => {
    if (selectedFilters.includes(status)) {
      setSelectedFilters(selectedFilters.filter(f => f !== status));
    } else {
      setSelectedFilters([...selectedFilters, status]);
    }
  };

  const filteredNodes = nodes
    .filter((node: NodeData) => selectedFilters.includes(node.status))
    .sort((a: NodeData, b: NodeData) => b.timestamp - a.timestamp);

  const groupedNodes = filteredNodes.reduce((acc: Record<string, NodeData[]>, node: NodeData) => {
    const status = node.status;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(node);
    return acc;
  }, {} as Record<string, NodeData[]>);

  const renderItem = ({ item }: { item: NodeData }) => {
    const isPendingSync = item.syncStatus === 'pending_sync';
    const isDenied = item.status === 'denied';
    const isAwaiting = item.status === 'awaiting_verification';
    const isExpanded = expandedId === item.id;
    const canEdit = item.status === 'pending' || item.status === 'awaiting_verification';

    const accentColor = isPendingSync ? '#444' : isDenied ? '#FF5555' : isAwaiting ? '#00FFFF' : '#6495ED';
    const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${item.long},${item.lat}&z=15&l=map&size=400,200`;

    return (
      <View style={[styles.card, { borderColor: accentColor }]}>
        <TouchableOpacity 
          style={styles.cardHeader}
          onPress={() => toggleExpand(item.id)}
          activeOpacity={0.8}
        >
          <View style={styles.cardTop}>
            <StatusIndicator status={item.status} syncStatus={item.syncStatus} />
            <TouchableOpacity 
              style={styles.coordWrap}
              onPress={(e) => {
                e.stopPropagation();
                navigation.navigate('Map' as never);
              }}
            >
              <Text style={[styles.coord, { color: accentColor }]}>
                {item.lat.toFixed(6)},{'\u2002'}{item.long.toFixed(6)}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.ts}>
              {new Date(item.timestamp).toISOString()}
            </Text>
            <Text style={[styles.statusLabel, { color: accentColor }]}>
              {item.status.toUpperCase().replace(/_/g, '\u00A0')}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: '#6495ED' }]}>
            {isExpanded ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.expandedContent}>
            <Image 
              source={{ uri: mapUrl }} 
              style={styles.mapThumbnail}
              resizeMode="cover"
            />
            <View style={styles.descriptionSection}>
              {canEdit ? (
                <>
                  <TextInput
                    style={styles.descriptionInput}
                    value={descriptionText[item.id] || item.description || ''}
                    onChangeText={(text) => setDescriptionText({ ...descriptionText, [item.id]: text })}
                    placeholder="Add field notes..."
                    placeholderTextColor="rgba(100, 149, 237, 0.5)"
                    multiline
                  />
                  <TouchableOpacity 
                    style={styles.updateBtn}
                    onPress={async () => {
                      await updateNodeDescription(item.id, descriptionText[item.id] || '');
                      setDescriptionText({ ...descriptionText, [item.id]: '' });
                    }}
                  >
                    <Text style={styles.updateBtnText}>UPDATE LOG</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.readOnlyText}>
                  {item.description || 'No description provided.'}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderGroup = (status: string, nodes: NodeData[]) => {
    const accentColor = status === 'denied' ? '#FF5555' : status === 'awaiting_verification' ? '#00FFFF' : '#6495ED';
    
    return (
      <View key={status} style={styles.group}>
        <View style={styles.groupHeader}>
          <Text style={[styles.groupTitle, { color: accentColor }]}>
            {status.toUpperCase().replace(/_/g, '\u00A0')}
          </Text>
          <Text style={styles.groupCount}>{nodes.length}</Text>
        </View>
        {nodes.map((node) => (
          <View key={node.id}>
            {renderItem({ item: node })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Text style={styles.headerTitle}>PATCHWORK{'\u2002'}//\u2002NODE LEDGER</Text>
          <Text style={styles.userSub}>VERIFIER: ACTIVE</Text>
        </View>
        <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.filterBtn}>
          <Text style={styles.filterBtnText}>FILTER</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.statLabel}>TOTAL ENTRIES:</Text>
        <Text style={styles.statValue}>{filteredNodes.length}</Text>
      </View>
      <View style={styles.divider} />
      <ScrollView 
        style={styles.list} 
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00FFFF"
            colors={['#00FFFF']}
          />
        }
      >
        {Object.keys(groupedNodes).length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>// NO NODES LOGGED</Text>
            <Text style={styles.emptySub}>Capture a report from the Map or Camera tab.</Text>
          </View>
        ) : (
          Object.entries(groupedNodes).map(([status, nodes]) => renderGroup(status, nodes as NodeData[]))
        )}
      </ScrollView>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>FILTER BY STATUS</Text>
            <View style={styles.filterOptions}>
              {['pending', 'awaiting_verification', 'verified', 'denied'].map(status => (
                <TouchableOpacity
                  key={status}
                  style={[styles.filterOption, selectedFilters.includes(status) && styles.filterOptionSelected]}
                  onPress={() => toggleFilter(status)}
                >
                  <Text style={[styles.filterOptionText, selectedFilters.includes(status) && styles.filterOptionTextSelected]}>
                    {status.toUpperCase().replace(/_/g, '\u00A0')}
                  </Text>
                </TouchableOpacity>
              ))}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  userInfo: { flex: 1 },
  headerTitle: { fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 1 },
  userSub: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', marginTop: 2 },
  filterBtn: {
    borderWidth: 1, borderColor: '#6495ED',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  filterBtnText: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED', letterSpacing: 1 },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  statLabel: { fontFamily: 'monospace', fontSize: 10, color: '#6495ED' },
  statValue: { fontFamily: 'monospace', fontSize: 10, color: '#00FFFF' },
  divider: { height: 1, backgroundColor: '#6495ED', marginHorizontal: 16, marginBottom: 12 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },

  group: { marginBottom: 16 },
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  groupTitle: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 },
  groupCount: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED' },

  card: {
    borderWidth: 1,
    backgroundColor: '#0A1128',
    marginBottom: 10,
  },
  cardHeader: {
    padding: 12,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coordWrap: { flex: 1 },
  coord: { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.4, flex: 1 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chevron: {
    position: 'absolute', right: 12, top: 12,
    fontFamily: 'monospace', fontSize: 12,
  },
  expandedContent: {
    borderTopWidth: 1, borderTopColor: '#6495ED',
  },
  mapThumbnail: {
    width: '100%', height: 150,
    borderWidth: 1, borderColor: '#6495ED',
  },
  descriptionSection: {
    padding: 12, gap: 8,
  },
  descriptionInput: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1, borderColor: '#6495ED',
    color: '#00FFFF',
    fontFamily: 'monospace',
    fontSize: 11,
    paddingVertical: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  updateBtn: {
    borderWidth: 1, borderColor: '#00FFFF',
    paddingVertical: 8, alignItems: 'center',
  },
  updateBtnText: {
    fontFamily: 'monospace', fontSize: 10, color: '#00FFFF', letterSpacing: 1,
  },
  readOnlyText: {
    fontFamily: 'monospace', fontSize: 11, color: '#6495ED',
    fontStyle: 'italic',
  },
  ts: { fontFamily: 'monospace', fontSize: 9, color: '#3a4a6b' },
  statusLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 },

  dot: { width: 9, height: 9, borderRadius: 5 },
  dotCyan: {
    backgroundColor: '#00FFFF',
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 4,
  },
  dotGray: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#555' },
  dotXWrap: { width: 9, height: 9, alignItems: 'center', justifyContent: 'center' },
  dotXText: { fontSize: 9, color: '#FF5555', fontWeight: '700', lineHeight: 9 },

  emptyWrap: { paddingTop: 56, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: 'monospace', fontSize: 12, color: '#6495ED' },
  emptySub: { fontSize: 12, color: '#3a4a6b', textAlign: 'center' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#0A1128',
    borderWidth: 1, borderColor: '#6495ED',
    padding: 20, width: '100%', maxWidth: 320,
  },
  modalTitle: {
    fontFamily: 'monospace', fontSize: 12, color: '#00FFFF',
    letterSpacing: 1, marginBottom: 16, textAlign: 'center',
  },
  filterOptions: { gap: 8, marginBottom: 16 },
  filterOption: {
    borderWidth: 1, borderColor: '#6495ED',
    paddingVertical: 10, alignItems: 'center',
  },
  filterOptionSelected: {
    backgroundColor: 'rgba(0, 255, 255, 0.15)',
    borderColor: '#00FFFF',
  },
  filterOptionText: {
    fontFamily: 'monospace', fontSize: 10, color: '#6495ED', letterSpacing: 1,
  },
  filterOptionTextSelected: {
    color: '#00FFFF',
  },
  modalClose: {
    borderWidth: 1, borderColor: '#6495ED',
    paddingVertical: 10, alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: 'monospace', fontSize: 10, color: '#6495ED', letterSpacing: 1,
  },
});
