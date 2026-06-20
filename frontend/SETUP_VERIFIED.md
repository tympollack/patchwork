# ✅ Setup Verification Complete

## What Was Fixed

1. **Entry Point Issue**
   - Changed `package.json` main from `"index.ts"` → `"index.js"`
   - Renamed `index.ts` → `index.js`
   - Added explicit `expo.entryPoint` in package.json

2. **Cache Clearing**
   - ✅ Removed `.expo` directory
   - ✅ Removed `node_modules/.cache`
   - ✅ Removed Metro bundler temp files
   - ✅ Deleted and reinstalled `node_modules`
   - ✅ Deleted and regenerated `package-lock.json`

3. **Permissions Configuration**
   - ✅ Added camera permissions to `app.json`
   - ✅ Added location permissions to `app.json`
   - ✅ Configured Android permissions array

## Current File Structure

```
frontend/
├── index.js                 ✅ (Entry point - renamed from .ts)
├── App.tsx                  ✅ (Main app component)
├── package.json             ✅ (main: "index.js" + expo.entryPoint)
├── app.json                 ✅ (Permissions configured)
├── src/
│   ├── components/
│   │   └── CaptureScreen.tsx  ✅
│   └── utils/
│       └── imageHash.ts       ✅
└── __tests__/               ✅ (All tests passing)
```

## How to Use

### On Your Android Phone:

1. **Open Expo Go app** on your Android device
2. **Scan the QR code** shown in your terminal/console
3. **Wait for the app to load** (first load takes ~30 seconds)
4. **Grant permissions** when prompted:
   - Camera permission
   - Location permission

### Expected Behavior:

- App opens with camera view
- "Capture Photo" button at bottom
- If location permission denied, orange warning banner appears
- Tap "Capture Photo" to take a picture
- Alert shows SHA-256 hash and GPS coordinates

## Troubleshooting

### If you still see "Cannot resolve entry file":

1. **Check the terminal output** - Look for the exact error message
2. **Verify index.js exists**:
   ```bash
   cd frontend
   dir index.js
   ```
3. **Restart Expo completely**:
   ```bash
   # Kill all node processes
   taskkill /F /IM node.exe
   
   # Start fresh
   npx expo start --clear
   ```

### If app loads but camera doesn't work:

- Make sure you're on a **physical device** (not emulator)
- Check device Settings → Apps → Expo Go → Permissions
- Grant Camera and Location permissions manually

### If QR code doesn't scan:

- Make sure phone and computer are on **same WiFi network**
- Try using the **tunnel** option: `npx expo start --tunnel`
- Or manually enter the URL shown in terminal into Expo Go

## Server Status

The Expo dev server should now be running on:
- **Local**: http://localhost:8081
- **LAN**: exp://[your-ip]:8081

Look for the QR code in your terminal and scan it with Expo Go!
