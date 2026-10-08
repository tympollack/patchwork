import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  /** Base URL for the PatchWork backend API.
   *  Defaults to empty string — must be configured in Settings before uploads work.
   *  Never defaults to a plain HTTP address so intercepted requests can't sniff data. */
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
  apiBase: '',           // intentionally empty — user must set a valid HTTPS URL in Settings
  hapticsEnabled: true,
  seedOnLaunch: true,
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
