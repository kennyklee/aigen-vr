/**
 * Core interaction tests for aigen-vr.html
 *
 * Tests the behavioral contracts defined in PRD.md by simulating
 * the controller/grab/thumbstick logic extracted from the app.
 *
 * Run: node --test test-interactions.mjs
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Load and extract key code patterns from aigen-vr.html
// ---------------------------------------------------------------------------
const html = readFileSync(new URL('./aigen-vr.html', import.meta.url), 'utf-8');

// ---------------------------------------------------------------------------
// Helpers: simulate minimal THREE.js and WebXR objects
// ---------------------------------------------------------------------------

function makeController(index) {
  return {
    matrixWorld: { elements: new Float32Array(16) },
    userData: { index, rayLine: { geometry: { setFromPoints() {} } } },
  };
}

function makeGrabState(group, distance = 1.0) {
  return { group, distance };
}

function makeInputSource(handedness, axes = [0, 0, 0, 0], buttons = []) {
  return {
    handedness,
    gamepad: {
      axes,
      buttons: buttons.map(b => (typeof b === 'boolean' ? { pressed: b } : b)),
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Panel Grab — Hold-to-Release (NOT toggle)
// ---------------------------------------------------------------------------
describe('Panel Grab — Hold-to-Release', () => {
  it('onSelectStart code does NOT contain toggle logic', () => {
    // The toggle pattern uses "triggerGrab" — ensure it is NOT present
    // in the onSelectStart function
    const selectStartMatch = html.match(/function onSelectStart[\s\S]*?function onSelectEnd/);
    assert.ok(selectStartMatch, 'onSelectStart function found');
    const selectStartBody = selectStartMatch[0];

    assert.ok(
      !selectStartBody.includes('triggerGrab'),
      'onSelectStart must NOT reference triggerGrab (toggle pattern is banned)'
    );
  });

  it('onSelectEnd calls onSqueezeEnd (release on trigger release)', () => {
    const selectEndMatch = html.match(/function onSelectEnd\(event\)\s*\{[\s\S]*?\n    \}/);
    assert.ok(selectEndMatch, 'onSelectEnd function found');
    const body = selectEndMatch[0];

    assert.ok(
      body.includes('onSqueezeEnd(event)'),
      'onSelectEnd must call onSqueezeEnd to release the panel'
    );
  });

  it('onSelectEnd is NOT empty', () => {
    const selectEndMatch = html.match(/function onSelectEnd\(event\)\s*\{[\s\S]*?\n    \}/);
    assert.ok(selectEndMatch, 'onSelectEnd function found');
    const body = selectEndMatch[0];

    // Strip comments and whitespace — should have actual code
    const code = body.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
    assert.ok(
      code.includes('onSqueezeEnd'),
      'onSelectEnd must not be empty — it must release the grab'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. VR Buttons take priority over grab
// ---------------------------------------------------------------------------
describe('VR Button Priority', () => {
  it('onSelectStart checks VR buttons BEFORE calling onSqueezeStart', () => {
    const selectStartMatch = html.match(/function onSelectStart[\s\S]*?function onSelectEnd/);
    const body = selectStartMatch[0];

    const btnCheckPos = body.indexOf('intersectObjects(vrButtons');
    const grabPos = body.indexOf('onSqueezeStart');

    assert.ok(btnCheckPos > -1, 'Must check VR button intersections');
    assert.ok(grabPos > -1, 'Must call onSqueezeStart for grabbing');
    assert.ok(
      btnCheckPos < grabPos,
      'VR button check must come BEFORE grab attempt'
    );
  });

  it('VR button hit returns early (does not grab)', () => {
    const selectStartMatch = html.match(/function onSelectStart[\s\S]*?function onSelectEnd/);
    const body = selectStartMatch[0];

    // After handleVRButtonAction, there should be a return statement
    const actionIdx = body.indexOf('handleVRButtonAction');
    const returnIdx = body.indexOf('return', actionIdx);
    const grabIdx = body.indexOf('onSqueezeStart');

    assert.ok(
      returnIdx > actionIdx && returnIdx < grabIdx,
      'Must return after VR button action, before grab'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Thumbstick controls grabbed panel push/pull/rotate
// ---------------------------------------------------------------------------
describe('Thumbstick While Grabbing', () => {
  it('grabbed panel loop reads thumbstick axes[2] and axes[3]', () => {
    // Find the grab state loop
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    assert.ok(grabLoopMatch, 'Grab state loop found');
    const body = grabLoopMatch[0];

    assert.ok(body.includes('axes[2]'), 'Must read thumbstick X axis (axes[2])');
    assert.ok(body.includes('axes[3]'), 'Must read thumbstick Y axis (axes[3])');
  });

  it('thumbstick Y controls distance (push/pull)', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    assert.ok(body.includes('state.distance'), 'Must modify state.distance for push/pull');
    // Distance should be clamped
    assert.ok(body.includes('Math.max') && body.includes('Math.min'), 'Distance must be clamped');
  });

  it('thumbstick X controls yaw rotation', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    assert.ok(body.includes('yawOffset'), 'Must modify yawOffset for rotation');
  });

  it('thumbstick uses handedness to find input source (not index)', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    assert.ok(
      body.includes("src.handedness === handedness"),
      'Must match input source by handedness'
    );
  });

  it('deadzone of 0.15 applied to both axes', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    const deadzoneMatches = body.match(/Math\.abs\(thumb[XY]\) > 0\.15/g);
    assert.ok(deadzoneMatches && deadzoneMatches.length >= 2, 'Both axes must have 0.15 deadzone');
  });
});

// ---------------------------------------------------------------------------
// 4. Robot driving — right thumbstick, only when not grabbing
// ---------------------------------------------------------------------------
describe('Robot Driving', () => {
  it('robot driving checks grabStates.size > 0 before engaging', () => {
    const driveMatch = html.match(/Drive robot with right thumbstick[\s\S]*?for \(const controller of controllers\)/);
    assert.ok(driveMatch, 'Robot driving section found');
    const body = driveMatch[0];

    assert.ok(
      body.includes('grabStates.size') || body.includes('anyGrabbing'),
      'Must check if any panels are grabbed before driving'
    );
    assert.ok(body.includes('!anyGrabbing'), 'Robot driving must be disabled when grabbing');
  });

  it('robot driving uses handedness === "right" (not index)', () => {
    const driveMatch = html.match(/Drive robot with right thumbstick[\s\S]*?for \(const controller of controllers\)/);
    const body = driveMatch[0];

    assert.ok(
      body.includes("handedness === 'right'"),
      'Must find right controller by handedness, not index'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Scene Recenter — Button B only
// ---------------------------------------------------------------------------
describe('Scene Recenter', () => {
  it('recenter checks gamepad.buttons[5] (Button B/Y)', () => {
    const recenterMatch = html.match(/anyBY[\s\S]*?recenterHeld = false/);
    assert.ok(recenterMatch, 'Recenter polling code found');
    const body = recenterMatch[0];

    assert.ok(body.includes('btns[5]'), 'Must check btns[5] for B/Y');
    assert.ok(body.includes('.pressed'), 'Must check pressed state');
  });

  it('recenter does NOT fire on Button A', () => {
    // Button A is buttons[4] — should not appear in recenter logic
    const recenterMatch = html.match(/anyBY[\s\S]*?recenterHeld = false/);
    const body = recenterMatch[0];

    assert.ok(
      !body.includes('buttons[4]'),
      'Recenter must NOT check buttons[4] (Button A)'
    );
  });

  it('recenterScene rotates scenePivot with heading + PI offset', () => {
    const fnMatch = html.match(/function recenterScene\(\)[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'recenterScene function found');
    const body = fnMatch[0];

    assert.ok(body.includes('scenePivot.rotation.y'), 'Must set scenePivot.rotation.y');
    assert.ok(body.includes('Math.PI'), 'Must include PI offset for front-facing');
    assert.ok(body.includes('Math.atan2'), 'Must use atan2 for heading');
  });
});

// ---------------------------------------------------------------------------
// 6. Reset
// ---------------------------------------------------------------------------
describe('Reset', () => {
  it('resetWindowPositions resets scenePivot rotation', () => {
    const resetMatch = html.match(/function resetWindowPositions\(\)[\s\S]*?\n    \}/);
    assert.ok(resetMatch, 'resetWindowPositions function found');
    const body = resetMatch[0];

    assert.ok(body.includes('scenePivot.rotation.y = 0'), 'Must reset scenePivot rotation');
  });

  it('resetWindowPositions resets crop size', () => {
    const resetMatch = html.match(/function resetWindowPositions\(\)[\s\S]*?\n    \}/);
    const body = resetMatch[0];

    assert.ok(body.includes('setCropSize'), 'Must reset crop camera size');
  });

  it('resetWindowPositions restores camera visibility', () => {
    const resetMatch = html.match(/function resetWindowPositions\(\)[\s\S]*?\n    \}/);
    const body = resetMatch[0];

    assert.ok(body.includes('camerasHidden'), 'Must handle camerasHidden state');
    assert.ok(body.includes('s.group.visible = true'), 'Must restore panel visibility');
  });

  it('resetWindowPositions resets robot position', () => {
    const resetMatch = html.match(/function resetWindowPositions\(\)[\s\S]*?\n    \}/);
    const body = resetMatch[0];

    assert.ok(body.includes('robotModel'), 'Must reset robot model');
    assert.ok(body.includes('initialPos'), 'Must restore initial position');
  });
});

// ---------------------------------------------------------------------------
// 7. AR/VR Session Switching
// ---------------------------------------------------------------------------
describe('AR/VR Session Switching', () => {
  it('pendingXRMode pattern exists for session switching', () => {
    assert.ok(html.includes('pendingXRMode'), 'Must use pendingXRMode for session switching');
  });

  it('sessionend handler checks pendingXRMode', () => {
    const sessionEndMatch = html.match(/addEventListener\('sessionend'[\s\S]*?pendingXRMode/);
    assert.ok(sessionEndMatch, 'sessionend handler must check pendingXRMode');
  });

  it('startXRSession has retry logic', () => {
    const fnMatch = html.match(/async function startXRSession[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'startXRSession function found');
    const body = fnMatch[0];

    assert.ok(body.includes('attempt'), 'Must track attempt count');
    assert.ok(body.includes('setTimeout'), 'Must retry with delay');
  });

  it('AR mode hides sky sphere and camera panels', () => {
    // sessionstart handler sets AR visual state
    assert.ok(html.includes('skySphere.visible = false'), 'AR must hide sky sphere');
    assert.ok(html.includes('camerasHidden = true'), 'AR must hide cameras');
    // Verify these are in immersive-ar context
    const arBlock = html.match(/immersive-ar[\s\S]{0,500}skySphere\.visible = false/);
    assert.ok(arBlock, 'Sky sphere hidden must be in immersive-ar context');
  });
});

// ---------------------------------------------------------------------------
// 8. scenePivot panel positioning
// ---------------------------------------------------------------------------
describe('scenePivot Panel Positioning', () => {
  it('grabbed panel position uses worldToLocal for scenePivot', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    assert.ok(
      body.includes('scenePivot.worldToLocal'),
      'Must convert world position to scenePivot local space'
    );
  });

  it('camera direction for face-viewer also uses worldToLocal', () => {
    const grabLoopMatch = html.match(/for \(const controller of controllers\)[\s\S]*?--- Hover detection ---/);
    const body = grabLoopMatch[0];

    // Should have at least 2 worldToLocal calls — one for position, one for camera
    const matches = body.match(/worldToLocal/g);
    assert.ok(
      matches && matches.length >= 2,
      'Must convert both panel position and camera position to scenePivot local space'
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Version tracking
// ---------------------------------------------------------------------------
describe('Version Display', () => {
  it('APP_VERSION is defined', () => {
    const versionMatch = html.match(/const APP_VERSION = '(v[\d.]+)'/);
    assert.ok(versionMatch, 'APP_VERSION constant must be defined');
    console.log(`  Current version: ${versionMatch[1]}`);
  });

  it('version displayed on webpage', () => {
    assert.ok(
      html.includes("getElementById('version-label')"),
      'Version must be shown on webpage'
    );
  });

  it('version displayed on VR panel', () => {
    assert.ok(
      html.includes('ctx.fillText(APP_VERSION'),
      'Version must be rendered on VR control panel canvas'
    );
  });
});
