import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useState, useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, View, Alert } from 'react-native';
import { calculateImageHash } from '../utils/imageHash';

interface CaptureResult {
  imageUri: string;
  imageHash: string;
  latitude: number | null;
  longitude: number | null;
}

export default function CaptureScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission({ status } as Location.LocationPermissionResponse);
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
        exif: false,
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo');
      }

      let latitude: number | null = null;
      let longitude: number | null = null;

      if (locationPermission?.status === 'granted') {
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        } catch (locationError) {
          console.warn('Failed to get location:', locationError);
        }
      }

      const imageHash = await calculateImageHash(photo.uri);

      const result: CaptureResult = {
        imageUri: photo.uri,
        imageHash,
        latitude,
        longitude,
      };

      Alert.alert(
        'Capture Successful',
        `Hash: ${imageHash.substring(0, 16)}...\nLocation: ${latitude ? `${latitude.toFixed(6)}, ${longitude?.toFixed(6)}` : 'Not available'}`
      );

      console.log('Capture result:', result);
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to capture photo');
    } finally {
      setIsCapturing(false);
    }
  };

  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <Text>Loading camera permissions...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to use the camera</Text>
        <Button onPress={requestCameraPermission} title="Grant Camera Permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <View style={styles.button}>
            <Button
              title={isCapturing ? 'Capturing...' : 'Capture Photo'}
              onPress={handleCapture}
              disabled={isCapturing}
            />
          </View>
        </View>
      </CameraView>
      {locationPermission?.status !== 'granted' && (
        <View style={styles.locationWarning}>
          <Text style={styles.warningText}>
            Location permission not granted. Photos will not include GPS data.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: '#fff',
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    width: '100%',
    paddingHorizontal: 64,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    padding: 10,
  },
  locationWarning: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 165, 0, 0.8)',
    padding: 10,
    borderRadius: 8,
  },
  warningText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 12,
  },
});
