# NexusAEC Active Context - Briefing Room

> This file documents the complete Briefing Room flow, key files, architecture, and rules.
> Always read this file before planning any changes or debugging related to the Briefing Room.

---

## Rules

1. **PRD Rule 60**: Email content must NOT persist beyond the active session. Only metadata (sender, subject, timestamp, thread ID) may be cached.
2. **iOS Simulator CANNOT render WebRTC audio**: `WebRTC-SDK` uses `AudioUnit` API which doesn't work in Simulator's software HAL. MUST test on physical device for audio.
3. **Never return `soloAmbient`**: The `configureAppleAudio` function must NEVER return `soloAmbient` for `trackState='none'` -- it kills WebRTC audio. Keep `playAndRecord` at all times.
4. **ElevenLabs free tier**: Library voices return HTTP 402. Must use premade voices (currently "Eric" - `cjVigY5qzO86Huf0OWal`).
5. **Event listener stacking**: Room is persistent (`useState(() => new Room())`). NEVER attach listeners in `connect()` -- use a `useEffect` that runs once.
6. **Custom LLM streaming**: `LLMStream.run()` MUST push text in small sentence-sized chunks with 50ms delays between them. Pushing one giant chunk stalls the TTS pipeline.
7. **`configureAppleAudio` MUST use `playAndRecord` for ALL track states** (including `remoteOnly`). iOS only allows `defaultToSpeaker` with `playAndRecord`. Using `playback` + `defaultToSpeaker` causes `SessionCore.mm:573` error and kills all audio on physical devices.

---

## Complete Briefing Room Flow

### Phase 1: User Initiates Briefing (Mobile App)

**File**: `apps/mobile/src/screens/main/BriefingRoom.tsx`

1. User taps "Start Briefing" on the Home screen, navigating to `BriefingRoomScreen`.
2. On mount, `generateRoomName()` creates a unique room name (`briefing-{timestamp}-{random}`).
3. `fetchBriefingStats()` calls `GET /email/stats?userId=...` to fetch email counts for the topic card (newCount, vipCount, urgentCount).
4. `connect(roomName, userId)` is called from `useLiveKit()` hook.

### Phase 2: iOS Audio Session Setup

**File**: `apps/mobile/src/hooks/useLiveKit.tsx`

1. On provider mount, `AudioSession.configureAudio()` sets iOS default output to speaker and Android to communication mode.
2. `AudioSession.setAppleAudioConfiguration()` pre-sets the category to `playAndRecord` with `defaultToSpeaker` + `allowBluetooth` + `mixWithOthers` and mode `videoChat`.
3. `useIOSAudioManagement(room, true, configureAppleAudio)` auto-manages AVAudioSession category changes as audio tracks appear/disappear.
4. Custom `configureAppleAudio()` function ensures `playAndRecord` is ALWAYS returned (never `soloAmbient`).

### Phase 3: LiveKit Room Connection

**File**: `apps/mobile/src/hooks/useLiveKit.tsx` (connect function)

1. `AudioSession.setAppleAudioConfiguration()` is called again with `voiceChat` mode before connecting.
2. `AudioSession.startAudioSession()` starts the native audio session.
3. `AudioSession.selectAudioOutput('force_speaker')` forces output to speaker.
4. `getLiveKitToken()` fetches a JWT token from the backend API.
5. `room.connect(serverUrl, token)` connects the persistent Room instance to LiveKit Cloud.
6. `room.localParticipant.setMicrophoneEnabled(true)` enables the mic for voice interaction.

### Phase 4: Token Acquisition (Backend API)

**File**: `apps/mobile/src/services/livekit-token.ts` (client-side)
**File**: `apps/api/src/routes/livekit-token.ts` (server-side)

1. Mobile app sends `POST /livekit/token` with `{ userId, roomName }`.
2. Backend calls `buildEmailMetadata(userId)` to retrieve the user's stored OAuth tokens (Gmail/Outlook) from `FileTokenStorage`.
3. OAuth tokens are embedded into the participant's metadata as JSON: `{ email: { userId, gmail: { accessToken, refreshToken, ... } } }`.
4. A JWT access token is generated using HMAC-SHA256, signed with `LIVEKIT_API_SECRET`.
5. Token grants: `roomJoin`, `roomCreate`, `canPublish`, `canSubscribe`, `canPublishData`.
6. Response includes: `{ token, roomName, serverUrl, expiresAt }`.
7. Client-side token caching via `AsyncStorage` with 1-minute expiry buffer.

### Phase 5: Agent Bootstrap (LiveKit Agent)

**File**: `packages/livekit-agent/src/main.ts` (entry point)
**File**: `packages/livekit-agent/src/agent.ts` (agent definition)

1. Agent process starts via `pnpm --filter @nexus-aec/livekit-agent start:dev`.
2. `prewarm()` pre-loads Silero VAD model and config for faster cold starts.
3. When LiveKit Cloud dispatches a job for the room, `entry()` is called.
4. Agent calls `ctx.connect()` to join the room.
5. `ctx.waitForParticipant()` waits for the user to join.

### Phase 6: Email Bootstrap & Briefing Pipeline

**File**: `packages/livekit-agent/src/email-bootstrap.ts`
**File**: `packages/livekit-agent/src/briefing-pipeline.ts`

1. `bootstrapFromMetadata(participant.metadata)` extracts OAuth tokens from the participant's metadata.
2. Creates `GmailAdapter` and/or `OutlookAdapter` from the parsed credentials.
3. Wraps adapters in `UnifiedInboxService` and `SmartDraftService`.
4. Registers services with `setEmailServices()` so tool executors can use them.
5. `runBriefingPipeline(inboxService)` orchestrates:
   - **Fetch**: Up to 50 unread emails via `inboxService.fetchUnread()`.
   - **Score**: Each email scored by `RedFlagScorer` using `KeywordMatcher` and `VipDetector`.
   - **Cluster**: Emails grouped into topics by `TopicClusterer`.
   - **Sort**: Topics sorted by flaggedCount desc, maxScore desc, email count desc.
6. Output: `BriefingData` with `topics[]`, `topicItems[]`, `topicLabels[]`, `totalEmails`, `totalFlagged`.

### Phase 7: Voice Assistant Pipeline Startup

**File**: `packages/livekit-agent/src/agent.ts` (startVoiceAssistant)

1. **Deepgram STT** (`nova-2`): Converts user speech to text with interim results, punctuation, smart format.
2. **ElevenLabs TTS** (`eleven_turbo_v2_5`, voice: Eric): Converts agent text to speech at PCM 22050Hz.
3. **ReasoningLLM**: Custom `llm.LLM` subclass wrapping the `ReasoningLoop` for GPT-4o tool-calling.
4. **Silero VAD**: Voice Activity Detection for turn-taking.
5. **System Prompt**: Built from `buildSystemPrompt()` with persona, safety constraints, tool instructions, and email references.
6. `voice.AgentSession` created with: STT, TTS, LLM, VAD, turn detection (VAD), voice options (allowInterruptions, endpointing delays).
7. Event handlers wired: `UserStateChanged` (barge-in), `AgentStateChanged` (speaking state), `Error`, `Close`, `SpeechCreated`.
8. `agentSession.start()` starts the pipeline.
9. `agentSession.generateReply()` sends the initial greeting with briefing context.

### Phase 8: Voice Interaction Loop

**File**: `packages/livekit-agent/src/llm/reasoning-llm.ts`
**File**: `packages/livekit-agent/src/reasoning/reasoning-loop.ts`

The runtime loop:
```
User speaks → Deepgram STT → ReasoningLLMStream.run() → ElevenLabs TTS → User hears
```

1. `ReasoningLLMStream.run()` extracts the last user message from `ChatContext`.
2. Passes text to `ReasoningLoop.processUserInput()`.
3. ReasoningLoop calls `callChatCompletion()` with GPT-4o, passing:
   - Full conversation history (system + user + assistant + tool messages).
   - All tools (EMAIL_TOOLS + NAVIGATION_TOOLS).
4. If GPT-4o returns tool calls:
   - Email tools: `flag_followup`, `mute_sender`, `prioritize_vip`, `create_draft`, `archive_email`, `mark_read`, `search_emails`.
   - Navigation tools: `skip_topic`, `next_item`, `go_back`, `repeat_that`, `go_deeper`, `pause_briefing`, `stop_briefing`.
   - Tool results are fed back to GPT-4o for the final response.
5. Response text is split into sentences via `splitIntoSentences()`.
6. Sentences are pushed to `this.queue` as ChatChunks with 50ms delays between them.
7. The SDK's TTS pipeline converts chunks to speech and publishes audio track.

### Phase 9: Session Teardown

**File**: `apps/mobile/src/hooks/useLiveKit.tsx` (disconnect)
**File**: `packages/livekit-agent/src/agent.ts` (shutdown callback)

Mobile side:
1. `room.disconnect()` disconnects from the LiveKit room.
2. `AudioSession.stopAudioSession()` stops the native audio session.
3. State reset: roomState, participants, speaking states.

Agent side:
1. `ctx.addShutdownCallback()` fires on context shutdown.
2. `teardownEmailServices()` clears email service registrations.
3. `handleDisconnect(session)` logs duration and removes session from `activeSessions` map.

---

## Key Files Reference

### Mobile App (React Native)
| File | Purpose |
|------|---------|
| `apps/mobile/src/screens/main/BriefingRoom.tsx` | Briefing Room UI screen |
| `apps/mobile/src/hooks/useLiveKit.tsx` | LiveKit room connection, audio config, event listeners |
| `apps/mobile/src/services/livekit-token.ts` | Token fetching & caching |
| `apps/mobile/src/config/api.ts` | API URL config (`getApiBaseUrl()`, `getLiveKitUrl()`) |
| `apps/mobile/src/components/PTTButton.tsx` | Push-to-talk button |
| `apps/mobile/src/components/ConnectionQualityIndicator.tsx` | Network quality indicator |
| `apps/mobile/src/hooks/useNetworkStatus.tsx` | Network quality monitoring |
| `apps/mobile/ios/NexusAEC/Info.plist` | iOS permissions (UIBackgroundModes: audio, voip) |

### Backend API (Fastify)
| File | Purpose |
|------|---------|
| `apps/api/src/routes/livekit-token.ts` | Token generation, email metadata injection |
| `apps/api/src/routes/auth.ts` | OAuth flow, token storage (`FileTokenStorage`) |
| `apps/api/src/routes/email-stats.ts` | Email stats endpoint (Redis-cached) |

### LiveKit Agent (Node.js)
| File | Purpose |
|------|---------|
| `packages/livekit-agent/src/main.ts` | Entry point, unhandled rejection handler |
| `packages/livekit-agent/src/agent.ts` | Agent definition, `startVoiceAssistant()` pipeline |
| `packages/livekit-agent/src/config.ts` | Environment config loader (LiveKit, Deepgram, ElevenLabs, OpenAI) |
| `packages/livekit-agent/src/email-bootstrap.ts` | OAuth token extraction from metadata, adapter creation |
| `packages/livekit-agent/src/briefing-pipeline.ts` | Fetch → Score → Cluster → Sort pipeline |
| `packages/livekit-agent/src/llm/reasoning-llm.ts` | Custom `llm.LLM` adapter bridging ReasoningLoop to LiveKit SDK |
| `packages/livekit-agent/src/reasoning/reasoning-loop.ts` | GPT-4o conversation loop, tool dispatch, barge-in, state |
| `packages/livekit-agent/src/tools/email-tools.ts` | Email tool definitions & executors |
| `packages/livekit-agent/src/tools/navigation-tools.ts` | Navigation tool definitions & executors |
| `packages/livekit-agent/src/prompts/system-prompt.ts` | System prompt builder (persona, safety, tools, formatting) |
| `packages/livekit-agent/src/session-store.ts` | In-memory session tracking by room name |
| `packages/livekit-agent/src/stt/` | STT transcript processing, command detection |
| `packages/livekit-agent/src/tts/` | TTS text preprocessing, streaming chunker |

### Intelligence Layer
| File | Purpose |
|------|---------|
| `packages/intelligence/src/red-flag/` | RedFlagScorer, KeywordMatcher, VipDetector |
| `packages/intelligence/src/clustering/` | TopicClusterer for email grouping |

---

## Environment Variables (Briefing Room)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `LIVEKIT_URL` | API + Agent | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | API + Agent | LiveKit API key for JWT signing |
| `LIVEKIT_API_SECRET` | API + Agent | LiveKit API secret for JWT signing |
| `DEEPGRAM_API_KEY` | Agent | Deepgram STT authentication |
| `ELEVENLABS_API_KEY` | Agent | ElevenLabs TTS authentication |
| `ELEVENLABS_VOICE_ID` | Agent | TTS voice (currently Eric: `cjVigY5qzO86Huf0OWal`) |
| `OPENAI_API_KEY` | Agent | GPT-4o for reasoning |
| `GOOGLE_CLIENT_ID` | API | OAuth for Gmail |
| `GOOGLE_CLIENT_SECRET` | API | OAuth for Gmail |

---

## How to Run

```bash
# Terminal 1: API Server
pnpm --filter @nexus-aec/api dev

# Terminal 2: LiveKit Agent (requires Node >= 20)
PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" pnpm --filter @nexus-aec/livekit-agent start:dev

# Terminal 3: iOS App (Simulator)
pnpm --filter @nexus-aec/mobile ios

# Optional: Redis
docker compose -f infra/docker-compose.yml up redis -d
```

For physical device testing:
1. Set `NGROK_URL` in `apps/mobile/src/config/api.ts` to a cloudflare tunnel URL.
2. Switch AppDelegate.mm to use pre-bundled JS instead of Metro.
3. Run `cloudflared tunnel --url http://localhost:3000` for API access.

---

## Known Issues & Debugging

- **"unexpected message from elevenlabs tts"**: Benign end-of-stream marker. `contextId` not found in SDK's `#contextData` map. Not an error.
- **"event listener wasn't added" warning**: From SDK internal WebRTC `setMediaStreamTrack`. Cosmetic, cannot be fixed.
- **No audio on Simulator**: Expected. iOS Simulator cannot render WebRTC audio. Test on physical device.
- **ElevenLabs 402 error**: Voice ID is a library voice not available on free tier. Switch to a premade voice.
- **"job is unresponsive"**: LLM response pushed as one giant chunk. Must split into sentences with delays.
- **Agent not joining room**: Check that the agent process is running and connected to the same LiveKit Cloud project. Verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` match between API and agent.

---

## Progress Log

- **2026-02-14**: Briefing Room flow documented. ElevenLabs voice switched to Eric (free tier). Physical device testing established via cloudflared tunnel. iOS audio configuration hardened (never soloAmbient). Ready for end-to-end testing on physical device.
