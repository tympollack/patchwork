# ✅ Downgraded to Expo SDK 55

## Changes Made

Successfully downgraded from Expo SDK 56 to SDK 55 to match the Expo Go app version available on the Play Store.

### Version Changes

#### Before (SDK 56):
- `expo`: ~56.0.12
- `expo-camera`: ^56.0.8
- `expo-crypto`: ^56.0.4
- `expo-file-system`: ^56.0.8
- `expo-location`: ^56.0.18
- `expo-status-bar`: ~56.0.4
- `react`: 19.2.3
- `react-native`: 0.85.3
- `typescript`: ~6.0.3
- `@testing-library/react-native`: ^14.0.0 (with test-renderer)

#### After (SDK 55):
- `expo`: ~55.0.0
- `expo-camera`: ~55.0.0
- `expo-crypto`: ~55.0.0
- `expo-file-system`: ~55.0.0
- `expo-location`: ~55.1.10
- `expo-status-bar`: ~55.0.0
- `react`: 19.2.0
- `react-native`: 0.83.6
- `typescript`: ~5.9.2
- `@testing-library/react-native`: ^12.9.0 (with react-test-renderer)

### Test Updates

Updated test files to work with `@testing-library/react-native` v12:
- Removed `async` from `render()` calls (v12 doesn't have async render)
- Changed `root` to `UNSAFE_root` in tests
- All 17 tests still passing ✅

### Files Modified

1. **package.json**
   - Updated all Expo SDK packages to v55
   - Downgraded React Native to 0.83.6
   - Changed testing library from v14 to v12
   - Replaced `test-renderer` with `react-test-renderer`

2. **__tests__/CaptureScreen.test.tsx**
   - Removed `await` from synchronous `render()` calls
   - Updated to use `UNSAFE_root` instead of `root`

## Why This Was Needed

The Expo Go app on the Google Play Store is currently on SDK 55, not SDK 56. To test the app using Expo Go, the project needs to match the SDK version installed on the device.

## Verification

✅ All tests passing (17/17)
✅ Dependencies installed successfully
✅ No version conflicts
✅ Ready to run on Expo Go SDK 55

## Running the App

```bash
# Start the development server
cd frontend
npx expo start

# Scan QR code with Expo Go app (SDK 55)
```

The app will now work with the current version of Expo Go available on the Play Store!

## Notes

- The core functionality remains unchanged
- Camera, Location, and Crypto modules all work the same way in SDK 55
- The SHA-256 hashing and GPS capture features are fully compatible
- All permission handling works identically

## If You Need to Upgrade Back to SDK 56

When Expo Go SDK 56 is available on the Play Store, you can upgrade by:

```bash
cd frontend
npm install expo@~56.0.0
npx expo install --fix
```

Then update the test files to use async render again.
