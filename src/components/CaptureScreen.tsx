import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';

interface CaptureResult {
  imageUri: string;
  latitude: number | null;
  longitude: number | null;
  uploadUrl: string | null;
}

async function requestPresignedUrl(apiBase: string): Promise<{
  presigned_url: string;
  object_key: string;
  upload_id: string;
}> {
  console.log(`[S3_DIAG] requesting presigned URL from ${apiBase}/api/ports/request-upload`);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(`${apiBase}/api/ports/request-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  }).finally(() => clearTimeout(tid));

  console.log(`[S3_DIAG] presigned URL backend response: ${response.status} ${response.statusText}`);
  if (!response.ok) {
    const body = await response.text();
    console.error(`[S3_DIAG] presigned URL error body: ${body.slice(0, 500)}`);
    throw new Error(`Failed to get presigned URL: ${response.status} ${body}`);
  }

  const data = await response.json();
  console.log(`[S3_DIAG] presigned URL payload: upload_id=${data.upload_id} | object_key=${data.object_key} | method=${data.method} | required_headers=${JSON.stringify(data.required_headers)}`);
  return data;
}

async function uploadImageToS3(presignedUrl: string, imageUri: string, timeoutMs = 30000): Promise<void> {
  // ---------------------------------------------------------------------------
  // Diagnostic: determine image source type and inspect file on disk
  // ---------------------------------------------------------------------------
  const isFileUri = imageUri.startsWith('file://');
  const isBase64Uri = imageUri.startsWith('data:');
  console.log(`[S3_DIAG] imageUri type: ${isFileUri ? 'file://' : isBase64Uri ? 'data://' : 'memory/blob'} | length: ${imageUri.length}`);

  if (!isFileUri) {
    console.warn('[S3_DIAG] imageUri is not a file:// URI — streaming upload may not be possible');
  }

  let fileSize = 0;
  try {
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    const infoSize = (fileInfo as any).size;
    console.log(`[S3_DIAG] FileSystem.getInfoAsync: exists=${fileInfo.exists} | isDirectory=${fileInfo.isDirectory} | size=${infoSize ?? 'unknown'}`);
    if (fileInfo.exists && !fileInfo.isDirectory) {
      fileSize = infoSize ?? 0;
    }
  } catch (infoError) {
    console.warn('[S3_DIAG] FileSystem.getInfoAsync failed:', infoError);
  }

  if (fileSize === 0) {
    console.warn('[S3_DIAG] file size is 0 — camera may have written an empty file');
  }

  // ---------------------------------------------------------------------------
  // Diagnostic: verify presigned URL is active (check Amz-Expires / X-Amz-Date)
  // ---------------------------------------------------------------------------
  const urlObj = new URL(presignedUrl);
  const amzDate = urlObj.searchParams.get('X-Amz-Date');
  const amzExpires = urlObj.searchParams.get('X-Amz-Expires');
  const signature = urlObj.searchParams.get('X-Amz-Signature');
  console.log(`[S3_DIAG] presigned url host: ${urlObj.host}`);
  console.log(`[S3_DIAG] presigned X-Amz-Date: ${amzDate ?? 'missing'} | X-Amz-Expires: ${amzExpires ?? 'missing'} | signature present: ${!!signature}`);
  if (amzDate && amzExpires) {
    const issueDate = new Date(
      `${amzDate.slice(0,4)}-${amzDate.slice(4,6)}-${amzDate.slice(6,8)}T${amzDate.slice(9,11)}:${amzDate.slice(11,13)}:${amzDate.slice(13,15)}Z`
    );
    const expiry = new Date(issueDate.getTime() + parseInt(amzExpires, 10) * 1000);
    console.log(`[S3_DIAG] presigned URL expires at: ${expiry.toISOString()} | now: ${new Date().toISOString()}`);
  }

  // ---------------------------------------------------------------------------
  // Diagnostic: raw network request logging for S3 PUT
  // Uses expo-file-system uploadAsync to stream from disk (no in-memory blob).
  // ---------------------------------------------------------------------------
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'image/jpeg',
  };
  console.log(`[S3_DIAG] S3 PUT request | url: ${presignedUrl.slice(0, 120)}... | timeout: ${timeoutMs}ms | headers: ${JSON.stringify(requestHeaders)} | fileSize: ${fileSize} bytes | uploadType: BINARY_CONTENT`);

  let uploadResult: any;
  try {
    // Use AbortController so a timeout actually *cancels* the PUT request rather
    // than just racing past it. Promise.race leaves uploadAsync running in the
    // background which can cause overlapping uploads on retry.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      uploadResult = await (FileSystem as any).uploadAsync(presignedUrl, imageUri, {
        httpMethod: 'PUT',
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT ?? 0,
        headers: requestHeaders,
        // expo-file-system v17+ respects cancelToken via task ref; signal is the
        // standard Web API equivalent passed for forward-compatibility.
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (uploadError) {
    const err = uploadError as Error;
    console.error(`[S3_DIAG] uploadAsync threw: name=${err.name} | message=${err.message}`);
    if (err.message?.toLowerCase().includes('timeout')) {
      throw new Error(`Upload timed out after ${timeoutMs}ms — check network connection`);
    }
    if (err.message?.includes('Network request failed')) {
      throw new Error('Network request failed — device cannot reach S3 endpoint');
    }
    throw new Error(`S3 upload network error: ${err.message}`);
  }

  console.log(`[S3_DIAG] S3 PUT response | status: ${uploadResult.status}`);
  console.log(`[S3_DIAG] S3 PUT response headers: ${JSON.stringify(uploadResult.headers)}`);
  if (uploadResult.body) {
    console.log(`[S3_DIAG] S3 PUT response body: ${uploadResult.body.slice(0, 500)}`);
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`S3 upload failed: ${uploadResult.status} ${uploadResult.body?.slice(0, 120) ?? ''}`);
  }

  console.log('[S3_DIAG] S3 upload completed successfully');
}

// ---------------------------------------------------------------------------
// uploadWithRetry
// Wraps uploadImageToS3 with exponential backoff retry logic.
// Retries on network / timeout errors only; HTTP-level errors surface immediately.
// ---------------------------------------------------------------------------
async function uploadWithRetry(
  presignedUrl: string,
  imageUri: string,
  maxAttempts = 3,
  onAttempt?: (attempt: number) => void
): Promise<void> {
  const DELAYS_MS = [2000, 5000, 10000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onAttempt?.(attempt);
    console.log(`[S3_DIAG] uploadWithRetry attempt ${attempt}/${maxAttempts}`);
    try {
      await uploadImageToS3(presignedUrl, imageUri);
      return; // success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.toLowerCase().includes('timeout') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('aborterror') ||
        (err instanceof Error && err.name === 'AbortError');

      if (!isRetryable || attempt === maxAttempts) {
        console.error(`[S3_DIAG] uploadWithRetry failed permanently after ${attempt} attempt(s): ${msg}`);
        throw err;
      }

      const delay = DELAYS_MS[attempt - 1] ?? 10000;
      console.warn(`[S3_DIAG] uploadWithRetry attempt ${attempt} failed (${msg}), retrying in ${delay}ms...`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

type CapturePhase = 'idle' | 'capturing' | 'locating' | 'uploading';

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const { apiBase, hapticsEnabled, cameraQuality } = useSettingsStore();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploadElapsed, setUploadElapsed] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const pendingPhotoRef = useRef<{ uri: string; latitude: number | null; longitude: number | null } | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startUploadTimer = () => {
    setUploadElapsed(0);
    uploadTimerRef.current = setInterval(() => setUploadElapsed(s => s + 1), 1000);
  };
  const stopUploadTimer = () => {
    if (uploadTimerRef.current) { clearInterval(uploadTimerRef.current); uploadTimerRef.current = null; }
    setUploadElapsed(0);
  };

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (hapticsEnabled) Haptics.impactAsync(style);
  };

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

  const handleUpload = async (uri: string, latitude: number | null, longitude: number | null) => {
    console.log(`[S3_DIAG] handleUpload start | uri: ${uri.slice(0, 60)}... | lat: ${latitude} | lng: ${longitude}`);
    setPhase('uploading');
    setNetworkError(null);
    setPreviewUri(uri);
    startUploadTimer();
    let presigned_url: string;
    try {
      ({ presigned_url } = await requestPresignedUrl(apiBase));
    } catch (netError) {
      const msg = netError instanceof Error ? netError.message : 'Network unavailable';
      console.error(`[S3_DIAG] handleUpload presigned URL failed: ${msg}`);
      stopUploadTimer();
      setNetworkError(msg);
      setPhase('idle');
      return;
    }
    try {
      await uploadWithRetry(presigned_url, uri, 3, (attempt) => {
        setPhase('uploading');
        // attempt count surfaced via uploadElapsed label below
        console.log(`[S3_DIAG] upload attempt ${attempt}/3`);
      });
    } catch (uploadError) {
      const msg = uploadError instanceof Error
        ? (uploadError.name === 'AbortError' ? 'Upload timed out — check connection' : uploadError.message)
        : 'Upload failed';
      console.error(`[S3_DIAG] handleUpload S3 upload failed: ${msg}`);
      stopUploadTimer();
      setNetworkError(msg);
      setPhase('idle');
      return;
    }
    stopUploadTimer();
    pendingPhotoRef.current = null;
    setPreviewUri(null);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Capture Successful',
      `Uploaded!\nLocation: ${latitude ? `${latitude.toFixed(6)}, ${longitude?.toFixed(6)}` : 'Not available'}`
    );
    setPhase('idle');
    console.log('[S3_DIAG] handleUpload completed successfully');
  };

  const handleRetry = () => {
    const pending = pendingPhotoRef.current;
    if (!pending) return;
    console.log(`[S3_DIAG] retry triggered for uri: ${pending.uri.slice(0, 60)}...`);
    setNetworkError(null);
    handleUpload(pending.uri, pending.latitude, pending.longitude);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !isCameraReady) {
      Alert.alert('Error', 'Camera is still initializing — please wait a moment.');
      return;
    }

    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('capturing');
    pendingPhotoRef.current = null;
    console.log(`[S3_DIAG] camera capture starting | quality: ${cameraQuality} | timeout: 10000ms`);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Camera timeout — try again')), 10000)
      );
      const photo = await Promise.race([
        cameraRef.current.takePictureAsync({ quality: cameraQuality, base64: false, exif: false }),
        timeout,
      ]);

      if (!photo || !photo.uri) throw new Error('Failed to capture photo');
      console.log(`[S3_DIAG] camera captured photo | uri: ${photo.uri.slice(0, 60)}... | width: ${photo.width ?? 'unknown'} | height: ${photo.height ?? 'unknown'}`);

      setPreviewUri(photo.uri);
      setPhase('locating');
      let latitude: number | null = null;
      let longitude: number | null = null;

      if (locationPermission?.status === 'granted') {
        try {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        } catch (locationError) {
          console.warn('Failed to get location:', locationError);
        }
      }

      pendingPhotoRef.current = { uri: photo.uri, latitude, longitude };
      await handleUpload(photo.uri, latitude, longitude);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Capture error:', msg);
      Alert.alert('Capture Failed', msg);
      setPreviewUri(null);
      setPhase('idle');
    }
  };

  if (!cameraPermission) {
    return (
      <View style={styles.permContainer}>
        <Text style={styles.termText}>// INITIALIZING SENSOR...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permContainer}>
        <View testID="perm-card" style={styles.permCard}>
          <Text style={styles.permLabel}>// CAMERA ACCESS REQUIRED</Text>
          <Text style={styles.permSub}>This module requires hardware sensor access to function.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestCameraPermission} activeOpacity={0.75}>
            <Text style={styles.primaryBtnText}>GRANT PERMISSION</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={facing}
        ref={cameraRef}
        onCameraReady={() => setIsCameraReady(true)}
      >
        {/* Scanner corner brackets */}
        <View style={styles.bracketTL} />
        <View style={styles.bracketTR} />
        <View style={styles.bracketBL} />
        <View style={styles.bracketBR} />

        {/* Network error terminal banner */}
        {networkError && (
          <View style={[styles.terminalErrBanner, { top: insets.top }]}>
            <Text style={styles.termErrLabel}>ERR://NETWORK  </Text>
            <Text style={styles.termErrMsg} numberOfLines={1}>{networkError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={handleRetry}
              disabled={phase !== 'idle'}
              activeOpacity={0.75}
            >
              <Text style={styles.retryBtnText}>[ RETRY ]</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* GPS warning terminal banner */}
        {locationPermission?.status !== 'granted' && (
          <View style={[styles.terminalWarnBanner, { top: insets.top + 44 }]}>
            <Text style={styles.termWarnText}>WARN://NO_GPS — coordinates will be null on capture</Text>
          </View>
        )}

        {/* Ring-style capture trigger */}
        <View style={styles.captureRow}>
          <TouchableOpacity
            testID="capture-outer"
            style={[styles.captureOuter, (!isCameraReady || phase !== 'idle') && styles.captureOuterDisabled]}
            onPress={handleCapture}
            disabled={!isCameraReady || phase !== 'idle'}
            activeOpacity={0.8}
          >
            <View style={[styles.captureInner, (!isCameraReady || phase !== 'idle') && styles.captureInnerDisabled]} />
          </TouchableOpacity>
          <Text style={[styles.captureLabel, (!isCameraReady || phase !== 'idle') && styles.captureLabelDisabled]}>
            {!isCameraReady ? 'INITIALIZING...' : phase === 'capturing' ? 'CAPTURING...' : phase === 'locating' ? 'LOCATING...' : phase === 'uploading' ? `UPLOADING... (${uploadElapsed}s)` : 'CAPTURE'}
          </Text>
        </View>
      </CameraView>

      {/* Captured photo preview overlay during processing */}
      {previewUri && (
        <View style={styles.previewOverlay}>
          <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>
              {phase === 'locating' ? 'ACQUIRING GPS...' : `UPLOADING... (${uploadElapsed}s)`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const BRACKET = 28;
const THICK = 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },
  camera: { flex: 1 },

  // Corner scanner brackets
  bracketTL: {
    position: 'absolute', top: '18%', left: '8%',
    width: BRACKET, height: BRACKET,
    borderTopWidth: THICK, borderLeftWidth: THICK, borderColor: '#00FFFF',
  },
  bracketTR: {
    position: 'absolute', top: '18%', right: '8%',
    width: BRACKET, height: BRACKET,
    borderTopWidth: THICK, borderRightWidth: THICK, borderColor: '#00FFFF',
  },
  bracketBL: {
    position: 'absolute', bottom: '24%', left: '8%',
    width: BRACKET, height: BRACKET,
    borderBottomWidth: THICK, borderLeftWidth: THICK, borderColor: '#00FFFF',
  },
  bracketBR: {
    position: 'absolute', bottom: '24%', right: '8%',
    width: BRACKET, height: BRACKET,
    borderBottomWidth: THICK, borderRightWidth: THICK, borderColor: '#00FFFF',
  },

  // Terminal error banner
  terminalErrBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(10, 17, 40, 0.94)',
    borderBottomWidth: 1, borderBottomColor: '#FF5555',
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12, gap: 6,
  },
  termErrLabel: { fontFamily: 'monospace', fontSize: 10, color: '#FF5555', fontWeight: '700' },
  termErrMsg: { fontFamily: 'monospace', fontSize: 10, color: '#888', flex: 1 },
  retryBtn: { borderWidth: 1, borderColor: '#00FFFF', paddingHorizontal: 8, paddingVertical: 3 },
  retryBtnText: { fontFamily: 'monospace', fontSize: 10, color: '#00FFFF' },

  // Terminal GPS warning banner
  terminalWarnBanner: {
    position: 'absolute', top: 40, left: 0, right: 0, zIndex: 9,
    backgroundColor: 'rgba(10, 17, 40, 0.9)',
    borderBottomWidth: 1, borderBottomColor: '#6495ED',
    paddingVertical: 6, paddingHorizontal: 12,
  },
  termWarnText: { fontFamily: 'monospace', fontSize: 9, color: '#6495ED' },

  // Ring capture button
  captureRow: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    alignItems: 'center', gap: 10,
  },
  captureOuter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: '#00FFFF',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10, 17, 40, 0.55)',
  },
  captureOuterDisabled: { borderColor: '#444e6a', backgroundColor: 'rgba(10, 17, 40, 0.55)' },
  captureInner: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: '#00FFFF',
    backgroundColor: 'transparent',
  },
  captureInnerDisabled: { borderColor: '#444e6a' },
  captureLabel: { fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 2 },
  captureLabelDisabled: { color: '#444e6a' },

  previewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A1128',
  },
  previewImage: { flex: 1 },
  previewBadge: {
    position: 'absolute', bottom: 52, alignSelf: 'center',
    backgroundColor: 'rgba(10, 17, 40, 0.88)',
    borderWidth: 1, borderColor: '#00FFFF',
    paddingHorizontal: 18, paddingVertical: 8,
  },
  previewBadgeText: {
    fontFamily: 'monospace', fontSize: 11, color: '#00FFFF', letterSpacing: 1.5,
  },

  // Permission screens
  permContainer: {
    flex: 1, backgroundColor: '#0A1128',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  permCard: {
    borderWidth: 1, borderColor: '#6495ED',
    padding: 24, width: '100%', gap: 14, alignItems: 'center',
  },
  permLabel: { fontFamily: 'monospace', fontSize: 12, color: '#6495ED', letterSpacing: 1 },
  permSub: { fontSize: 12, color: '#6495ED', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#00FFFF',
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: 4, marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: 'monospace', fontSize: 12, color: '#0A1128', fontWeight: '700', letterSpacing: 1,
  },
  termText: { fontFamily: 'monospace', fontSize: 12, color: '#6495ED' },
});
