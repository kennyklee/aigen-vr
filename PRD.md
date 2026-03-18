# Aigen VR Viewer — Core Product Requirements

## Overview
WebXR application for viewing live H.264 camera feeds from Aigen agricultural robots on Meta Quest 3. Used for investor demos and field presentations.

---

## Core Interactions

### 1. Panel Grab (Trigger — Hold-to-Release)
- **Trigger press** on a panel grab handle → grabs the panel
- **Trigger release** → releases the panel
- This is NOT toggle-based. The user must hold the trigger to keep grabbing.
- While grabbing, the panel follows the controller ray at the grab distance.
- Both trigger (select) and grip (squeeze) can grab/release panels using the same grab logic.

### 2. Thumbstick Control While Grabbing
- While a panel is grabbed (trigger or grip held), the **same-hand thumbstick** controls the panel:
  - **Thumbstick Y (up/down)**: Push panel farther away or pull closer (0.3m–5.0m range)
  - **Thumbstick X (left/right)**: Rotate panel yaw around its position
- Deadzone: 0.15 on both axes
- Input source matched by **handedness** (not controller index)

### 3. Robot Driving (Right Thumbstick)
- **Only active when no panels are grabbed** (`grabStates.size === 0`)
- **Only active when robot model is visible**
- Right thumbstick Y: Move robot forward/backward along its heading
- Right thumbstick X: Rotate robot left/right
- Input source found by `handedness === 'right'` (not index)
- Deadzone: 0.15

### 4. VR Button Interaction (Trigger)
- Trigger press raycasts against VR buttons **before** attempting grab
- If a VR button is hit, its action fires and no grab occurs
- VR buttons take priority over grab handles

### 5. Scene Recenter (Button B)
- **Button B only** (gamepad.buttons[5]) — Button A does NOT recenter
- Rotates `scenePivot` so the front nav camera and Aigen logo face the headset's current forward direction
- Heading calculation: `atan2(forward.x, forward.z) + Math.PI`
- Single-fire: held state tracked to prevent repeated triggers

### 6. Reset (VR Panel Button)
- Resets `scenePivot.rotation.y` to 0
- Resets all camera panels to their default layout positions and rotations
- Resets VR control panel position
- Resets robot position and rotation to initial values
- Resets crop camera size to small (if enlarged)
- Restores camera visibility (if hidden)

### 7. AR/VR Session Switching
- **From webpage**: Separate "Start Virtual Reality (VR)" and "Start Augmented Reality (AR)" buttons
- **From VR control panel**: Toggle button switches between modes
- Implementation: Sets `pendingXRMode`, ends current session, `sessionend` handler starts new session after 500ms delay
- Retry logic: Up to 3 attempts with 300ms between retries
- **AR mode**: Sky sphere hidden, clear color transparent, camera panels hidden, robot visible
- **VR mode**: Sky sphere visible, clear color opaque, environment loaded

### 8. Grabbed Panel Positioning with scenePivot
- All content lives inside `scenePivot` group (not directly on `scene`)
- Controllers and lights are on `scene` root (not in pivot)
- When positioning grabbed panels: controller world position → `scenePivot.worldToLocal()` → set group position
- Camera direction for face-the-viewer also converted to scenePivot local space

---

## Robot Model
- Uniformly scaled to 47" height (proportional — width and length maintain ratio)
- Scale factor derived from smallest bounding box dimension mapped to `47 * 0.0254` meters
- DRACO-compressed GLTF loaded with DRACOLoader

## Audio
- Ambient nature sound (`vr-nature-sound.mp3`) plays on XR session start
- Spatial audio attached to scene

## Environment
- Equirectangular sky sphere with multiple selectable environments
- Cycled via VR control panel button
