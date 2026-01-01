# Web StereoEncoder (FOA) + Binaural Decoder — React Implementation Plan

## Goal
Build a React web app that emulates the **IEM StereoEncoder** core behavior (Reaper plugin style):

- Load a **mono WAV** and play it **in real time**
- Control **Azimuth** + **Elevation** via a **2D circular panner UI** (like the screenshot)
- Convert azimuth/elevation to **FOA (First-Order Ambisonics) B-format** gains (W, X, Y, Z)
- Decode FOA to **binaural stereo (L/R)** for headphone playback
- Display **Azimuth, Elevation** and **Quaternion/B-format values (W, X, Y, Z)** in real time
- Exclude **Roll** and **Width**

---

## Recommended Stack
### Frontend
- React + TypeScript (Vite recommended)
- Pointer Events for mouse/touch support
- Canvas or SVG for the panner (SVG is simpler for labels; Canvas is smoother for custom drawings)

### Audio
Primary (recommended):
- **JSAmbisonics** (`ambisonics` package): provides `monoEncoder` (mono → FOA) and `binDecoder` (FOA → binaural)

Fallback options (if needed):
- **Omnitone** for FOA → binaural decode (encoding done manually)
- **Resonance Audio** (higher-level; less transparent for WXYZ display)

---

## Success Criteria (Acceptance Tests)
1. User can load a mono WAV and press Play; audio plays continuously.
2. While audio plays, dragging the dot updates spatial direction **immediately** (audible change).
3. UI shows numeric **Azimuth/Elevation** updates during dragging.
4. UI shows **W, X, Y, Z** values updating during dragging (range approx [-1, 1]).
5. Output is always stereo **L/R** (headphone-friendly binaural).
6. No glitches or stalls during drag (target: smooth at ~60 Hz UI updates).

---

## High-Level Audio Graph
**Mono Source** → **FOA Encoder (WXYZ)** → **Binaural Decoder** → **Destination**

If using JSAmbisonics:
- `AudioBufferSourceNode` or `MediaElementSourceNode`
- `ambisonics.monoEncoder(ctx, 1)` (FOA order 1)
- `ambisonics.binDecoder(ctx, 1)` (FOA binaural decode)
- Connections:
  - `source.connect(encoder.in)`
  - `encoder.out.connect(decoder.in)`
  - `decoder.out.connect(ctx.destination)`

Real-time updates:
- `encoder.azim = azimuthDeg`
- `encoder.elev = elevationDeg`
- `encoder.updateGains()`

---

## Coordinate System and Mapping Rules
### Definitions
- **Azimuth (θ):** horizontal angle around listener
  - 0° = Front
  - +90° = Right
  - 180° or -180° = Back
  - -90° = Left
- **Elevation (φ):** vertical angle
  - 0° = horizon (ear level)
  - +90° = straight up
  - -90° = straight down

### UI Mapping (2D circle → azimuth/elevation)
We need a predictable mapping that feels like the plugin’s 2D sphere projection.

**Recommended first iteration (simple + works well):**
- Pointer position → polar coordinates relative to center:
  - `angle = atan2(dy, dx)` (radians)
  - `radius = clamp(sqrt(dx^2 + dy^2) / R, 0..1)`
- Map:
  - `azimuthDeg = normalizeDegrees( angleToAzimuth(angle) )`
  - `elevationDeg = (1 - radius) * 90`  
    - center = +90° (up)
    - edge = 0° (horizon)

**Optional Phase 2 (support negative elevation):**
- Allow radius > 1 within a second ring (e.g., up to 1.5)
- Map:
  - `elevationDeg = (1 - radius) * 90`
  - so radius 1.0 = 0°, radius 2.0 = -90°
- Change dot styling when elevation < 0 (e.g., outline or different marker)

### Angle normalization
- Keep azimuth in `[-180, 180]` or `[0, 360)` consistently.
- For UI display, `[-180, 180]` is often easier.

---

## WXYZ (Quaternion / FOA) Computation
You want to display WXYZ like the plugin. Two valid approaches:

### Approach A (Recommended): Display FOA gains (B-format coefficients)
For FOA encoding (SN3D-style normalization commonly used):
- `W = 1 / sqrt(2)`
- `X = cos(az) * cos(el)`
- `Y = sin(az) * cos(el)`
- `Z = sin(el)`

Where az/el are **radians**.
These correspond to the directional weights applied to the mono signal per channel.

### Approach B: Display a unit quaternion from yaw/pitch (no roll)
Compute a unit quaternion (W, X, Y, Z) for rotation:
- `w = cos(az/2) * cos(el/2)`
- `x = -sin(az/2) * sin(el/2)`
- `y = cos(az/2) * sin(el/2)`
- `z = sin(az/2) * cos(el/2)`

This guarantees `w^2 + x^2 + y^2 + z^2 = 1`.
Note: signs may need flipping depending on handedness and your azimuth direction.

**Recommendation:**
- Use **Approach A** for display because it matches FOA gain intuition and aligns with encoder behavior.
- If you need “true quaternion” display later, add a toggle in UI.

---

## Project Structure (Suggested)
stereo-encoder-web/
src/
audio/
audioEngine.ts
audioLoader.ts
types.ts
ui/
Panner2D.tsx
QuaternionBars.tsx
Transport.tsx
utils/
math.ts
throttle.ts
App.tsx
main.tsx

---

## Implementation Phases

## Phase 0 — Setup & Scaffolding
**Deliverables**
- React + TS app (Vite)
- Basic layout matching plugin structure:
  - Left: circular panner
  - Right: numeric readouts + WXYZ bars
  - Bottom: play/pause + file load

**Steps**
1. Create project
   - `npm create vite@latest stereo-encoder-web -- --template react-ts`
2. Install dependencies
   - `npm i ambisonics`
3. Create UI skeleton components:
   - `Panner2D`
   - `QuaternionBars`
   - `Transport`
4. Add basic styling (CSS modules or plain CSS)

**Acceptance**
- App runs, layout visible, no audio yet.

---

## Phase 1 — Audio Engine (Mono → FOA → Binaural)
**Deliverables**
- `AudioContext` lifecycle management
- WAV file loading to `AudioBuffer`
- Real-time playback pipeline using JSAmbisonics

**Steps**
1. Implement `audioLoader.ts`
   - Support file input (`File`) and fetch (`URL`)
   - Use `arrayBuffer()` → `ctx.decodeAudioData()`
2. Implement `audioEngine.ts` with:
   - `initAudio()` creates `AudioContext`, encoder, decoder
   - `loadBuffer()` stores mono AudioBuffer (downmix if needed)
   - `play()` creates `AudioBufferSourceNode`, connects to encoder, starts
   - `stop()` stops and disconnects
3. Channel handling:
   - If file has >1 channels, downmix to mono:
     - `mono = 0.5*(L+R)` or choose L for first iteration
4. Connect graph:
   - `source -> encoder.in -> decoder.in -> destination`
5. Add master gain (optional safety):
   - destination chain: `decoder.out -> masterGain -> ctx.destination`

**Acceptance**
- Audio plays through decoder and outputs binaural stereo.

---

## Phase 2 — Real-Time Azimuth/Elevation Control
**Deliverables**
- Dragging the panner updates azim/elev in real time
- Audio direction changes immediately

**Steps**
1. Implement panner math in `math.ts`
   - `clamp()`, `radToDeg()`, `degToRad()`
   - `pointToAzEl(x, y, center, R)` → `{azDeg, elDeg}`
2. Implement `Panner2D.tsx`
   - Draw circle + rings + labels
   - Dot position driven by state `{azDeg, elDeg}`
   - Use Pointer Events:
     - onPointerDown → capture pointer
     - onPointerMove → compute new az/el → call `onChange(az, el)`
     - onPointerUp → release
3. In `App.tsx`, store:
   - `azDeg`, `elDeg`
4. Wire audio updates:
   - On az/el change:
     - `audioEngine.setDirection(azDeg, elDeg)`:
       - `encoder.azim = azDeg`
       - `encoder.elev = elDeg`
       - `encoder.updateGains()`
5. Throttle:
   - Use `requestAnimationFrame` throttling in drag handler to avoid excessive React re-renders

**Acceptance**
- Moving dot changes sound position smoothly without glitches.

---

## Phase 3 — WXYZ Display (Quaternion/B-format Readout)
**Deliverables**
- Display WXYZ values and bars (range [-1..1])
- Updates in real time with panner movement

**Steps**
1. Implement `computeWXYZ(azDeg, elDeg)` in `math.ts`
   - Use FOA gains:
     - `W = 1/sqrt(2)`
     - `X = cos(az)*cos(el)`
     - `Y = sin(az)*cos(el)`
     - `Z = sin(el)`
2. Implement `QuaternionBars.tsx`
   - For each component:
     - label + numeric value (2 decimals)
     - horizontal bar with center at 0
3. Ensure sign conventions match audible directions:
   - If dot moved right but audio goes left:
     - invert azimuth sign or swap Y sign

**Acceptance**
- Values and sound direction are consistent (Front/Right/Back/Left).

---

## Phase 4 — UI Fidelity Pass (Match Plugin Feel)
**Deliverables**
- Panner looks and behaves like the screenshot
- Smooth dragging, responsive layout

**Steps**
1. Visual styling:
   - Concentric rings
   - Crosshair
   - Labels: FRONT/BACK/LEFT/RIGHT
2. Add readout boxes:
   - `Azimuth: -84.0°`
   - `Elevation: 73.1°`
3. Add presets (optional):
   - Front, Right, Back, Left, Up
4. Add “Snap” option (optional):
   - Snap azimuth to 5° increments
   - Snap elevation to 5° increments

**Acceptance**
- UI feels close to plugin: clean, readable, stable.

---

## Phase 5 — Robustness + Edge Cases
**Deliverables**
- Stable on common browsers (Chrome/Edge/Firefox; Safari if possible)
- Clean lifecycle behavior, no memory leaks

**Steps**
1. AudioContext state:
   - Must resume on user gesture (Play click)
2. Ensure stop/replay works:
   - Always create a new `AudioBufferSourceNode` per play
3. Prevent clicks/zipper noise:
   - If needed, smooth direction changes:
     - interpolate az/el over ~20–50ms using a small ramp loop
4. Handle drag outside circle:
   - clamp to circle boundary (or allow Phase 2 negative elevation ring)
5. Add basic error UI:
   - invalid WAV, decode fail, unsupported browser

**Acceptance**
- No console errors, no “stuck audio,” no runaway nodes.

---

## Implementation Notes (Important)
- **AudioBufferSourceNode is one-shot**: recreate on each play.
- Keep encoder/decoder nodes persistent across plays to reduce churn.
- Use `useRef()` to hold audio objects; avoid recreating on re-render.
- Use `requestAnimationFrame` for UI update pacing during drag.
- Prefer **Pointer Events** for unified mouse/touch handling.

---

## Suggested Developer Checklist
- [ ] AudioContext created only once; resumes on user action
- [ ] WAV loads and plays
- [ ] Encoder + decoder connected correctly
- [ ] Dragging updates `encoder.azim/elev` + `updateGains()`
- [ ] WXYZ computed and displayed
- [ ] Direction mapping matches labels (Front/Right/Back/Left)
- [ ] No clipping, stable CPU

---

## Optional Enhancements (Later)
1. **SOFA HRIR support**:
   - Load a SOFA file, parse/convert to FIR buffers
   - Feed custom HRIR filters into binaural decoder (library-dependent)
2. **Negative elevation + below-plane UI**
3. **Recording/export**:
   - Use `MediaRecorder` on `MediaStreamAudioDestinationNode`
4. **A/B decoder comparison**:
   - Toggle between JSAmbisonics / Omnitone / Resonance

---

## Handoff Summary (What to Build)
1. A React UI matching the plugin screenshot (panner + numeric + WXYZ bars)
2. A Web Audio graph:
   - Mono WAV → FOA encoder (az/el) → binaural decoder → stereo output
3. Real-time updates during dragging, with correct coordinate mapping
4. WXYZ values displayed and consistent with audible direction

---
