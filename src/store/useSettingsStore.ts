import { create } from 'zustand';

export interface AppSettings {
  apiBase: string;
  hapticsEnabled: boolean;
  seedOnLaunch: boolean;
  mapDefaultLat: number;
  mapDefaultLng: number;
  cameraQuality: number; // 0.0 – 1.0
}

interface SettingsStore extends AppSettings {
  set: (partial: Partial<AppSettings>) => void;
  reset: () => void;
}

const DEFAULTS: AppSettings = {
  apiBase: 'http://192.168.4.86:3000',
  hapticsEnabled: true,
  seedOnLaunch: true,
  mapDefaultLat: 39.0501,
  mapDefaultLng: -84.1915,
  cameraQuality: 1.0,
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULTS,
  set: (partial) => set((s) => ({ ...s, ...partial })),
  reset: () => set({ ...DEFAULTS }),
}));
