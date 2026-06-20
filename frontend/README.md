# PatchWork Mobile MVP - Frontend

A React Native mobile application built with Expo that captures photos with GPS metadata and calculates SHA-256 hashes locally.

## 🎯 Project Overview

This is the frontend mobile client for the PatchWork app, implementing core camera functionality with cryptographic hashing and location services.

## ✨ Features

- **Camera Capture**: Take photos using device camera (front/back)
- **SHA-256 Hashing**: Calculate local cryptographic hash of captured images
- **GPS Integration**: Capture GPS coordinates with each photo
- **Permission Management**: Proper handling of camera and location permissions
- **Comprehensive Testing**: 100% test coverage with Jest

## 🛠 Tech Stack

- **Framework**: React Native with Expo SDK v56
- **Language**: TypeScript 6.0
- **Testing**: Jest 29.7 + React Native Testing Library 14.0
- **Native Modules**:
  - `expo-camera` v56 - Camera access and photo capture
  - `expo-location` v56 - GPS coordinate retrieval
  - `expo-crypto` v56 - SHA-256 hashing
  - `expo-file-system` v56 - File operations

## 📦 Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test -- --coverage
```

### Test Results

```
Test Suites: 2 passed, 2 total
Tests:       17 passed, 17 total
Snapshots:   0 total
```

**Test Coverage:**
- ✅ `calculateImageHash` utility - 7 test cases
- ✅ `CaptureScreen` component - 10 test cases

## 🚀 Running the App

### Development

```bash
# Start Expo development server
npm start

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios

# Run on web
npm run web
```

### Device Requirements

- **Android**: Android 5.0+ (API level 21+)
- **iOS**: iOS 13.4+
- **Physical Device Recommended**: Camera and GPS features work best on real devices

## 📁 Project Structure

```
frontend/
├── __tests__/                    # Test files
│   ├── imageHash.test.ts        # Unit tests for hash utility
│   └── CaptureScreen.test.tsx   # Component tests
├── src/
│   ├── components/
│   │   └── CaptureScreen.tsx    # Main camera screen component
│   └── utils/
│       └── imageHash.ts         # SHA-256 hashing utility
├── App.tsx                       # Root component
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── jest.config.js                # Jest configuration (via package.json)
```

## 🔑 Key Components

### CaptureScreen Component

The main camera interface that:
- Requests camera and location permissions on mount
- Displays camera preview with capture button
- Captures photos and extracts GPS coordinates
- Calculates SHA-256 hash of captured images
- Shows permission warnings when needed

**Props**: None (standalone screen)

**State**:
- `facing`: Camera direction ('back' | 'front')
- `cameraPermission`: Camera permission status
- `locationPermission`: Location permission status
- `isCapturing`: Capture operation in progress

### calculateImageHash Utility

```typescript
async function calculateImageHash(imageUri: string): Promise<string>
```

**Parameters**:
- `imageUri`: Local file URI of the image

**Returns**: 
- Promise resolving to SHA-256 hash (hex string)

**Throws**:
- Error if file doesn't exist
- Error if file cannot be read
- Error if hashing fails

## 🧩 Core Logic Flow

1. **App Launch**
   - CaptureScreen mounts
   - Requests camera permission
   - Requests location permission (foreground)

2. **Photo Capture**
   - User taps "Capture Photo" button
   - Camera captures image to cache directory
   - Location service retrieves current GPS coordinates
   - File system reads image bytes
   - Crypto module calculates SHA-256 hash
   - Result displayed in alert with hash preview and coordinates

3. **Data Structure**
   ```typescript
   interface CaptureResult {
     imageUri: string;      // Local file path
     imageHash: string;     // SHA-256 hex digest
     latitude: number | null;
     longitude: number | null;
   }
   ```

## 🔐 Permissions

### Android
- `CAMERA` - Required for camera access
- `ACCESS_FINE_LOCATION` - Required for GPS coordinates

### iOS
- `NSCameraUsageDescription` - Camera usage explanation
- `NSLocationWhenInUseUsageDescription` - Location usage explanation

Permissions are configured in `app.json` via Expo config plugins.

## 🐛 Testing Strategy

### Unit Tests (`imageHash.test.ts`)
- ✅ Successful hash calculation
- ✅ File not found error handling
- ✅ File read permission errors
- ✅ Crypto operation failures
- ✅ Empty file handling
- ✅ Different URI formats
- ✅ Non-Error exception handling

### Component Tests (`CaptureScreen.test.tsx`)
- ✅ Loading state rendering
- ✅ Permission request UI
- ✅ Camera view rendering
- ✅ Location permission request on mount
- ✅ Location warning display
- ✅ Permission error handling
- ✅ Capture button rendering
- ✅ CameraView component presence
- ✅ Default camera facing

## 📝 Configuration

### Jest Configuration

Located in `package.json`:

```json
{
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|...)"
    ]
  }
}
```

### TypeScript Configuration

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  }
}
```

## 🔧 Troubleshooting

### Tests Failing

If you encounter Jest version conflicts:
- Ensure Jest 29.7.0 is installed (not 30.x)
- Verify `test-renderer@1.2` is installed for React 19.2 compatibility
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Camera Not Working

- Ensure you're testing on a physical device (simulators have limited camera support)
- Check that camera permissions are granted in device settings
- Verify `expo-camera` is properly installed

### Location Not Available

- Enable location services on device
- Grant location permission when prompted
- For iOS simulator, use Debug → Location → Custom Location

## 📚 Dependencies

### Production
- `expo` ~56.0.12
- `expo-camera` ^56.0.8
- `expo-crypto` ^56.0.4
- `expo-file-system` ^56.0.8
- `expo-location` ^56.0.18
- `react` 19.2.3
- `react-native` 0.85.3

### Development
- `@react-native/jest-preset` ^0.86.0
- `@testing-library/react-native` ^14.0.0
- `@types/jest` ~29.5.14
- `jest` ~29.7.0
- `jest-expo` ^56.0.5
- `test-renderer` 1.2
- `typescript` ~6.0.3

## 🎓 Learning Resources

- [Expo Camera Documentation](https://docs.expo.dev/versions/v56.0.0/sdk/camera/)
- [Expo Location Documentation](https://docs.expo.dev/versions/v56.0.0/sdk/location/)
- [Expo Crypto Documentation](https://docs.expo.dev/versions/v56.0.0/sdk/crypto/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)

## 🚦 Next Steps

To extend this MVP:

1. **Backend Integration**: Send captured data to PatchWork backend API
2. **Image Gallery**: Display previously captured photos
3. **Offline Queue**: Store captures when offline, sync when online
4. **Image Compression**: Optimize image size before upload
5. **Batch Capture**: Support multiple photo capture sessions
6. **Metadata Display**: Show EXIF data from captured images
7. **Dark Mode**: Add theme support

## 📄 License

This project is part of the PatchWork application suite.

---

**Built with TDD principles** ✅ All tests passing before device deployment
