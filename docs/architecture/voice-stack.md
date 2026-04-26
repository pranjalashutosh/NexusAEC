# Voice Processing Stack

> LiveKit Cloud handles all real-time voice: WebRTC transport, STT (Deepgram),
> TTS (ElevenLabs), and barge-in via VAD. See [overview](../../ARCHITECTURE.md).

---

## LiveKit Unified Architecture

**Key Decision:** LiveKit Cloud is the central hub for ALL voice processing —
no custom WebRTC implementation.

```
┌──────────────────────────────────────────────────────────┐
│                    LiveKit Cloud                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                  LiveKit Room                      │  │
│  │  ┌──────────────┐         ┌─────────────────┐     │  │
│  │  │ Mobile App   │◄──────►│  Agent          │     │  │
│  │  │ (Participant)│ WebRTC │  (Participant)  │     │  │
│  │  └──────────────┘  Audio  └────────┬────────┘     │  │
│  └────────────────────────────────────┼──────────────┘  │
│                                       │                  │
│  ┌──────────────────┐  ┌──────────────▼───────────────┐ │
│  │ STT: Deepgram    │  │ TTS: ElevenLabs Turbo v2.5  │ │
│  │ Nova-2           │  │ Streaming, <300ms latency    │ │
│  │ Custom vocab     │  └──────────────────────────────┘ │
│  │ Multi-language   │                                    │
│  └──────────────────┘                                    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                 LiveKit Backend Agent                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ GPT-4o Reasoning Loop                              │  │
│  │ Transcript → Intent → Function Calling → Response  │  │
│  │                                                    │  │
│  │ Tools: email actions, navigation, disambiguation   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Shadow Processor (Background)                      │  │
│  │ Listens to transcript → Updates Redis DriveState   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Audio Processing Flow

```
User Speaks
  → Mobile App captures audio (@livekit/react-native SDK)
    → WebRTC transport to LiveKit Cloud
      → Deepgram STT: "Flag all emails from John as priority"
        → Agent receives transcript
          → GPT-4o parses intent → function call: flag_priority_vip(name: "John")
            → Email Provider API call → "Flagged 3 emails from John Smith"
              → GPT-4o generates: "Done. I've flagged 3 emails from John."
                → ElevenLabs TTS → WebRTC → Mobile App plays audio
```

---

## Barge-in Handling (LiveKit Native)

```
Agent speaking (TTS playing)
  → User starts speaking (VAD detects interruption)
    → LiveKit detects audio from mobile participant
      → Agent pauses TTS playback
        → Deepgram transcribes user input
          → GPT-4o decides:
              New command?    → Execute new action
              Clarification?  → Resume after answer
```

---

## Dead Zone Recovery (Network Resilience)

The mobile app monitors `ConnectionQuality` events from the LiveKit SDK:

| Quality | UI Indicator | Behavior |
|---------|-------------|----------|
| Good | Green | Normal operation |
| Poor | Yellow | "Connection degraded" warning |
| Lost | Red | Pause UI, "Connection lost" overlay, save position to Redis |

**Auto-reconnect flow:**
1. Reconnect to LiveKit room
2. Fetch DriveState from Redis
3. Resume briefing from last saved position
4. Show "Connection restored" indicator
