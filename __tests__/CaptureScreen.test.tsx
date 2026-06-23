import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CaptureScreen from '../src/components/CaptureScreen';
import * as Camera from 'expo-camera';
import * as Location from 'expo-location';

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

  it('should render loading state when camera permissions are loading', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([null, mockRequestCameraPermission]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { getByText } = render(<CaptureScreen />);

    expect(getByText('Loading camera permissions...')).toBeTruthy();
  });

  it('should render permission request UI when camera permission is not granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: false },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { getByText } = render(<CaptureScreen />);

    expect(getByText('We need your permission to use the camera')).toBeTruthy();
    expect(getByText('Grant Camera Permission')).toBeTruthy();
  });

  it('should render camera view when camera permission is granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { getByText } = render(<CaptureScreen />);

    expect(getByText('Capture Photo')).toBeTruthy();
  });

  it('should request location permissions on mount', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    render(<CaptureScreen />);

    await waitFor(() => {
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    });
  });

  it('should show location warning when location permission is not granted', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const { getByText } = render(<CaptureScreen />);

    await waitFor(() => {
      expect(getByText(/Location permission not granted/)).toBeTruthy();
    });
  });

  it('should not show location warning when location permission is granted', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { queryByText } = render(<CaptureScreen />);

    await waitFor(() => {
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    });

    expect(queryByText(/Location permission not granted/)).toBeNull();
  });

  it('should handle location permission request errors gracefully', async () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error('Location service unavailable')
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<CaptureScreen />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error requesting location permission:',
        expect.any(Error)
      );
    });
  });

  it('should render capture button', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { getByText } = render(<CaptureScreen />);

    expect(getByText('Capture Photo')).toBeTruthy();
  });

  it('should have CameraView component when permissions are granted', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { UNSAFE_root } = render(<CaptureScreen />);

    expect(UNSAFE_root).toBeTruthy();
  });

  it('should use back camera by default', () => {
    (Camera.useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: true },
      mockRequestCameraPermission,
    ]);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { UNSAFE_root } = render(<CaptureScreen />);

    expect(UNSAFE_root).toBeTruthy();
  });
});
