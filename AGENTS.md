# Expo HAS CHANGED

**Role:** You are an Expert React Native Developer and UI/UX Architect. 
**Project:** "PatchWork Pro" - A mobile civic infrastructure mapping application for professional community verifiers. 
**Tech Stack:** React Native, React Native Maps, WatermelonDB (for offline-first data storage), and Zustand (for state management). 

**Design System & Aesthetic ("Tech-Blueprint"):**
The UI must NOT look like a standard consumer app or use basic Material Design. It must feel like a rigorous, high-tech architectural drafting tool.
* **Canvas/Background:** Deep Navy (`#0A1128` or similar).
* **Scaffolding/UI Elements:** Cornflower Blue (`#6495ED`) for thin, crisp borders, gridlines, dividers, and secondary text. 
* **Action/Highlight:** Bright Cyan (`#00FFFF`) for active map nodes, primary action buttons, and live telemetry data.
* **Typography:** Strict dual-font system. Use a clean Sans-Serif (e.g., Inter, SF Pro) for all UI navigation, instructions, and buttons. Use a strict Monospaced font (e.g., Roboto Mono, Courier) for all raw data, including GPS coordinates, timestamps, and database IDs. 

**Core UI Requirements:**

**1. The Map View (Default Launch Screen)**
* Implement a full-screen map using `react-native-maps` styled with a dark, high-contrast, text-minimal custom map style. 
* Remove the camera-first launch entirely. The map is the primary interface.
* Render existing "Ghost Nodes" (unverified reports) as hollow cyan geometric shapes on the map.

**2. The Reporting Mechanics (Zero-Friction & Manual)**
Floating over the map, build a primary action cluster with two distinct reporting methods:
* **One-Tap Capture (Quick Report):** A prominent, instant-action button. When pressed, immediately grab the device's current GPS coordinates, flash a cyan "Coordinates Recorded!" UI toast, and write the payload to WatermelonDB with a `sync_status: pending` flag. 
* **Manual Pin Drop (Remote Report):** A secondary button that locks a crosshair to the center of the screen, allowing the user to pan the map to a specific location. Include a clean UI warning/disclaimer: *"Note: Inaccurate remote reporting negatively impacts your Verifier Trust Score if denied by community surveyors."* Include a "Confirm Pin" button to log the coordinates.

**3. The User Dashboard / Notifications Screen**
* Create a sleek, slide-up bottom sheet or a separate navigation tab for the User Ledger.
* Display a list of recent reports pulled directly from the WatermelonDB local store. 
* Visually distinguish between reports that are: 
    * `Pending Network Sync` (dimmed or grayed out).
    * `Awaiting Verification` (hollow cyan).
    * `Denied/Flagged` (strikethrough or muted red, indicating a hit to their trust score).

**Execution Steps:**
1. Scaffold the React Native application and initialize the WatermelonDB schema (create a `nodes` table with `lat`, `long`, `timestamp`, `status`, and `sync_status` columns).
2. Configure the React Native Maps implementation with a dark custom JSON style.
3. Build the UI components utilizing the exact color hex codes and typography rules provided. 
4. Implement the Zustand store for UI toggles and the WatermelonDB logic for saving the One-Tap Capture and Manual Pin Drop coordinates. 
5. Output clean, modular, and extensively commented code.