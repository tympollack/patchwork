import { database } from '../db';
import Node from '../db/models/Node';
import { useEffect } from 'react';
import { create } from 'zustand';

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
  setNodes: (nodes: NodeData[]) => void;
}

export const useNodeStore = create<State>((set) => ({
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addQuickReport: async (lat, long) => {
    await database.write(async () => {
      await database.get('nodes').create((node) => {
        const nodeModel = node as Node;
        nodeModel.lat = lat;
        nodeModel.long = long;
        nodeModel.timestamp = Date.now();
        nodeModel.status = 'pending';
        nodeModel.nodeSyncStatus = 'pending_sync';
        nodeModel.description = null;
      });
    });
  },
  updateNodeDescription: async (id, description) => {
    const node = await database.get('nodes').find(id);
    await (node as Node).updateDescription(description);
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
