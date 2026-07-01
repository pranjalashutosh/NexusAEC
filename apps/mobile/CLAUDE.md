# apps/mobile — React Native + LiveKit voice

Global rules: root `CLAUDE.md`. Architecture:
`docs/architecture/application-layer.md` (navigation flow, Zustand stores,
services), `docs/architecture/voice-stack.md` (connection quality, dead-zone
recovery).

**Run:** `pnpm --filter @nexus-aec/mobile ios` (via Metro)

**The iOS Simulator CANNOT render WebRTC audio — test voice on a physical
device.**

## Structure

- React Native 0.74 with `@livekit/react-native` +
  `@livekit/react-native-webrtc`.
- Screens in `src/screens/main/`; use `useFocusEffect` for refetch on focus.
- Home screen triggers `POST /briefing/precompute` on mount, re-fetches stats
  after a 12s delay, and shows LLM-derived priority counts (High / Medium /
  Low).
- **API URL config** (`src/config/api.ts`): `NGROK_URL` is `null` by default.
  Resolution order: `API_BASE_URL` env → `NGROK_URL` → dev localhost → prod URL.
  **Never commit a hardcoded tunnel URL.**

## LiveKit / audio gotchas (hard-won)

- The `Room` is persistent via `useState(() => new Room())` — never attach event
  listeners in `connect()`; use a `useEffect` that runs once.
- iOS audio: call
  `AudioSession.setAppleAudioConfiguration({ audioCategory: 'playAndRecord' })`
  BEFORE `startAudioSession()`. Never return `soloAmbient` — it kills WebRTC
  audio.
- `AudioSession.configureAudio` runs once on mount, not per connect;
  `startAudioSession` / `stopAudioSession` go in connect / disconnect.
- `@livekit/react-native-webrtc` plays subscribed audio automatically — no
  `RoomAudioRenderer` needed (that's web-only).
- The SDK "event listener wasn't added" warning is cosmetic (internal WebRTC) —
  it cannot be fixed.

## Validation

- React Native type errors may require a Metro cache clear:
  `pnpm --filter @nexus-aec/mobile start --reset-cache`.
