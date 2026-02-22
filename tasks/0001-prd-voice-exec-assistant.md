# Product Requirements Document (PRD): Voice-Driven AI Executive Assistant (Safety-First Inbox + Calendar Briefings)

## 1. Introduction / Overview

Regional Operations Managers often start and end their day in motion (driving in
heavy traffic, walking between sites, or commuting), while still being
accountable for fast-moving operational issues and stakeholder communication.
Traditional “read my inbox” tools increase cognitive load by reading subject
lines verbatim and forcing the user to manage context switching.

This feature is a **voice-driven AI Executive Assistant** that converts unread
email (and upcoming calendar context) into a **structured, podcast-style audio
briefing** centered on **“red flags”** (high-risk, time-sensitive, or
operationally critical items). It supports a **barge-in** interaction model: the
user can interrupt the briefing to issue command-and-control instructions (e.g.,
prioritize a sender, create a folder/label, summarize a thread, or set a
follow-up).

Crucially, it bridges car and office through a **Safety-First Voice-to-Draft**
workflow: users can dictate complex replies during motion; the system creates
drafts that sync to a **desktop application** for final review and sending.

### Primary Goal

By the time the user arrives at their destination, their inbox is triaged and
organized, priorities are set, and key communications are ready as **Drafts
Pending Review** on desktop—without requiring screen interaction during motion.

## 2. Goals

- **G1: Operational triage via audio**: Convert unread inbox + calendar context
  into a coherent audio narrative that highlights the most important risks (“red
  flags”) first.
- **G2: Low-friction voice control**: Allow the user to interrupt (barge-in) and
  execute high-value inbox actions hands-free.
- **G3: Safety-first response drafting**: Enable dictation of detailed replies
  that become drafts (not sent) and are synced to desktop for review.
- **G4: Dual-provider support**: Support connecting up to **one Outlook account
  and one Gmail account** per user at launch.
- **G5: Enterprise-ready baseline**: Support company-managed Outlook desktop
  users with appropriate authentication, permissions, and data handling
  assumptions.
- **G6: Day-1 value**: Deliver a useful first briefing within minutes, using
  sensible defaults plus optional guided setup for VIPs, projects/topics, and
  red-flag keywords.

## 3. User Stories

- **US1 (Triage)**: As a Regional Operations Manager, I want to hear a short,
  structured briefing of what matters most (red flags) so I can focus on urgent
  issues without reading email.
- **US2 (Topic-based briefing)**: As a user, I want the briefing grouped by
  topic/project so I can understand each operational thread end-to-end.
- **US3 (Barge-in control)**: As a user, I want to interrupt the assistant
  mid-briefing to ask “summarize this thread” or “prioritize Bob Smith” so I can
  steer the briefing without waiting.
- **US4 (Organize on the go)**: As a user, I want to create folders/labels and
  move items via voice so my inbox is organized by the time I’m at my desk.
- **US5 (Follow-ups)**: As a user, I want to flag items and set follow-ups
  (remind me later) so I don’t lose track of action items.
- **US6 (Voice-to-draft)**: As a user, I want to dictate a complex response
  while driving/walking that becomes an email draft, so I can review and send it
  quickly on desktop later.
- **US7 (Multi-account)**: As a user, I want to connect both my work Outlook and
  a Gmail account so I can hear one unified briefing.
- **US8 (Noise control)**: As a user, I want to mute notifications from a
  vendor/sender so I'm not distracted by low-value messages.
- **US9 (Quick onboarding)**: As a new user, I want to connect my Outlook
  account and quickly tell the system who my VIPs are, what projects I'm working
  on, and what keywords mean "urgent" so my first briefing is actually useful.
- **US10 (Skip setup)**: As a busy user, I want to skip detailed setup and still
  get a useful first briefing based on smart defaults, then fine-tune later.

## 4. Functional Requirements

### 4.1 Account Connection & Permissions

1. The system must allow the user to connect **one Outlook (Microsoft
   365/Exchange) account** and **one Gmail/Google Workspace account**.
2. The system must support secure OAuth-based authentication flows for each
   provider (provider-appropriate).
3. The system must request the minimum permissions needed to:
   - Read unread emails and metadata (sender, subject, timestamp, thread).
   - Access calendar events (read-only) for contextual relevance.
   - Create email drafts (not send).
   - Apply organizing actions (labels/folders/categories where supported) as
     defined in requirements below.
4. The system must clearly explain what permissions are requested and why.

### 4.2 Day-1 Setup & Onboarding (Getting Value Immediately)

5. The system must provide a guided onboarding flow after account connection
   that gets the user to a first “useful briefing” quickly (target: under ~5
   minutes; exact target tracked as a success metric).
6. The system must offer two onboarding paths:
   - **Quick start**: Use smart defaults and begin briefing immediately.
   - **Guided setup**: Configure VIPs, key projects/topics, and red-flag
     keywords before the first full briefing.
7. The system must bootstrap an initial **VIP suggestions list** using available
   signals from the connected accounts (e.g., frequent correspondents, recent
   threads, meeting organizers/attendees), and allow the user to confirm/edit
   it.
8. The system must allow the user to **import contacts** for the purpose of VIP
   selection:
   - Outlook: use provider directory/contacts where available (enterprise
     constraints may apply).
   - Gmail: use contacts where available.
9. The system must allow the user to specify or confirm **key projects/topics**
   up front by:
   - Selecting from suggested topics inferred from recent
     subjects/threads/calendar titles.
   - Manually adding project/topic names (voice or typing).
10. The system must allow the user to configure **red-flag keywords/phrases** up
    front (e.g., “incident”, “outage”, “bridge closure”, “Riverside Bridge”)
    via:

- Suggested keywords inferred from recent messages (with user confirmation).
- Manual entry (voice or typing).

11. The system must ship with a small set of **default red-flag patterns** to
    enable Day-1 value even if the user skips setup (e.g., escalation language,
    deadlines, safety/incident language), and allow the user to view and adjust
    them later.
12. The system must let the user change onboarding choices later in Settings
    (VIPs, topics/projects, keywords, muted senders/vendors).
13. The system must provide a short, user-friendly explanation of how
    personalization affects the briefing (e.g., “VIPs and keywords increase what
    gets flagged as urgent”).
14. The system should support lightweight "training moments" during early use
    (e.g., after a segment: "Was this urgent?") in a way that is safe in motion
    and can be turned off.

#### 4.2.1 Detailed Onboarding Flow (Step-by-Step)

The onboarding is **screen-based** (not voice) since it happens before the user
starts driving/walking. Target: complete in **under 5 minutes**.

| Step                      | Screen / Action                | Details                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Welcome**            | Splash + value prop            | "Your AI briefing assistant. Let's get you set up in under 5 minutes." Two buttons: **Quick Start** (skip to Step 6) or **Personalize** (continue).                                                                                                                                                                                                            |
| **1. Connect Account(s)** | OAuth prompt                   | "Connect your work email to get started." Show Outlook and Gmail buttons. User completes OAuth. After success: "Syncing your inbox… this may take a moment." (background fetch of recent emails, calendar, contacts).                                                                                                                                          |
| **2. VIP Selection**      | Pre-populated list + search    | **Header**: "Who matters most? Emails from VIPs will always be flagged as high priority."<br>**Body**: Show top 8–12 suggested contacts (inferred from: frequent correspondents, recent thread participants, meeting organizers). Each row: name, email, "Add as VIP" toggle.<br>**Actions**: Toggle on/off; search/add from contacts; "Skip for now" link.    |
| **3. Projects / Topics**  | Suggested chips + manual entry | **Header**: "What projects are you working on? We'll group your briefing by topic."<br>**Body**: Show 6–10 suggested topic chips extracted from recent subjects, threads, calendar event titles (e.g., "Riverside Bridge", "Q2 Budget", "Safety Audit").<br>**Actions**: Tap to select/deselect; "+ Add project" button for manual entry; "Skip for now" link. |
| **4. Red-Flag Keywords**  | Suggested chips + manual entry | **Header**: "What words signal 'drop everything'? We'll treat these as urgent."<br>**Body**: Show default keywords (e.g., "urgent", "ASAP", "incident", "outage", "escalation", "deadline") plus 3–5 suggested from user's recent emails.<br>**Actions**: Tap to select/deselect; "+ Add keyword" for manual entry; "Skip for now" link.                       |
| **5. Confirmation**       | Summary screen                 | "Here's your setup:" list VIPs, topics, keywords. "You can change these anytime in Settings." Button: **Start My First Briefing**.                                                                                                                                                                                                                             |
| **6. First Briefing**     | Audio starts                   | System generates and plays the first podcast-style briefing using the personalization just configured (or defaults if skipped).                                                                                                                                                                                                                                |

**Quick Start behavior (skip Steps 2–5)**:

- Use **default red-flag patterns** (escalation language, deadlines, recent
  high-velocity threads).
- Infer VIPs from top 3 most-frequent recent correspondents (auto-selected, can
  be changed later).
- Infer topics from thread clustering.
- Prompt user after the first briefing: "Want to fine-tune your VIPs and
  keywords?" (link to Settings).

**Second account connection** (Outlook + Gmail):

- After the first account is set up, user can add a second account from
  Settings.
- New account triggers a mini-onboarding: "We found new contacts and topics from
  your Gmail. Review VIPs?" (optional).

### 4.3 Briefing Generation ("Podcast-Style Narrative")

15. The system must generate an audio briefing that prioritizes **Red Flags**
    before non-urgent items.
16. The system must group briefing content by **Topic/Project** (model-driven
    clustering with user-friendly headings).
17. The system must synthesize email content into concise narrative segments,
    avoiding mechanical reading of subject lines unless necessary for
    disambiguation.
18. The system must reference the number of items per topic (e.g., “3 urgent
    items about Riverside Bridge”) and provide a short rationale for why they
    are urgent when possible (e.g., deadline, escalation language, VIP sender,
    meeting proximity).
19. The system must adapt the total briefing length to the volume and severity
    of Red Flags detected (rather than targeting a fixed duration).
20. The system must allow the user to request deeper detail on-demand (e.g., “go
    deeper on Riverside Bridge”).

### 4.4 Red Flags Detection

21. The system must compute a **Red Flag score** per email/thread using a
    combination of signals.
22. At minimum, the system should consider:

- Time sensitivity (recent messages, stated deadlines, “ASAP”, “urgent”, etc.).
- Sender importance (explicit VIP list + inferred importance over time).
- Thread velocity (multiple replies, escalations).
- Calendar proximity (meeting or operational event relevance).
- User actions (previously flagged topics, follow-ups).

23. The system must provide a short “why this is a red flag” explanation when
    the user asks.
24. The system must allow the user to override relevance via voice commands
    (e.g., “prioritize Bob Smith”, “deprioritize vendor X”).

### 4.5 Voice UX & Barge-in Interaction

#### 4.5.1 Wake & Activation Modes

25. The system must support **three configurable activation modes** for
    barge-in: | Mode | How it works | Default |
    |------|--------------|---------| | **Push-to-talk (PTT)** | User taps a
    large on-screen button or hardware button (e.g., steering wheel, Bluetooth
    remote) to activate listening. Briefing pauses while held/tapped. | ✅
    Default | | **Wake word** | User says a configurable wake phrase (default:
    "Hey Briefing") to activate. System listens for wake word in low-power mode
    while TTS plays. | Opt-in | | **Always listening** | System continuously
    listens for commands; no wake word needed. Higher battery/CPU usage; best
    for short sessions. | Opt-in |
26. The user must be able to switch modes in Settings. The app must clearly
    indicate the current mode (e.g., mic icon state).

#### 4.5.2 Barge-in Behavior

27. The system must support a **barge-in** architecture that allows the user to
    interrupt audio playback at any time via the active wake mode.
28. When interrupted, the system must:

- Immediately pause the briefing audio.
- Play a short acknowledgment tone (< 300 ms) to confirm listening has started.
- Listen for the user's command (with a timeout of ~5 seconds of silence).
- Confirm the command intent with a **brief spoken confirmation** (see
  Confirmation Verbosity below).
- Execute the command.
- Resume the briefing from a sensible point (default: resume where left off;
  user can say "start over" or "next topic").

#### 4.5.3 Supported Voice Commands (Launch)

29. The system must support the following voice commands at launch:

- **Mute notifications** from a sender/vendor.
- **Prioritize** a person (VIP).
- **Create folder/label** and (where supported) move/apply to messages or a
  topic cluster.
- **Mark read/unread**.
- **Flag/follow-up/remind me later**.
- **Summarize a specific thread**.
- **Search** (e.g., "find the Riverside Bridge email").
- **Undo** the last action.
- **Navigation**: "skip", "next topic", "go back", "repeat that", "stop",
  "pause", "resume".

#### 4.5.4 Barge-in Failure Modes & Recovery

30. The system must handle the following failure modes gracefully:

| Failure                                                                             | System Response                                                                                                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice not recognized** (ASR returns empty or very low confidence)                 | "I didn't catch that. Could you say it again?" (allow up to 2 retries, then: "No problem—I'll continue the briefing. Interrupt me anytime.") |
| **Command misinterpreted** (user says "move to Alpha", system hears "move to Alfa") | Confirm before executing: "Move 3 emails to the Alfa folder—is that right?" User can say "no" to cancel and re-try.                          |
| **Intent unclear** (ASR succeeded but intent parser can't map to a command)         | "I'm not sure what you'd like me to do. You can say things like 'prioritize Bob' or 'create a folder called Projects'."                      |
| **Provider API failure** during command execution                                   | "I couldn't complete that action right now—I'll keep trying in the background." (Queue for retry; see 4.11.)                                 |

#### 4.5.5 Conflicting or Compound Commands

31. If the user issues **multiple commands in one utterance** (e.g., "Prioritize
    Bob and mute Sarah"):

- The system must parse and execute commands sequentially.
- Confirm each: "Got it—Bob is now a VIP, and I've muted Sarah."

32. If commands **conflict** (e.g., "Prioritize Bob" immediately followed by
    "Mute Bob"):

- The system must execute in order (last command wins for the same target).
- Confirm the net result: "Bob is now muted. He was briefly a VIP—want me to
  undo that?"

33. If a command is **ambiguous in scope** (e.g., "Mark these as read"—which
    emails?):

- Default to the **current topic/cluster** being discussed in the briefing.
- Confirm scope: "I'll mark the 4 Riverside Bridge emails as read—okay?"

#### 4.5.6 Disambiguation (Multiple Matches)

34. When a voice command references an ambiguous target (e.g., "Bob" matches Bob
    Smith and Bob Jones):

- The system must prompt with the **top 2–3 options** (safety: limit choices
  while driving).
- Example: "I found two Bobs—Bob Smith from Facilities, or Bob Jones from
  Finance?"
- User responds with a short identifier ("Smith" / "Facilities" / "the first
  one").
- If still ambiguous after one clarification, offer to show a list on-screen
  (for walking mode) or ask the user to be more specific.

35. Disambiguation prompts must be **concise** (< 10 seconds of audio) to
    minimize cognitive load.

#### 4.5.7 Confirmation Verbosity

36. The system must use **adaptive confirmation verbosity** based on action risk
    and user preference:

| Action Risk                                                | Default Confirmation                                       | Example                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| **Low risk** (mark read, flag, search)                     | Short: "Done." / "Flagged."                                | —                                           |
| **Medium risk** (move to folder, mute sender)              | Medium: state what was done + count                        | "Moved 3 emails to Project Alpha."          |
| **High risk** (create folder, prioritize/deprioritize VIP) | Full: state action + ask for confirmation before executing | "I'll add Sarah to your VIP list—go ahead?" |

37. The user must be able to set a global verbosity preference in Settings:

- **Concise** (minimal confirmations, "Done" for most actions).
- **Standard** (default, as above).
- **Verbose** (always state full action + confirmation).

#### 4.5.8 Language & Accent Support

38. At launch, the system must support **English** with recognition models tuned
    for:

- US English (en-US) — default.
- UK English (en-GB).
- Indian English (en-IN).
- Australian English (en-AU).

39. The user must be able to select their preferred English variant in Settings;
    the system should also auto-detect based on device locale.
40. Support for additional languages (Spanish, French, etc.) is **out of scope
    for MVP** but should be architected for future expansion (i18n-ready
    strings, pluggable ASR/TTS models).

### 4.6 Safety-First Policies (Driving / In Motion)

41. The system must be operable in a **voice-first** manner (no required screen
    interaction for core flows).
42. The system must keep prompts short and limit choices while in motion (e.g.,
    offer top 2–3 disambiguation options).
43. The system must support a "quiet mode" that reduces
    interruptions/notifications during motion.
44. The system must apply a **confirmation policy** for potentially risky
    actions:

- Required confirmation for actions that could cause loss of information or high
  risk (e.g., delete, send).
- For this PRD's launch scope, delete and send are not required; draft creation
  is preferred.

45. The system must provide an emergency stop phrase (e.g., "stop" / "cancel")
    that immediately halts audio and cancels the current action.

### 4.7 Voice-to-Draft & Desktop Sync ("Drafts Pending Review")

46. The system must allow the user to dictate an email reply via voice,
    including multi-sentence, complex responses.
47. The system must create the response as an **email draft inside
    Outlook/Gmail** (provider-native drafts).
48. The system must tag drafts created by the assistant as **Drafts Pending
    Review** in the desktop application UI.
49. The system must sync drafts to a **desktop application** where the user can:

- Review and edit drafts.
- View the original thread context.
- Approve sending (manual send).

50. The system must never send an email automatically without an explicit user
    action in the desktop application (safety-first default).
51. The system must support "draft to multiple recipients" only if the user
    explicitly dictates or confirms recipients.

### 4.8 Notifications & Preferences

52. The system must allow the user to mute notifications from specific
    senders/vendors via voice.
53. The system must allow the user to configure VIPs and priority topics.
54. The system must allow the user to configure briefing cadence:

- On-demand briefing (default).
- Optional periodic "red flag alerts" (opt-in; safety constraints apply).

### 4.9 Observability & User Trust

55. The system must provide a "source trace" on desktop for each summarized item
    (which emails/threads contributed).
56. The system must provide a lightweight way to correct the system (e.g., "this
    is not urgent" / "this is urgent") and learn from it.

### 4.10 Data Privacy, Storage & Encryption

#### 4.10.1 Voice Recordings & Transcripts

57. The system must **not persist raw voice recordings** beyond the duration
    needed for ASR (speech-to-text) processing. Once transcription is complete,
    the audio buffer must be discarded.
58. Voice transcripts (the text output of ASR) must be:

- Used only for intent parsing and command execution.
- Stored **only if required for audit trail** (see 4.12); otherwise discarded
  after processing.
- If stored, encrypted at rest and subject to configurable retention (see
  below).

59. The system must provide a user-visible setting to **opt out of transcript
    storage** entirely (default: no storage).

#### 4.10.2 Email Content & Summaries

60. Email content fetched from Outlook/Gmail must be processed in-memory for
    briefing generation and **not persisted** in the app's own storage beyond
    the active session, except:

- Metadata required for red-flag scoring and topic clustering (sender, subject
  line, timestamp, thread ID) may be cached locally with encryption.
- User preferences (VIPs, keywords, muted senders) are stored locally and
  encrypted.

61. AI-generated summaries:

- Must **not be persisted by default**.
- If the user enables "Briefing History" (optional feature), summaries may be
  stored locally (encrypted) for up to a configurable retention period (default:
  7 days).
- Summaries are never uploaded to cloud storage unless explicitly required for
  sync (e.g., desktop app); in that case, end-to-end encryption applies.

62. Drafts created via voice-to-draft are stored in the **provider's native
    draft folder** (Outlook/Gmail), not in the app's own storage. The app stores
    only a reference (draft ID) for the "Drafts Pending Review" view.

#### 4.10.3 Encryption

63. All data in transit must use **TLS 1.2+** (HTTPS for API calls, secure
    WebSocket for streaming audio if applicable).
64. All locally cached data (metadata, preferences, optional
    summaries/transcripts) must be encrypted at rest using platform-standard
    encryption:

- iOS: Data Protection (NSFileProtectionComplete or CompleteUnlessOpen).
- Android: EncryptedSharedPreferences / EncryptedFile (Jetpack Security).
- Desktop: OS keychain for secrets; AES-256 for local caches.

65. OAuth tokens and refresh tokens must be stored in the platform's secure
    credential store (Keychain / Credential Manager) and never written to
    plain-text storage.

#### 4.10.4 User Control & Transparency

66. The system must provide a **Privacy Dashboard** in Settings where the user
    can:

- See what data is stored locally and for how long.
- Delete cached metadata, summaries, and transcripts on demand ("Clear My
  Data").
- View and revoke connected account permissions (link to provider's app
  permissions page).

67. The system must display a clear privacy notice during onboarding summarizing
    data handling practices.

### 4.11 Network Resilience & Error Handling

#### 4.11.1 Connectivity Loss During Briefing

68. If network connectivity drops **mid-briefing**:

- The system must continue playing any already-buffered audio segments without
  interruption.
- Once the buffer is exhausted, the system must pause and notify the user: "I've
  lost connectivity. I'll resume when you're back online."
- When connectivity is restored, the system must automatically resume from where
  it paused (or offer to restart the current topic).

69. The system must pre-fetch and buffer the next 1–2 briefing segments while
    playing the current one to minimize mid-briefing interruptions.

#### 4.11.2 Connectivity Loss During Commands

70. If network drops while executing a voice command (e.g., "move to folder"):

- The system must queue the action locally.
- When connectivity is restored, the system must retry the action and confirm:
  "I've now moved those emails to Project Alpha."
- If retry fails after 3 attempts, the system must notify the user and add the
  failed action to a "Pending Actions" list visible in Settings.

#### 4.11.3 OAuth Token Expiration & Refresh

71. The system must handle OAuth token expiration gracefully:

- Use refresh tokens to obtain new access tokens automatically (silent refresh).
- If refresh fails (e.g., token revoked, password changed), the system must:
  - Notify the user: "Your Outlook session has expired. Please reconnect your
    account."
  - Pause any briefing/sync and surface a one-tap reconnect flow.
  - Never crash or hang silently.

72. The system must proactively refresh tokens before expiration when possible
    (e.g., refresh if token expires within 5 minutes and the app is active).

#### 4.11.4 Email Sync Failures

73. If initial email sync fails (e.g., API rate limit, server error):

- The system must display a clear error message: "Couldn't sync your inbox. Tap
  to retry or check your connection."
- The system must offer a **Retry** button and, after repeated failures, suggest
  checking account permissions.

74. If sync fails for one account but succeeds for another (Outlook + Gmail),
    the system must:

- Proceed with the available account.
- Notify the user: "I couldn't reach your Gmail. Your briefing includes only
  Outlook for now."

75. The system must log sync errors (without PII) for diagnostics and surface
    them in a "Sync Status" indicator in Settings.

### 4.12 Undo & Audit Trail

#### 4.12.1 Undo Mechanism

76. The system must support an **undo** capability for organizing actions taken
    via voice:

- After executing an action (e.g., "Moved 5 emails to Project Alpha"), the
  system must offer a brief undo window: "Say 'undo' within 10 seconds to
  reverse this."
- Undo must reverse the action at the provider level (move emails back, remove
  label, etc.).

77. The system must support a **batch undo** via the desktop app:

- The "Session Activity" view (see Audit Trail below) must allow the user to
  select and undo multiple actions from a session.
- Batch undo is available for up to 24 hours after the session (or until the
  emails are modified by other means).

78. If an undo is not possible (e.g., provider doesn't support it, email already
    deleted externally), the system must notify the user: "I couldn't undo that
    action because the email was already changed."

#### 4.12.2 Audit Trail (Session Activity Log)

79. The system must maintain an **audit trail** of all actions taken during each
    briefing session, including:

- Timestamp.
- Action type (e.g., "moved to folder", "marked as VIP", "created draft").
- Target (email subject snippet, sender, folder name).
- Outcome (success / failed / undone).

80. The audit trail must be viewable in the desktop app under "Session Activity"
    (per-session log) and "All Activity" (filterable history).
81. The audit trail must be stored locally (encrypted) and retained for a
    configurable period (default: 30 days).
82. Enterprise deployments may require exporting the audit trail (e.g., CSV) for
    compliance; the system should support this as an admin-configurable option.

## 5. Non-Goals (Out of Scope)

- Full email composition and **sending via voice while driving** (out of scope
  for MVP; desktop approval required).
- Destructive email operations (permanent delete) during motion.
- Slack/Teams messaging integration (explicitly out of scope for now; email +
  calendar only).
- Advanced multi-user delegation/shared mailbox workflows (unless later required
  by enterprise customers).
- Deep infotainment/OEM native vehicle integrations (launch target is standalone
  mobile app).

## 6. Design Considerations (Optional)

- **Audio briefing UX**:
  - Start with a short headline: “Here are your top red flags.”
  - Then proceed topic-by-topic with short segments and audible transitions.
  - Support “skip”, “next topic”, “repeat that”.
- **In-motion UI**:
  - Minimal, large controls only when needed (e.g., push-to-talk).
  - Default to screen-off operation; provide a “walking mode” that can
    optionally show more detail.
- **Desktop app**:
  - Dedicated “Drafts Pending Review” inbox/folder view with filters by topic,
    sender, and urgency.
  - Each draft shows: summary, original thread, red-flag rationale, and an
    “approve/send” button.

## 7. Technical Considerations (Optional)

- **Provider integrations**:
  - Outlook: Microsoft Graph APIs for mail, calendar, and drafts.
  - Gmail: Gmail API for mail and drafts; Google Calendar API for calendar
    context.
- **Barge-in architecture**:
  - Full-duplex audio: allow listening while TTS plays, with immediate
    interruption.
  - Latency targets are important; consider streaming ASR + incremental intent
    parsing.
- **Topic clustering**:
  - Use thread IDs and subject normalization as anchors, then semantic
    clustering for project/topic grouping.
- **Safety and compliance**:
  - Enterprise needs may include SSO, audit logs, admin controls, and retention
    policies.
  - Minimize data stored; prefer ephemeral processing where possible and
    explicit retention controls.

## 8. Success Metrics

- **Time-to-triage**: Median time for a user to reach “inbox triaged” state
  (unread reduced + key items flagged) after a commute/session.
- **Time-to-first-value (Day-1)**: Time from first app open to the user
  completing a first briefing that contains at least one user-confirmed “useful”
  red flag.
- **Red flag precision (user-rated)**: % of red-flag items the user confirms as
  truly urgent/important.
- **Inbox organization outcome**: % of sessions where user applies at least one
  organizational action (folder/label/VIP/follow-up).
- **Draft adoption**: # of voice-created drafts per session and % that are
  eventually sent after desktop review.
- **User satisfaction**: CSAT score for briefing usefulness and trust
  (especially for summaries + red flag rationales).

## 9. Open Questions

### Resolved in This PRD (for reference)

- ~~Confirmation policy details~~ → See 4.5.7 (adaptive verbosity by risk
  level).
- ~~Retention of voice/summaries~~ → See 4.10 (default: no storage; opt-in with
  configurable retention).
- ~~Wake word / barge-in mechanism~~ → See 4.5.1 (three modes: PTT default, wake
  word opt-in, always-listening opt-in).

### Still Open

1. **Product naming**: What is the official product/feature name to use in UI
   and docs?
2. **Red Flag definition**: Are there specific operational "red flag" categories
   to hard-code (e.g., safety incidents, outages, customer escalations), or is
   it purely learned + configurable?
3. **Resume behavior after barge-in**: Resume exactly where left off vs.
   re-summarize the current topic after executing a command? (Current default:
   resume where left off.)
4. **Walking vs driving modes**: Do we need explicit motion detection and
   different UX rules (e.g., more verbose prompts when walking, show on-screen
   lists)?
5. **Enterprise controls**: Do we need SSO (SAML/OIDC), admin-managed policies,
   or data residency requirements for initial customers?
6. **Multi-account merging**: How should briefing unify Outlook + Gmail—single
   combined timeline or separate sections per account?
7. **Desktop app target platform**: Windows only (common for Outlook desktop) vs
   macOS as well?
8. **Directory/contacts access**: For enterprise Outlook users, will we have
   permission to read org directory/contacts for VIP suggestions, and are there
   constraints (e.g., tenant admin approval)?
9. **Keyword setup**: Should we start with a default keyword pack tailored to
   operations (incidents/outages/safety/vendor escalations), and should admins
   be able to pre-configure it for teams?
10. **Undo time window**: Is 10 seconds enough for the voice undo prompt, or
    should it be longer? Should batch undo on desktop be available beyond 24
    hours?
11. **Offline briefing**: Should we support a limited offline mode (cache
    last-synced briefing for replay if connectivity is lost before sync)?
12. **Audit trail export**: Which export formats are needed for enterprise
    compliance (CSV, JSON, PDF)?
