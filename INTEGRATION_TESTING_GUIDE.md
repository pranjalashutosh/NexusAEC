# NexusAEC Intelligence System - Integration Testing Guide

This guide walks you through testing the complete intelligence system with real Gmail data, OpenAI, Supabase, and Redis.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [API Keys & Credentials](#api-keys--credentials)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Gmail OAuth Setup](#gmail-oauth-setup)
5. [Environment Configuration](#environment-configuration)
6. [Testing the Full Pipeline](#testing-the-full-pipeline)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- [ ] Google Cloud Platform account (for Gmail API)
- [ ] OpenAI account (for GPT-4o)
- [ ] Supabase account (for vector storage)
- [ ] Redis hosting (Upstash, Redis Cloud, or local)

### Required Tools
- [ ] Node.js 18+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] Git
- [ ] Text editor (VS Code recommended)

---

## API Keys & Credentials

### 1. OpenAI API Key

**Steps:**
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create new secret key**
5. Copy the key immediately (you won't see it again)
6. **Cost:** GPT-4o is ~$5 per 1M input tokens, $15 per 1M output tokens

**Save as:** `OPENAI_API_KEY`

### 2. Google Cloud Platform & Gmail API

**Steps:**

1. **Create a Google Cloud Project:**
   - Go to https://console.cloud.google.com/
   - Click **Select a project** → **New Project**
   - Name it "NexusAEC Test" or similar
   - Click **Create**

2. **Enable Gmail API:**
   - In the GCP Console, go to **APIs & Services** → **Library**
   - Search for "Gmail API"
   - Click **Enable**

3. **Create OAuth 2.0 Credentials:**
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - If prompted, configure OAuth consent screen:
     - User Type: **External** (for testing)
     - App name: "NexusAEC Test"
     - User support email: Your email
     - Developer contact: Your email
     - Click **Save and Continue**
     - Scopes: Skip for now
     - Test users: Add your Gmail address
     - Click **Save and Continue**
   - Back to Create OAuth client ID:
     - Application type: **Desktop app** (or **Web application** if you prefer)
     - Name: "NexusAEC Desktop Client"
     - Click **Create**
   - Download the JSON file (credentials.json)
   - **Important:** Keep this file secure!

4. **Add Gmail Scopes:**
   - The system needs these scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
   - These will be requested during OAuth flow

**Save as:**
- `GOOGLE_CLIENT_ID` (from credentials.json)
- `GOOGLE_CLIENT_SECRET` (from credentials.json)
- `GOOGLE_REDIRECT_URI` (usually `http://localhost:3000/auth/callback`)

### 3. Supabase Setup

**Steps:**

1. **Create Supabase Project:**
   - Go to https://supabase.com/
   - Click **Start your project**
   - Sign up or log in
   - Click **New project**
   - Organization: Create or select one
   - Name: "nexusaec-test"
   - Database Password: Generate a strong password (save it!)
   - Region: Choose closest to you
   - Plan: Free tier is fine for testing
   - Click **Create new project**
   - Wait ~2 minutes for provisioning

2. **Enable pgvector Extension:**
   - In your Supabase dashboard, go to **SQL Editor**
   - Click **New query**
   - Run this SQL:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   - Click **Run**

3. **Create Documents Table:**
   - In SQL Editor, run this:
   ```sql
   -- Create documents table
   CREATE TABLE IF NOT EXISTS documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     content TEXT NOT NULL,
     embedding vector(1536),
     metadata JSONB,
     source_type TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Create index for vector similarity search
   CREATE INDEX IF NOT EXISTS documents_embedding_idx
   ON documents USING ivfflat (embedding vector_cosine_ops)
   WITH (lists = 100);

   -- Create index for source_type filtering
   CREATE INDEX IF NOT EXISTS documents_source_type_idx
   ON documents(source_type);

   -- Create index for metadata filtering
   CREATE INDEX IF NOT EXISTS documents_metadata_idx
   ON documents USING gin(metadata);
   ```
   - Click **Run**

4. **Get Connection Details:**
   - Go to **Project Settings** → **API**
   - Copy these values:
     - **Project URL** (e.g., `https://xxxxx.supabase.co`)
     - **Project API keys** → **anon public** key
   - Go to **Project Settings** → **Database**
   - Copy **Connection string** → **URI** (direct connection)
     - It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

**Save as:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`

### 4. Redis Setup

**Option A: Upstash (Recommended for testing - Free tier)**

1. Go to https://upstash.com/
2. Sign up or log in
3. Click **Create Database**
4. Name: "nexusaec-sessions"
5. Type: **Regional**
6. Region: Choose closest to you
7. Click **Create**
8. Copy connection details:
   - **UPSTASH_REDIS_REST_URL**
   - **UPSTASH_REDIS_REST_TOKEN**

**Option B: Redis Cloud**

1. Go to https://redis.com/try-free/
2. Sign up and create free database
3. Copy connection details

**Option C: Local Redis**

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Windows
# Download from https://redis.io/download
```

**Save as:**
- `REDIS_URL` (format: `redis://localhost:6379` or Upstash URL)
- `REDIS_TOKEN` (if using Upstash)

---

## Infrastructure Setup

### 1. Install Dependencies

```bash
cd /Users/ashutoshpranjal/nexusAEC
pnpm install
```

### 2. Build Packages

```bash
# Build shared types
cd packages/shared-types
pnpm build

# Build intelligence package
cd ../intelligence
pnpm build

# Build connectors
cd ../connectors
pnpm build
```

---

## Gmail OAuth Setup

### 1. Create Gmail Connector Configuration

Create a file: `packages/connectors/test-gmail-auth.ts`

```typescript
import { GmailConnector } from './src/gmail-connector';
import * as fs from 'fs/promises';
import * as path from 'path';

async function authenticateGmail() {
  const connector = new GmailConnector({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });

  console.log('Starting Gmail authentication...');
  console.log('');

  const authUrl = connector.getAuthorizationUrl();
  console.log('Please visit this URL to authorize:');
  console.log(authUrl);
  console.log('');
  console.log('After authorizing, you will be redirected to a URL.');
  console.log('Copy the ENTIRE redirect URL and paste it here:');

  // For testing, we'll use readline to get the callback URL
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    readline.question('Paste redirect URL: ', async (callbackUrl: string) => {
      readline.close();

      try {
        await connector.handleCallback(callbackUrl);
        console.log('');
        console.log('✓ Authentication successful!');

        // Save credentials for later use
        const credentials = await connector.getCredentials();
        await fs.writeFile(
          path.join(__dirname, 'gmail-credentials.json'),
          JSON.stringify(credentials, null, 2)
        );

        console.log('✓ Credentials saved to gmail-credentials.json');
        resolve(connector);
      } catch (error) {
        console.error('✗ Authentication failed:', error);
        reject(error);
      }
    });
  });
}

authenticateGmail().catch(console.error);
```

### 2. Update Gmail Connector (if needed)

Check if `packages/connectors/src/gmail-connector.ts` has the `getCredentials()` method. If not, add it:

```typescript
/**
 * Get current credentials (for persistence)
 */
async getCredentials() {
  return {
    access_token: this.accessToken,
    refresh_token: this.refreshToken,
    expiry_date: this.tokenExpiry?.getTime(),
  };
}
```

---

## Environment Configuration

### 1. Create Root .env File

Create: `/Users/ashutoshpranjal/nexusAEC/.env`

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxx

# Google Gmail
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_DB_URL=postgresql://postgres:xxxxx@db.xxxxx.supabase.co:5432/postgres

# Redis
REDIS_URL=redis://localhost:6379
# Or for Upstash:
# REDIS_URL=https://xxxxx.upstash.io
# REDIS_TOKEN=xxxxx

# Preferences Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
PREFERENCES_ENCRYPTION_KEY=xxxxx

# Paths
PREFERENCES_PATH=./data/preferences
FEEDBACK_PATH=./data/feedback
```

### 2. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `PREFERENCES_ENCRYPTION_KEY`.

---

## Testing the Full Pipeline

### 1. Create Integration Test Script

Create: `/Users/ashutoshpranjal/nexusAEC/packages/intelligence/test-integration.ts`

```typescript
/**
 * Integration Test - Full Pipeline with Real Data
 */

import { GmailConnector } from '@nexus-aec/connectors';
import {
  KeywordMatcher,
  VipDetector,
  ThreadVelocityDetector,
  CalendarProximityDetector,
  RedFlagScorer,
  TopicClusterer,
  RedisSessionStore,
  SupabaseVectorStore,
  LLMClient,
  EmailSummarizer,
  NarrativeGenerator,
  ExplanationGenerator,
  PreferencesStore,
  FeedbackLearner,
  createInitialDriveState,
  updateDriveState,
} from './src';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '../../.env' });

async function runIntegrationTest() {
  console.log('='.repeat(80));
  console.log('NexusAEC Intelligence System - Integration Test');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Initialize Components
  console.log('Step 1: Initializing components...');

  // Gmail Connector
  const gmail = new GmailConnector({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });

  // Load saved credentials if available
  try {
    const credentialsPath = path.join(__dirname, '../connectors/gmail-credentials.json');
    const credData = await fs.readFile(credentialsPath, 'utf8');
    const credentials = JSON.parse(credData);
    await gmail.setCredentials(credentials);
    console.log('  ✓ Gmail credentials loaded');
  } catch (error) {
    console.log('  ✗ No saved credentials. Run test-gmail-auth.ts first!');
    process.exit(1);
  }

  // OpenAI Client
  const llmClient = new LLMClient({
    apiKey: process.env.OPENAI_API_KEY!,
    defaultModel: 'gpt-4o',
    rateLimiter: {
      requestsPerMinute: 60,
      tokensPerMinute: 90000,
    },
  });
  console.log('  ✓ OpenAI client initialized');

  // Supabase Vector Store
  const vectorStore = new SupabaseVectorStore({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_ANON_KEY!,
  });
  await vectorStore.initialize();
  console.log('  ✓ Supabase vector store initialized');

  // Redis Session Store
  const sessionStore = new RedisSessionStore({
    redis: {
      url: process.env.REDIS_URL!,
      token: process.env.REDIS_TOKEN,
    },
  });
  await sessionStore.connect();
  console.log('  ✓ Redis session store connected');

  // Red Flag Components
  const keywordMatcher = new KeywordMatcher();
  const vipDetector = new VipDetector();
  const velocityDetector = new ThreadVelocityDetector();
  const calendarDetector = new CalendarProximityDetector();

  const redFlagScorer = new RedFlagScorer({
    keywordMatcher,
    vipDetector,
    velocityDetector,
    calendarDetector,
  });
  console.log('  ✓ Red flag scorer initialized');

  // Topic Clusterer
  const clusterer = new TopicClusterer();
  console.log('  ✓ Topic clusterer initialized');

  // Summarizer and Generators
  const summarizer = new EmailSummarizer({ llmClient });
  const narrativeGenerator = new NarrativeGenerator({ llmClient });
  const explanationGenerator = new ExplanationGenerator({ llmClient });
  console.log('  ✓ LLM generators initialized');

  // Preferences Store
  const preferencesStore = new PreferencesStore({
    storagePath: process.env.PREFERENCES_PATH || './data/preferences',
    encryptionKey: process.env.PREFERENCES_ENCRYPTION_KEY!,
  });
  await preferencesStore.initialize();
  console.log('  ✓ Preferences store initialized');

  // Feedback Learner
  const feedbackLearner = new FeedbackLearner({
    storagePath: process.env.FEEDBACK_PATH || './data/feedback',
  });
  await feedbackLearner.initialize();
  console.log('  ✓ Feedback learner initialized');

  console.log('');

  // Step 2: Fetch Real Emails
  console.log('Step 2: Fetching unread emails from Gmail...');
  const emails = await gmail.fetchUnreadEmails({ maxResults: 20 });
  console.log(`  ✓ Fetched ${emails.length} unread emails`);
  console.log('');

  if (emails.length === 0) {
    console.log('No unread emails found. Mark some emails as unread and try again.');
    await cleanup();
    return;
  }

  // Step 3: Fetch Threads
  console.log('Step 3: Fetching email threads...');
  const threads = new Map();
  for (const email of emails) {
    if (!threads.has(email.threadId)) {
      const thread = await gmail.fetchThread(email.threadId);
      threads.set(email.threadId, thread);
    }
  }
  console.log(`  ✓ Fetched ${threads.size} unique threads`);
  console.log('');

  // Step 4: Score Emails for Red Flags
  console.log('Step 4: Scoring emails for red flags...');
  const scores = new Map();
  let flaggedCount = 0;

  for (const email of emails) {
    const thread = threads.get(email.threadId);
    const score = await redFlagScorer.scoreEmail(email, thread, {
      keywordMatches: await keywordMatcher.match(email),
      vipResult: await vipDetector.detect(email),
      velocityResult: await velocityDetector.analyze(thread),
      calendarResult: await calendarDetector.analyze(email, []), // Empty calendar for now
    });

    scores.set(email.id, score);
    if (score.isFlagged) {
      flaggedCount++;
      console.log(`  🚩 Flagged: "${email.subject}" (score: ${score.score.toFixed(2)})`);
    }
  }
  console.log(`  ✓ Scored ${emails.length} emails, ${flaggedCount} flagged`);
  console.log('');

  // Step 5: Cluster Topics
  console.log('Step 5: Clustering topics...');
  const clusterResult = clusterer.cluster(emails);
  console.log(`  ✓ Found ${clusterResult.clusters.length} topic clusters`);
  clusterResult.clusters.forEach((cluster, i) => {
    console.log(`    ${i + 1}. "${cluster.topic}" (${cluster.size} emails)`);
  });
  console.log('');

  // Step 6: Generate Summaries
  console.log('Step 6: Generating email summaries with OpenAI...');
  const summaries = new Map();
  let summaryCount = 0;

  // Summarize top 5 threads
  const topThreads = Array.from(threads.values()).slice(0, 5);
  for (const thread of topThreads) {
    try {
      const summary = await summarizer.summarizeThread(thread, { mode: 'brief' });
      summaries.set(thread.id, summary);
      summaryCount++;
      console.log(`  ✓ Summarized: "${thread.subject}"`);
      console.log(`    → ${summary.summary}`);
    } catch (error: any) {
      console.log(`  ✗ Failed to summarize "${thread.subject}": ${error.message}`);
    }
  }
  console.log(`  ✓ Generated ${summaryCount} summaries`);
  console.log('');

  // Step 7: Generate Briefing Narrative
  console.log('Step 7: Generating briefing narrative...');
  try {
    const briefingScript = await narrativeGenerator.generateBriefing(
      {
        clusters: clusterResult.clusters.slice(0, 3), // Top 3 clusters
        redFlagScores: scores,
        summaries,
        userName: 'User',
        currentTime: new Date(),
      },
      { style: 'conversational' }
    );

    console.log(`  ✓ Generated briefing with ${briefingScript.segments.length} segments`);
    console.log(`  ✓ Estimated time: ${Math.ceil(briefingScript.totalSeconds / 60)} minutes`);
    console.log('');
    console.log('  Briefing Preview:');
    briefingScript.segments.slice(0, 3).forEach((segment) => {
      console.log(`    [${segment.type.toUpperCase()}]`);
      console.log(`    ${segment.content}`);
      console.log('');
    });
  } catch (error: any) {
    console.log(`  ✗ Failed to generate briefing: ${error.message}`);
  }

  // Step 8: Generate Explanation for Top Red Flag
  console.log('Step 8: Generating explanation for top red flag...');
  const topRedFlag = Array.from(scores.entries())
    .filter(([, score]) => score.isFlagged)
    .sort((a, b) => b[1].score - a[1].score)[0];

  if (topRedFlag) {
    const [emailId, score] = topRedFlag;
    const email = emails.find((e) => e.id === emailId)!;

    try {
      const explanation = await explanationGenerator.explain(score, email, {
        style: 'detailed',
      });

      console.log(`  ✓ Explanation for: "${email.subject}"`);
      console.log(`  ✓ Urgency: ${explanation.urgencyLevel}`);
      console.log(`  → ${explanation.explanation}`);
      console.log('');
      console.log('  Key Factors:');
      explanation.keyFactors.forEach((factor) => {
        console.log(`    - ${factor}`);
      });
      if (explanation.suggestedAction) {
        console.log(`  💡 Suggested Action: ${explanation.suggestedAction}`);
      }
    } catch (error: any) {
      console.log(`  ✗ Failed to generate explanation: ${error.message}`);
    }
  } else {
    console.log('  ℹ No red flags to explain');
  }
  console.log('');

  // Step 9: Persist Session State in Redis
  console.log('Step 9: Persisting session state in Redis...');
  const sessionId = `test-session-${Date.now()}`;
  const driveState = createInitialDriveState({
    userId: 'test-user',
    sessionId,
    briefingData: {
      clusters: clusterResult.clusters,
      totalEmails: emails.length,
      flaggedEmails: flaggedCount,
    },
  });

  await sessionStore.saveSession(sessionId, driveState);
  console.log(`  ✓ Saved session ${sessionId} to Redis`);

  // Retrieve it back
  const retrieved = await sessionStore.getSession(sessionId);
  console.log(`  ✓ Retrieved session from Redis`);
  console.log(`    - Status: ${retrieved?.status}`);
  console.log(`    - Flagged emails: ${retrieved?.briefingData.flaggedEmails}`);
  console.log('');

  // Step 10: Test Preferences
  console.log('Step 10: Testing preferences store...');

  // Add a VIP
  await preferencesStore.addVip({
    identifier: 'ceo@example.com',
    name: 'CEO',
    note: 'Executive leadership',
  });
  console.log('  ✓ Added VIP to preferences');

  // Add custom keyword
  await preferencesStore.addKeyword({
    pattern: 'extremely urgent',
    isRegex: false,
    weight: 0.95,
    category: 'urgency',
  });
  console.log('  ✓ Added custom keyword');

  const prefs = await preferencesStore.getPreferences();
  console.log(`  ✓ Preferences: ${prefs.vips.length} VIPs, ${prefs.keywords.length} keywords`);
  console.log('');

  // Step 11: Test Feedback Learning
  console.log('Step 11: Testing feedback learning...');

  // Record some feedback
  if (topRedFlag) {
    const [emailId, score] = topRedFlag;
    await feedbackLearner.recordFeedback({
      emailId,
      type: 'correct',
      originalScore: score.score,
      signals: {
        keyword: score.signalBreakdown.find((s) => s.signal === 'keyword')?.rawScore,
        vip: score.signalBreakdown.find((s) => s.signal === 'vip')?.rawScore,
        velocity: score.signalBreakdown.find((s) => s.signal === 'velocity')?.rawScore,
        calendar: score.signalBreakdown.find((s) => s.signal === 'calendar')?.rawScore,
      },
      note: 'System correctly identified this as urgent',
    });
    console.log('  ✓ Recorded feedback');

    const stats = await feedbackLearner.getStats();
    console.log(`  ✓ Learning stats: ${stats.totalFeedback} feedback, ${(stats.accuracy * 100).toFixed(1)}% accuracy`);
  }
  console.log('');

  // Final Summary
  console.log('='.repeat(80));
  console.log('Integration Test Complete! ✓');
  console.log('='.repeat(80));
  console.log('');
  console.log('Summary:');
  console.log(`  • Fetched ${emails.length} emails from Gmail`);
  console.log(`  • Processed ${threads.size} threads`);
  console.log(`  • Identified ${flaggedCount} red flags`);
  console.log(`  • Created ${clusterResult.clusters.length} topic clusters`);
  console.log(`  • Generated ${summaryCount} AI summaries`);
  console.log(`  • Persisted state in Redis ✓`);
  console.log(`  • Stored preferences encrypted ✓`);
  console.log(`  • Learning from feedback ✓`);
  console.log('');

  // Cleanup
  async function cleanup() {
    await sessionStore.disconnect();
    console.log('Disconnected from Redis');
  }

  await cleanup();
}

// Run the test
runIntegrationTest().catch((error) => {
  console.error('');
  console.error('✗ Integration test failed:');
  console.error(error);
  process.exit(1);
});
```

### 2. Add Missing Methods to Gmail Connector

Update `packages/connectors/src/gmail-connector.ts` to add the `setCredentials` method if it doesn't exist:

```typescript
/**
 * Set credentials (for loading saved credentials)
 */
async setCredentials(credentials: {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}) {
  this.accessToken = credentials.access_token;
  this.refreshToken = credentials.refresh_token;
  if (credentials.expiry_date) {
    this.tokenExpiry = new Date(credentials.expiry_date);
  }
  this.isAuthenticated = true;
}
```

### 3. Run the Tests

```bash
# Step 1: Authenticate with Gmail (one-time)
cd packages/connectors
npx ts-node test-gmail-auth.ts

# Follow the prompts to authorize
# This will save credentials to gmail-credentials.json

# Step 2: Run full integration test
cd ../intelligence
npx ts-node test-integration.ts
```

---

## Expected Output

When successful, you should see:

```
================================================================================
NexusAEC Intelligence System - Integration Test
================================================================================

Step 1: Initializing components...
  ✓ Gmail credentials loaded
  ✓ OpenAI client initialized
  ✓ Supabase vector store initialized
  ✓ Redis session store connected
  ✓ Red flag scorer initialized
  ✓ Topic clusterer initialized
  ✓ LLM generators initialized
  ✓ Preferences store initialized
  ✓ Feedback learner initialized

Step 2: Fetching unread emails from Gmail...
  ✓ Fetched 15 unread emails

Step 3: Fetching email threads...
  ✓ Fetched 12 unique threads

Step 4: Scoring emails for red flags...
  🚩 Flagged: "URGENT: Project Deadline Tomorrow" (score: 0.87)
  🚩 Flagged: "Meeting with CEO next week" (score: 0.72)
  ✓ Scored 15 emails, 2 flagged

Step 5: Clustering topics...
  ✓ Found 4 topic clusters
    1. "Project Updates" (5 emails)
    2. "Meeting Requests" (4 emails)
    3. "Newsletter" (3 emails)
    4. "Other" (3 emails)

Step 6: Generating email summaries with OpenAI...
  ✓ Summarized: "Project Status Update"
    → Project milestone 1 completed, moving to milestone 2 by Friday.
  ✓ Generated 5 summaries

[... more output ...]

================================================================================
Integration Test Complete! ✓
================================================================================

Summary:
  • Fetched 15 emails from Gmail
  • Processed 12 threads
  • Identified 2 red flags
  • Created 4 topic clusters
  • Generated 5 AI summaries
  • Persisted state in Redis ✓
  • Stored preferences encrypted ✓
  • Learning from feedback ✓
```

---

## Troubleshooting

### Gmail Authentication Issues

**Problem:** "Invalid grant" or "Token expired"
**Solution:**
- Delete `gmail-credentials.json`
- Run `test-gmail-auth.ts` again
- Make sure you're using the correct Google account

**Problem:** "Access blocked: This app's request is invalid"
**Solution:**
- Check OAuth consent screen configuration
- Make sure your email is added to test users
- Verify redirect URI matches exactly

### OpenAI Rate Limits

**Problem:** "Rate limit exceeded"
**Solution:**
- Reduce number of emails processed (change `maxResults: 20` to `maxResults: 5`)
- Add delays between API calls
- Check your OpenAI usage limits

### Supabase Connection Issues

**Problem:** "Connection refused" or "SSL error"
**Solution:**
- Verify `SUPABASE_URL` is correct (should start with `https://`)
- Check `SUPABASE_ANON_KEY` is the anon/public key, not service role key
- Ensure IP is not blocked in Supabase settings

### Redis Connection Issues

**Problem:** "ECONNREFUSED" or "Connection timeout"
**Solution:**
- If using local Redis: `redis-cli ping` to test
- If using Upstash: Check URL and token are correct
- Verify Redis is actually running

### Missing Environment Variables

**Problem:** "undefined is not a valid API key"
**Solution:**
- Double-check all variables in `.env` file
- Make sure `.env` is in the correct location
- No spaces around `=` in `.env` file
- Restart terminal after editing `.env`

### TypeScript Compilation Errors

**Problem:** "Cannot find module" or type errors
**Solution:**
```bash
# Rebuild everything
cd /Users/ashutoshpranjal/nexusAEC
pnpm install
pnpm -r build
```

---

## Cost Estimates

### OpenAI (GPT-4o)
- **Input:** ~$5 per 1M tokens
- **Output:** ~$15 per 1M tokens
- **Estimate for 20 emails:**
  - Summaries: ~500 tokens input, ~100 tokens output per email = $0.02
  - Briefing narrative: ~2000 tokens input, ~500 tokens output = $0.02
  - Explanations: ~300 tokens input, ~150 tokens output = $0.01
  - **Total per test run:** ~$0.05

### Supabase
- **Free tier:** 500MB database, 2GB bandwidth
- **Should be fine for testing**

### Redis (Upstash)
- **Free tier:** 10,000 commands/day
- **Should be fine for testing**

---

## Next Steps

After successful testing:

1. **Add More VIPs:** Use `preferencesStore.addVip()` to add important contacts
2. **Customize Keywords:** Add domain-specific keywords with `preferencesStore.addKeyword()`
3. **Provide Feedback:** Use `feedbackLearner.recordFeedback()` to improve scoring
4. **Test Calendar Integration:** Add calendar events to test proximity detection
5. **Scale Up:** Increase email count to test with larger dataset
6. **Build UI:** Create a web interface to visualize the intelligence

---

## Security Notes

⚠️ **Important Security Reminders:**

1. **Never commit credentials:**
   - Add `gmail-credentials.json` to `.gitignore`
   - Add `.env` to `.gitignore` (should already be there)

2. **Rotate keys regularly:**
   - OpenAI API keys
   - Supabase keys
   - OAuth credentials

3. **Use environment-specific credentials:**
   - Development vs Production
   - Different Supabase projects

4. **Keep encryption keys secure:**
   - Back up `PREFERENCES_ENCRYPTION_KEY` securely
   - If lost, encrypted preferences cannot be recovered

---

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review error messages carefully
3. Check API quotas and limits
4. Verify all credentials are correct

Happy testing! 🚀
