# Data Flows & Interactions

> End-to-end flows showing how components interact across a full user journey.
> See [overview](../../ARCHITECTURE.md) for system context.

---

## Voice Command Execution

Example: "Flag all emails from John as priority"

```
 1. User speaks → Mobile App captures audio
 2. @livekit/react-native → WebRTC → LiveKit Cloud
 3. Deepgram STT → transcript: "Flag all emails from John as priority"
 4. Backend Agent (GPT-4o):
    - Parse intent: flag_priority_vip
    - Extract params: { name: "John" }
    - Search contacts, disambiguate → "John Smith"
 5. Email Provider Layer:
    - UnifiedInboxService.searchByContact("John Smith")
    - Returns 3 emails → determine source per email
    - OutlookAdapter.applyLabel(ids, "Priority")
    - GmailAdapter.applyLabel(ids, "Priority")
 6. GPT-4o response: "Done. I've flagged 3 emails from John Smith."
 7. ElevenLabs TTS → WebRTC → Mobile App plays audio
 8. Shadow Processor: update Redis DriveState
 9. Audit Trail: log action to desktop app
```

---

## Morning Briefing Journey

```
 1. User opens app → taps "Start Briefing"
 2. Mobile requests LiveKit room token (POST /livekit/token)
 3. Mobile joins LiveKit room as "user-123"
 4. Agent auto-joins same room as "agent"

 5. Agent generates briefing:
    a. Fetch emails (OutlookAdapter + GmailAdapter in parallel)
       → 27 new emails (merged timeline)
    b. Red flag detection (Tier 1 ephemeral)
       → 3 red flags found
    c. Topic clustering → 5 topics
    d. GPT-4o generates briefing script
    e. ElevenLabs TTS streams audio to room

 6. User listens to first red flag

 7. User interrupts: "Flag that for follow-up"
    → LiveKit detects speech → Agent pauses TTS
    → Deepgram transcribes → GPT-4o executes flag_followup
    → Agent: "Done" → Resumes briefing

 8. User: "Skip to next topic"
    → GPT-4o: skip_topic()
    → Shadow Processor updates Redis (topicIndex: 1→2)

 9. Connection lost (tunnel)
    → Mobile detects ConnectionQuality.Lost
    → Shows overlay, saves position to Redis (145s)

10. Connection restored
    → Auto-reconnect → Fetch DriveState from Redis
    → Resume from position 145s
    → "Welcome back. You were at topic 2, item 3..."

11. Briefing completes
    → "That's everything. Have a great day!"
    → Session ends → Redis DriveState expires after 24h
```
