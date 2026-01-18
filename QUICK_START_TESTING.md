# Quick Start: Testing NexusAEC Intelligence System

**You have everything you need!** The SQL migrations are already created. Follow these steps to test with real data.

## 🎯 What You'll Test

✅ Gmail authentication & email fetching
✅ Red flag detection with real emails
✅ Topic clustering
✅ AI summarization (OpenAI GPT-4o)
✅ Session persistence (Redis)
✅ Knowledge base storage (Supabase)

---

## Step 1: Get Your API Keys

### 1.1 OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy and save it → You'll use this as `OPENAI_API_KEY`

### 1.2 Google Cloud & Gmail API
1. Go to https://console.cloud.google.com/
2. Create a new project (e.g., "NexusAEC Test")
3. Enable **Gmail API**:
   - Go to **APIs & Services** → **Library**
   - Search "Gmail API" → Click **Enable**
4. Create OAuth credentials:
   - **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Configure consent screen if prompted:
     - User Type: **External**
     - App name: "NexusAEC Test"
     - Add your email as test user
   - Create credentials:
     - Application type: **Desktop app**
     - Name: "NexusAEC Desktop"
   - **Download JSON** (save as `google-credentials.json` in project root)
5. Extract from the JSON:
   - `client_id` → `GOOGLE_CLIENT_ID`
   - `client_secret` → `GOOGLE_CLIENT_SECRET`
   - Redirect URI: `http://localhost:3000/auth/callback`

### 1.3 Supabase
1. Go to https://supabase.com/dashboard
2. Create new project:
   - Name: "nexusaec-test"
   - Database Password: Save it!
   - Region: Closest to you
   - Wait ~2 minutes for setup
3. Get your credentials:
   - Go to **Project Settings** → **API**
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **anon public key** → `SUPABASE_ANON_KEY`

**IMPORTANT:** Your migrations will run automatically when you test!

### 1.4 Redis (Choose one option)

**Option A: Upstash (Free, Recommended)**
1. Go to https://console.upstash.com/
2. Create database: "nexusaec-sessions"
3. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**

**Option B: Local Redis**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis
```
Use `REDIS_URL=redis://localhost:6379`

---

## Step 2: Configure Environment

Create `.env` file in `/Users/ashutoshpranjal/nexusAEC/packages/intelligence/`:

```env
# OpenAI
OPENAI_API_KEY=sk-...your-key-here...

# Google/Gmail
GOOGLE_CLIENT_ID=...your-client-id...
GOOGLE_CLIENT_SECRET=...your-client-secret...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhb...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...your-service-key... # Optional, from same API page

# Redis (choose based on your option)
# For Upstash:
REDIS_URL=https://xxxxx.upstash.io
REDIS_TOKEN=AXXXXxxx...your-token...

# For local Redis:
# REDIS_URL=redis://localhost:6379
```

---

## Step 3: Run Supabase Migrations

The migrations are already created in `supabase/migrations/`. They will:
- ✅ Enable pgvector extension
- ✅ Create documents table with vector embeddings
- ✅ Create assets table with 10 seed assets
- ✅ Create user_preferences table
- ✅ Create audit_entries table
- ✅ Create match_documents function for RAG

### Apply Migrations to Your Supabase Project

**Option A: Using Supabase CLI (Recommended)**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project (you'll need Project Ref ID from Supabase dashboard)
cd /Users/ashutoshpranjal/nexusAEC
supabase link --project-ref xxxxx

# Push migrations
supabase db push
```

**Option B: Manual SQL Execution**

If you prefer manual execution:

1. Go to your Supabase dashboard → **SQL Editor**
2. Copy the content of `supabase/migrations/20240101000000_init_schema.sql`
3. Paste and run it
4. Copy the content of `supabase/migrations/20240102000000_match_documents_function.sql`
5. Paste and run it

**Verify it worked:**
```sql
-- Run this in SQL Editor
SELECT * FROM assets LIMIT 5;
```
You should see 10 sample assets (P-104, P-105, etc.)

---

## Step 4: Build the Intelligence Package

```bash
cd /Users/ashutoshpranjal/nexusAEC
pnpm install
pnpm build
```

---

## Step 5: Create Integration Test Script

Create `/Users/ashutoshpranjal/nexusAEC/packages/intelligence/test-integration.ts`:

```typescript
import 'dotenv/config';
import { GmailAdapter } from '@nexus-aec/email-providers';
import {
  RedFlagScorer,
  TopicClusterer,
  EmailSummarizer,
  NarrativeGenerator,
  LLMClient,
  SupabaseVectorStore,
  RedisSessionStore,
  PreferencesStore,
  FeedbackLearner,
  createInitialDriveState
} from './src/index';

async function testIntegration() {
  console.log('🚀 Starting NexusAEC Intelligence Integration Test\n');

  // 1. Connect to Gmail
  console.log('📧 Step 1: Connecting to Gmail...');
  const gmail = new GmailAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });

  // This will open browser for OAuth
  await gmail.authenticate();
  console.log('✅ Gmail connected!\n');

  // 2. Fetch real emails
  console.log('📬 Step 2: Fetching unread emails...');
  const emails = await gmail.fetchUnread({ maxResults: 20 });
  console.log(`✅ Found ${emails.length} unread emails\n`);

  if (emails.length === 0) {
    console.log('⚠️  No unread emails found. Send yourself some test emails first!');
    return;
  }

  // 3. Score emails for red flags
  console.log('🚩 Step 3: Scoring emails for red flags...');
  const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
  const scorer = new RedFlagScorer({});

  const scores = [];
  for (const email of emails.slice(0, 5)) { // Test first 5
    const score = await scorer.scoreEmail(email, undefined, {
      keywordMatches: [],
      isVip: false,
      hasHighVelocity: false,
      hasRelevantEvents: [],
    });
    scores.push({ email, score });
    console.log(`  - ${email.subject}: Score ${score.score.toFixed(2)} ${score.isFlagged ? '🚩' : '✅'}`);
  }
  console.log('✅ Red flag scoring complete\n');

  // 4. Cluster emails by topic
  console.log('🗂️  Step 4: Clustering emails by topic...');
  const clusterer = new TopicClusterer({});
  const clustering = clusterer.cluster(emails);
  console.log(`✅ Created ${clustering.clusters.length} topic clusters`);
  clustering.clusters.forEach(cluster => {
    console.log(`  - ${cluster.label}: ${cluster.emailIds.length} emails`);
  });
  console.log();

  // 5. Summarize threads
  console.log('📝 Step 5: Generating AI summaries...');
  const summarizer = new EmailSummarizer({ llmClient });

  const thread = await gmail.getThread(emails[0].threadId);
  const summary = await summarizer.summarizeThread(thread, { mode: 'brief' });
  console.log(`✅ Summary: "${summary.summary}"`);
  console.log(`   Tokens used: ${summary.tokensUsed}\n`);

  // 6. Generate briefing narrative
  console.log('🎙️  Step 6: Generating briefing script...');
  const narrativeGen = new NarrativeGenerator({ llmClient });
  const briefing = await narrativeGen.generateBriefing({
    clusters: clustering.clusters.slice(0, 3),
    redFlagScores: scores.map(s => s.score),
    summaries: [summary],
  }, { style: 'conversational' });

  console.log(`✅ Generated ${briefing.segments.length} script segments`);
  console.log(`   Estimated duration: ${briefing.totalSeconds}s`);
  console.log(`   First segment: "${briefing.segments[0]?.text?.slice(0, 100)}..."\n`);

  // 7. Test Redis session persistence
  console.log('💾 Step 7: Testing Redis session storage...');
  const sessionStore = new RedisSessionStore({
    redis: process.env.REDIS_TOKEN
      ? { url: process.env.REDIS_URL!, token: process.env.REDIS_TOKEN }
      : { url: process.env.REDIS_URL! }
  });

  const sessionId = 'test-session-' + Date.now();
  const driveState = createInitialDriveState({
    sessionId,
    clusters: clustering.clusters,
    redFlagScores: scores.map(s => s.score),
  });

  await sessionStore.saveSession(sessionId, driveState);
  const retrieved = await sessionStore.getSession(sessionId);
  console.log(`✅ Session saved and retrieved: ${retrieved?.sessionId}\n`);

  // 8. Test Supabase vector store
  console.log('🔍 Step 8: Testing Supabase knowledge base...');
  const vectorStore = new SupabaseVectorStore({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_ANON_KEY!,
    openaiApiKey: process.env.OPENAI_API_KEY!,
  });

  // Query for an asset
  const results = await vectorStore.search('pump station', { limit: 3 });
  console.log(`✅ Found ${results.length} relevant assets:`);
  results.forEach(result => {
    console.log(`  - ${result.metadata.name} (similarity: ${result.similarity.toFixed(3)})`);
  });
  console.log();

  // 9. Test preferences
  console.log('⚙️  Step 9: Testing user preferences...');
  const preferences = new PreferencesStore({
    storagePath: '/tmp/nexusaec-prefs-test.json',
    encryptionKey: Buffer.from('0'.repeat(64), 'hex').toString('hex'), // Demo key
  });

  await preferences.addVip({
    identifier: 'boss@company.com',
    name: 'Your Boss',
    reason: 'Testing',
  });

  const isVip = await preferences.isVip('boss@company.com');
  console.log(`✅ VIP added and verified: ${isVip}\n`);

  // 10. Test feedback learning
  console.log('🧠 Step 10: Testing feedback learning...');
  const feedbackLearner = new FeedbackLearner({
    storagePath: '/tmp/nexusaec-feedback-test.json',
  });

  await feedbackLearner.recordFeedback({
    emailId: emails[0].id,
    type: 'correct',
    originalScore: 0.75,
    signals: { keyword: 0.5, vip: 0.25 },
  });

  const stats = feedbackLearner.getStats();
  console.log(`✅ Feedback recorded. Total feedback: ${stats.totalFeedback}\n`);

  // Cleanup
  await sessionStore.deleteSession(sessionId);
  await sessionStore.disconnect();

  console.log('🎉 Integration test complete! All systems working!\n');
  console.log('📊 Summary:');
  console.log(`   - Emails processed: ${emails.length}`);
  console.log(`   - Red flags detected: ${scores.filter(s => s.score.isFlagged).length}`);
  console.log(`   - Topic clusters: ${clustering.clusters.length}`);
  console.log(`   - AI tokens used: ${summary.tokensUsed + briefing.tokensUsed}`);
  console.log(`   - Redis: Connected ✅`);
  console.log(`   - Supabase: Connected ✅`);
}

testIntegration().catch(console.error);
```

---

## Step 6: Run the Integration Test

```bash
cd /Users/ashutoshpranjal/nexusAEC/packages/intelligence
npx tsx test-integration.ts
```

**What will happen:**

1. A browser will open for Gmail OAuth
2. Sign in with your Google account
3. Grant permissions
4. The script will:
   - Fetch your real unread emails
   - Score them for red flags
   - Cluster them by topic
   - Generate AI summaries
   - Create briefing scripts
   - Save session to Redis
   - Query assets from Supabase
   - Test preferences and feedback

---

## Expected Output

```
🚀 Starting NexusAEC Intelligence Integration Test

📧 Step 1: Connecting to Gmail...
✅ Gmail connected!

📬 Step 2: Fetching unread emails...
✅ Found 15 unread emails

🚩 Step 3: Scoring emails for red flags...
  - Project deadline approaching: Score 0.82 🚩
  - Weekly newsletter: Score 0.15 ✅
  - Urgent: Server down: Score 0.95 🚩
  ...
✅ Red flag scoring complete

🗂️  Step 4: Clustering emails by topic...
✅ Created 3 topic clusters
  - Project Updates: 8 emails
  - IT Issues: 4 emails
  - General: 3 emails

📝 Step 5: Generating AI summaries...
✅ Summary: "Project deadline moved to Friday. Team needs approval for design changes."
   Tokens used: 245

🎙️  Step 6: Generating briefing script...
✅ Generated 5 script segments
   Estimated duration: 180s
   First segment: "Good morning! I've analyzed your inbox and found 15 unread emails. There are 2 urgent..."

💾 Step 7: Testing Redis session storage...
✅ Session saved and retrieved: test-session-1234567890

🔍 Step 8: Testing Supabase knowledge base...
✅ Found 3 relevant assets:
  - Pump Station 104 (similarity: 0.892)
  - Pump Station 105 (similarity: 0.856)
  - Generator 301 (similarity: 0.734)

⚙️  Step 9: Testing user preferences...
✅ VIP added and verified: true

🧠 Step 10: Testing feedback learning...
✅ Feedback recorded. Total feedback: 1

🎉 Integration test complete! All systems working!

📊 Summary:
   - Emails processed: 15
   - Red flags detected: 2
   - Topic clusters: 3
   - AI tokens used: 1250
   - Redis: Connected ✅
   - Supabase: Connected ✅
```

---

## Troubleshooting

### Gmail OAuth fails
- Make sure you added your email as a "Test User" in OAuth consent screen
- Check redirect URI matches exactly: `http://localhost:3000/auth/callback`

### Supabase connection fails
- Verify URL format: `https://xxxxx.supabase.co` (no trailing slash)
- Check you're using the **anon public** key, not service role key

### Redis connection fails
- For Upstash: Verify both URL and TOKEN are set
- For local: Make sure Redis is running: `redis-cli ping` should return `PONG`

### OpenAI API errors
- Check your API key is valid
- Ensure you have credits: https://platform.openai.com/usage
- Rate limits: Free tier has lower limits

### No unread emails
- Send yourself some test emails with subjects like:
  - "Urgent: Server maintenance needed"
  - "Project deadline this Friday"
  - "Team meeting notes"

---

## Cost Estimate

For 20 emails with full testing:
- **OpenAI GPT-4o**: ~$0.10-0.20 per test run
- **Supabase**: Free tier (500MB database)
- **Redis**: Free tier (Upstash 10,000 commands/day)
- **Gmail API**: Free (250 quota units/day)

**Total: ~$0.10-0.20 per full test**

---

## Next Steps

Once everything works:

1. **Test with more emails**: Increase `maxResults` to 50-100
2. **Test different scenarios**:
   - VIP senders
   - High-velocity threads
   - Calendar proximity
3. **Ingest safety manuals**:
   ```bash
   cd packages/intelligence
   pnpm run ingest:manuals
   ```
4. **Test RAG retrieval** with real queries about assets

---

## Security Notes

⚠️ **Never commit these to Git:**
- `.env` file
- `google-credentials.json`
- Any API keys or tokens

✅ **Already in .gitignore:**
- `.env`
- `*.json` (credentials)
- `node_modules/`

---

**Ready to test?** Start with Step 1! 🚀
