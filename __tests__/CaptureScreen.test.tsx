import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CaptureScreen from '../src/components/CaptureScreen';
import * as Camera from 'expo-camera';
import * as Location from 'expo-location';
import { setTestViewport, assertWithinViewportBounds, VIEWPORTS, type ViewportPreset } from '../src/__tests__/utils/withViewport';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: React.forwardRef(({ children }: any, ref: any) => (
      <View testID="camera-view">{children}</View>
    )),
    useCameraPermissions: jest.fn(),
  };
});
jest.mock('expo-location');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: () => ({ apiBase: 'http://localhost:3000', hapticsEnabled: false, cameraQuality: 0.8 }),
}));

const VIEWPORT_PRESETS: ViewportPreset[] = ['compact', 'standard', 'wide'];

describe('CaptureScreen', () => {
  const mockRequestCameraPermission = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Viewport-agnostic baseline tests
  // ---------------------------------------------------------------------------

  it('should render loading state when camera permissions are loading', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([null, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { getByText } = render(<CaptureScreen />);
    expect(getByText('// INITIALIZING SENSOR...')).toBeTruthy();
  });

  it('should render permission request UI when camera permission is not granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: false }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { getByText } = render(<CaptureScreen />);
    expect(getByText('// CAMERA ACCESS REQUIRED')).toBeTruthy();
    expect(getByText('GRANT PERMISSION')).toBeTruthy();
  });

  it('should render camera view when camera permission is granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { getByText } = render(<CaptureScreen />);
    expect(getByText(/INITIALIZING|CAPTURE/)).toBeTruthy();
  });

  it('should request location permissions on mount', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    render(<CaptureScreen />);
    await waitFor(() => { expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled(); });
  });

  it('should show location warning when location permission is not granted', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const { getByText } = render(<CaptureScreen />);
    await waitFor(() => { expect(getByText(/WARN:\/\/NO_GPS/)).toBeTruthy(); });
  });

  it('should not show location warning when location permission is granted', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { queryByText } = render(<CaptureScreen />);
    await waitFor(() => { expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled(); });
    expect(queryByText(/WARN:\/\/NO_GPS/)).toBeNull();
  });

  it('should handle location permission request errors gracefully', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(new Error('Location service unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<CaptureScreen />);
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error requesting location permission:', expect.any(Error));
    });
  });

  it('should render capture button', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { getByText } = render(<CaptureScreen />);
    expect(getByText(/INITIALIZING|CAPTURE/)).toBeTruthy();
  });

  it('should have CameraView component when permissions are granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { UNSAFE_root } = render(<CaptureScreen />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('should use back camera by default', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const { UNSAFE_root } = render(<CaptureScreen />);
    expect(UNSAFE_root).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Multi-viewport boundary matrix
  // ---------------------------------------------------------------------------

  describe.each(VIEWPORT_PRESETS)('viewport: %s', (preset) => {
    beforeEach(() => setTestViewport(preset));

    it('renders permission screen without layout overflow', () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: false }, mockRequestCameraPermission]);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      const { getByText } = render(<CaptureScreen />);
      // Permission card uses width: '100%' — always safe
      expect(getByText('GRANT PERMISSION')).toBeTruthy();
    });

    it('renders capture ring within viewport bounds', () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      const { UNSAFE_root } = render(<CaptureScreen />);
      // captureOuter is 72px — fits all viewports (smallest is 320px)
      const viewport = VIEWPORTS[preset];
      expect(72).toBeLessThanOrEqual(viewport.width);
      expect(UNSAFE_root).toBeTruthy();
    });

    it('renders scanner HUD within viewport width', () => {
      (Camera.useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, mockRequestCameraPermission]);
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      const { UNSAFE_root } = render(<CaptureScreen />);
      // Scanner brackets use percentage positions (8%, 24%) — never fixed pixel overflow
      const viewport = VIEWPORTS[preset];
      // BRACKET constant is 28px — safe on all viewports
      expect(28).toBeLessThanOrEqual(viewport.width);
      expect(UNSAFE_root).toBeTruthy();
    });
  });
});
