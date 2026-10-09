import { database } from '../db';
import Node from '../db/models/Node';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

interface NodeData {
  id: string;
  lat: number;
  long: number;
  timestamp: number;
  status: string;
  syncStatus: string;
  description?: string | null;
}

interface State {
  nodes: NodeData[];
  addQuickReport: (lat: number, long: number) => Promise<void>;
  updateNodeDescription: (id: string, description: string) => Promise<void>;
  markSynced: (id: string) => Promise<void>;
  syncPendingReports: (apiBase?: string, authToken?: string) => Promise<number>;
  setNodes: (nodes: NodeData[]) => void;
}

export const useNodeStore = create<State>((set, get) => ({
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addQuickReport: async (lat, long) => {
    let createdNodeId: string | null = null;
    await database.write(async () => {
      const created = await database.get('nodes').create((node) => {
        const nodeModel = node as Node;
        nodeModel.lat = lat;
        nodeModel.long = long;
        nodeModel.timestamp = Date.now();
        nodeModel.status = 'pending';
        nodeModel.nodeSyncStatus = 'pending_sync';
        nodeModel.description = null;
      });
      createdNodeId = created.id;
    });

    // Opportunistic background sync if apiBase is configured
    try {
      const { apiBase } = useSettingsStore.getState();
      if (apiBase) {
        get().syncPendingReports(apiBase).catch(() => {});
      }
    } catch {
      // offline-safe fallback
    }
  },
  updateNodeDescription: async (id, description) => {
    const node = await database.get('nodes').find(id);
    await (node as Node).updateDescription(description);
  },
  markSynced: async (id: string) => {
    const node = (await database.get('nodes').find(id)) as Node;
    await node.markSynced();
  },
  syncPendingReports: async (apiBase?: string, authToken?: string) => {
    try {
      const allNodes = (await database.get('nodes').query().fetch()) as Node[];
      const pending = allNodes.filter((n) => n.nodeSyncStatus === 'pending_sync');
      if (pending.length === 0) return 0;

      const base = (apiBase || useSettingsStore.getState().apiBase || '').trim();
      if (!base) return 0;

      const isSecure =
        base.startsWith('https://') ||
        (__DEV__ &&
          (base.startsWith('http://localhost') ||
            base.startsWith('http://127.0.0.1') ||
            base.startsWith('http://10.0.2.2')));
      if (!isSecure) {
        console.warn('Plain HTTP backend rejected: HTTPS required to protect report coordinates');
        return 0;
      }

      let synced = 0;
      for (const node of pending) {
        try {
          const res = await fetch(`${base}/api/nodes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              node_id: node.id,
              latitude: node.lat,
              longitude: node.long,
              status: node.status,
            }),
          });
          if (res.ok) {
            await node.markSynced();
            synced++;
          }
        } catch {
          // offline; remains pending_sync
        }
      }
      return synced;
    } catch (e) {
      console.warn('syncPendingReports error:', e);
      return 0;
    }
  },
}));

// Hook to subscribe to database changes
export function useNodeSubscription() {
  const setNodes = useNodeStore((s) => s.setNodes);
  useEffect(() => {
    const collection = database.get('nodes');
    const subscription = collection.query().observe().subscribe((records) => {
      const mapped = records.map((r) => {
        const node = r as Node;
        return {
          id: node.id,
          lat: node.lat,
          long: node.long,
          timestamp: node.timestamp,
          status: node.status,
          syncStatus: node.syncStatus,
          description: node.description,
        };
      });
      setNodes(mapped);
    });
    return () => subscription.unsubscribe();
  }, [setNodes]);
}
