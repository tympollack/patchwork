import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  /** Base URL for the PatchWork backend API.
   *  Defaults to EXPO_PUBLIC_WORKER_URL or https://patchwork-upload-processor.sunshade.workers.dev.
   *  Must use HTTPS (or localhost in dev) so intercepted requests cannot sniff coordinate data. */
  apiBase: string;
  hapticsEnabled: boolean;
  seedOnLaunch: boolean;
  mapDefaultLat: number;
  mapDefaultLng: number;
  cameraQuality: number; // 0.0 – 1.0
  h3PrivacyMask: boolean; // Uber H3 Resolution-10 crowd density privacy masking
}

interface SettingsStore extends AppSettings {
  set: (partial: Partial<AppSettings>) => void;
  reset: () => void;
}

const DEFAULTS: AppSettings = {
  apiBase:
    process.env.EXPO_PUBLIC_WORKER_URL ||
    'https://patchwork-upload-processor.sunshade.workers.dev',
  hapticsEnabled: true,
  seedOnLaunch: false,
  mapDefaultLat: 39.0501,
  mapDefaultLng: -84.1915,
  cameraQuality: 1.0,
  h3PrivacyMask: true,   // Enabled by default for surveyor and reporter anonymity
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (partial) => set((s) => ({ ...s, ...partial })),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'patchwork-settings', // AsyncStorage key
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
