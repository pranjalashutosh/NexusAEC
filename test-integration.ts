#!/usr/bin/env ts-node
/**
 * Integration Test Script for NexusAEC
 *
 * This script tests:
 * 1. Gmail OAuth and email fetching
 * 2. Red flag detection
 * 3. Topic clustering
 * 4. Vector store operations
 * 5. RAG retrieval
 * 6. Email summarization
 * 7. Narrative generation
 *
 * Prerequisites:
 * - Redis running (brew services start redis)
 * - Supabase running (supabase start)
 * - .env file with credentials
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

import { GmailAdapter } from './packages/email-providers/src/index';
import {
  CalendarProximityDetector,
  DEFAULT_RED_FLAG_PATTERNS,
  EmailSummarizer,
  KeywordMatcher,
  LLMClient,
  NarrativeGenerator,
  RAGRetriever,
  RedFlagScorer,
  SupabaseVectorStore,
  ThreadVelocityDetector,
  TopicClusterer,
  type EmbeddingGenerator,
  VipDetector,
} from './packages/intelligence/src/index';

import type { StandardEmail, StandardThread } from './packages/shared-types/src/index';

// Load environment variables
dotenv.config();

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function testGmailAuth() {
  section('TEST 1: Gmail Authentication & Email Fetching');

  try {
    // This adapter expects OAuth tokens, not OAuth client credentials.
    // If you have an access token available, you can sanity-check connectivity here.
    const accessToken = process.env.GMAIL_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || '';
    const userId = process.env.GMAIL_USER_ID || process.env.TEST_USER_ID || 'test-user';

    if (!accessToken) {
      log(
        '⚠️  Skipping Gmail API call (no GMAIL_ACCESS_TOKEN/GOOGLE_ACCESS_TOKEN in env)',
        'yellow'
      );
      log('   OAuth flow needs browser interaction to obtain tokens', 'yellow');
      return null;
    }

    const gmailAdapter = new GmailAdapter({
      userId,
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        // If we don't know, pick a future expiry; GmailAdapter's testConnection only needs accessToken.
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scopes: [],
      },
    });

    log('🔌 Testing Gmail connection...', 'cyan');
    const status = await gmailAdapter.testConnection();
    if (!status.connected) {
      log(`❌ Gmail connection failed: ${status.error ?? 'unknown error'}`, 'red');
      return null;
    }

    log('✅ Gmail connection ok (token valid, API reachable)', 'green');

    return null;
  } catch (error) {
    log(`❌ Gmail auth test failed: ${(error as Error).message}`, 'red');
    return null;
  }
}

// Helper to create embedding generator
function createEmbeddingGenerator(openai: OpenAI): EmbeddingGenerator {
  return async (text: string) => {
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  };
}

async function testVectorStore() {
  section('TEST 2: Vector Store Operations');

  try {
    if (!process.env.OPENAI_API_KEY) {
      log('⚠️  Skipping vector store test (missing OPENAI_API_KEY)', 'yellow');
      return null;
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      log(
        '⚠️  Skipping vector store test (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
        'yellow'
      );
      return null;
    }

    // Initialize OpenAI and embedding generator
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddingGenerator = createEmbeddingGenerator(openai);

    const vectorStore = new SupabaseVectorStore({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Test 1: Upsert a document
    log('📝 Upserting test document...', 'cyan');
    const testContent =
      'Pump Station P-104 is located at Riverside Bridge. It handles main water distribution for the district.';

    // Generate embedding
    log('   Generating embedding...', 'cyan');
    const embedding = await embeddingGenerator(testContent);

    const testDoc = {
      content: testContent,
      embedding,
      source_type: 'ASSET' as const,
      metadata: {
        asset_id: 'P-104',
        category: 'Pump',
        location: 'Riverside Bridge',
      },
    };

    await vectorStore.upsertMany([testDoc]);
    log('✅ Document upserted successfully', 'green');

    // Test 2: Query similar documents
    log('\n🔍 Querying for "water pump issue"...', 'cyan');
    const queryEmbedding = await embeddingGenerator('water pump issue');

    const results = await vectorStore.search(queryEmbedding, {
      limit: 3,
      minSimilarity: 0.5,
    });

    log(`✅ Found ${results.length} relevant documents:`, 'green');
    results.forEach((result, idx) => {
      console.log(
        `   ${idx + 1}. Score: ${result.similarity.toFixed(3)} | ${result.document.content.substring(0, 100)}...`
      );
      console.log(`      Metadata: ${JSON.stringify(result.document.metadata)}`);
    });

    return { vectorStore, embeddingGenerator };
  } catch (error) {
    log(`❌ Vector store test failed: ${(error as Error).message}`, 'red');
    console.error(error);
    return null;
  }
}

async function testRAGRetrieval(
  vectorStore: SupabaseVectorStore | null,
  embeddingGenerator: EmbeddingGenerator | null
) {
  section('TEST 3: RAG Retrieval');

  if (!vectorStore || !embeddingGenerator) {
    log('⚠️  Skipping RAG test (vector store or embedding generator unavailable)', 'yellow');
    return;
  }

  try {
    const ragRetriever = new RAGRetriever({
      vectorStore,
      embeddingGenerator,
    });

    log('🔍 Retrieving context for: "Tell me about pump maintenance"', 'cyan');
    const context = await ragRetriever.retrieve('Tell me about pump maintenance', {
      topK: 3,
      minSimilarity: 0.6,
      sourceType: 'asset',
    });

    log(`✅ Retrieved ${context.length} context chunks:`, 'green');
    context.forEach((chunk, idx) => {
      console.log(`   ${idx + 1}. [${chunk.sourceType}] Score: ${chunk.score.toFixed(3)}`);
      console.log(`      ${chunk.content.substring(0, 150)}...`);
    });
  } catch (error) {
    log(`❌ RAG retrieval test failed: ${(error as Error).message}`, 'red');
    console.error(error);
  }
}

async function testRedFlagDetection() {
  section('TEST 4: Red Flag Detection');

  try {
    // Create mock emails for testing
    const mockEmails: StandardEmail[] = [
      {
        id: 'email-1',
        source: 'GMAIL' as const,
        threadId: 'thread-1',
        subject: 'URGENT: Pump P-104 failure at Riverside',
        from: { email: 'john.smith@example.com', name: 'John Smith' },
        to: [{ email: 'me@example.com', name: 'Me' }],
        cc: [],
        bcc: [],
        receivedAt: new Date(),
        isRead: false,
        isStarred: false,
        labels: ['INBOX', 'UNREAD'],
        snippet: 'We have an urgent pump failure that needs immediate attention',
        body: 'The pump has stopped working and water distribution is affected',
      },
      {
        id: 'email-2',
        source: 'GMAIL' as const,
        threadId: 'thread-2',
        subject: 'Weekly status update',
        from: { email: 'jane.doe@example.com', name: 'Jane Doe' },
        to: [{ email: 'me@example.com', name: 'Me' }],
        cc: [],
        bcc: [],
        receivedAt: new Date(Date.now() - 3600000),
        isRead: false,
        isStarred: false,
        labels: ['INBOX', 'UNREAD'],
        snippet: 'Here is the weekly status for all projects',
        body: 'All projects are on track this week',
      },
      {
        id: 'email-3',
        source: 'GMAIL' as const,
        threadId: 'thread-1',
        subject: 'RE: URGENT: Pump P-104 failure at Riverside',
        from: { email: 'john.smith@example.com', name: 'John Smith' },
        to: [{ email: 'me@example.com', name: 'Me' }],
        cc: [],
        bcc: [],
        receivedAt: new Date(Date.now() - 1800000),
        isRead: false,
        isStarred: false,
        labels: ['INBOX', 'UNREAD'],
        snippet: 'Following up - this is critical, please respond ASAP',
        body: 'I sent this 30 minutes ago and need urgent response',
      },
    ];

    // Initialize detectors/scorers (current APIs)
    const keywordMatcher = new KeywordMatcher({ patterns: DEFAULT_RED_FLAG_PATTERNS });
    const vipDetector = new VipDetector({
      vipList: [
        {
          id: 'vip-1',
          email: 'john.smith@example.com',
          name: 'John Smith',
          addedAt: new Date(),
          source: 'manual',
        },
      ],
    });
    const velocityDetector = new ThreadVelocityDetector();
    const calendarDetector = new CalendarProximityDetector({ upcomingEvents: [] });
    const redFlagScorer = new RedFlagScorer();

    // Precompute thread velocity per threadId
    const emailsByThread = new Map<string, StandardEmail[]>();
    for (const email of mockEmails) {
      const existing = emailsByThread.get(email.threadId) ?? [];
      existing.push(email);
      emailsByThread.set(email.threadId, existing);
    }
    const threadVelocityByThreadId = new Map<
      string,
      ReturnType<ThreadVelocityDetector['analyzeEmails']>
    >();
    for (const [threadId, emails] of emailsByThread.entries()) {
      threadVelocityByThreadId.set(threadId, velocityDetector.analyzeEmails(emails));
    }

    log('🚩 Analyzing emails for red flags...', 'cyan');
    const redFlagScores = new Map<string, ReturnType<RedFlagScorer['scoreEmail']>>();
    for (const email of mockEmails) {
      const keywordMatch = keywordMatcher.matchEmail(email);
      const vipDetection = vipDetector.detectVip(email);
      const threadVelocity = threadVelocityByThreadId.get(email.threadId);
      const calendarProximity = calendarDetector.detectProximity(email);

      const score = redFlagScorer.scoreEmail({
        keywordMatch,
        vipDetection,
        threadVelocity,
        calendarProximity,
      });
      redFlagScores.set(email.id, score);
    }

    const flagged = [...redFlagScores.entries()]
      .filter(([, s]) => s.isFlagged)
      .map(([emailId, s]) => ({ emailId, score: s }));

    log(`✅ Flagged ${flagged.length} email(s):`, 'green');
    for (const { emailId, score } of flagged) {
      const email = mockEmails.find((e) => e.id === emailId);
      console.log(`\n   📧 Email: ${email?.subject ?? emailId}`);
      console.log(`   🎯 Score: ${score.score.toFixed(3)} (severity: ${score.severity ?? 'none'})`);
      console.log(`   📊 Signals:`);
      score.signalBreakdown.forEach((c) => {
        if (!c.isPresent) {
          return;
        }
        console.log(
          `      - ${c.signal}: raw=${c.rawScore.toFixed(2)} weight=${c.weight.toFixed(2)} contrib=${c.contribution.toFixed(2)}`
        );
      });
      const topReasons = score.reasons.slice(0, 5);
      if (topReasons.length) {
        console.log(`   💡 Reasons:`);
        topReasons.forEach((r) => console.log(`      - [${r.signal}] ${r.description}`));
      }
    }

    return { mockEmails, redFlagScores };
  } catch (error) {
    log(`❌ Red flag detection test failed: ${(error as Error).message}`, 'red');
    console.error(error);
    return null;
  }
}

async function testTopicClustering(mockEmails: StandardEmail[]) {
  section('TEST 5: Topic Clustering');

  try {
    const clusterer = new TopicClusterer();

    log('🗂️  Clustering emails by topic...', 'cyan');
    const result = clusterer.clusterEmails(mockEmails);

    log(`✅ Found ${result.clusterCount} cluster(s):`, 'green');
    result.clusters.forEach((cluster) => {
      console.log(`\n   📁 Topic: ${cluster.topic}`);
      console.log(`   📧 Emails: ${cluster.size}`);
      console.log(`   🧩 Threads: ${cluster.threadIds.length}`);
      console.log(`   🏷️  Keywords: ${cluster.keywords.slice(0, 8).join(', ')}`);
    });
    if (result.unclusteredEmailIds.length) {
      console.log(`\n   💤 Unclustered emails: ${result.unclusteredEmailIds.join(', ')}`);
    }
    return result;
  } catch (error) {
    log(`❌ Topic clustering test failed: ${(error as Error).message}`, 'red');
  }
  return null;
}

function buildThreadsFromEmails(emails: StandardEmail[]): StandardThread[] {
  const byThread = new Map<string, StandardEmail[]>();
  for (const email of emails) {
    const existing = byThread.get(email.threadId) ?? [];
    existing.push(email);
    byThread.set(email.threadId, existing);
  }

  const threads: StandardThread[] = [];
  for (const [threadId, msgs] of byThread.entries()) {
    const sorted = [...msgs].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const participantsMap = new Map<string, { email: string; name?: string }>();
    for (const m of sorted) {
      participantsMap.set(m.from.email, m.from);
      for (const t of m.to) {
        participantsMap.set(t.email, t);
      }
    }
    const participants = [...participantsMap.values()];
    const lastMessageAt = sorted[sorted.length - 1]?.receivedAt ?? new Date();

    threads.push({
      id: threadId,
      source: sorted[0]?.source ?? 'GMAIL',
      subject: sorted[0]?.subject ?? threadId,
      participants,
      messageCount: sorted.length,
      messages: sorted,
      lastMessageAt,
      isRead: sorted.every((m) => m.isRead),
    });
  }
  return threads;
}

async function testEmailSummarization(threads: StandardThread[]) {
  section('TEST 6: Email Summarization');

  try {
    if (!process.env.OPENAI_API_KEY) {
      log('⚠️  Skipping summarization (missing OPENAI_API_KEY)', 'yellow');
      return null;
    }

    const llmClient = new LLMClient({
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-4o-mini',
    });
    const summarizer = new EmailSummarizer({
      llmClient,
      defaultMode: 'brief',
    });

    log('📝 Summarizing email thread...', 'cyan');
    const thread = threads.find((t) => t.id === 'thread-1') ?? threads[0];
    if (!thread) {
      log('⚠️  No threads available for summarization', 'yellow');
      return null;
    }

    const summary = await summarizer.summarizeThread(thread, { mode: 'brief' });

    log('✅ Summary generated:', 'green');
    console.log(`\n   ${summary.summary}\n`);
    return new Map([[thread.id, summary]]);
  } catch (error) {
    log(`❌ Email summarization test failed: ${(error as Error).message}`, 'red');
    console.error(error);
  }
  return null;
}

async function testNarrativeGeneration(
  clustersResult: ReturnType<TopicClusterer['clusterEmails']> | null,
  redFlagScores: Map<string, ReturnType<RedFlagScorer['scoreEmail']>> | null,
  summaries: Map<string, any> | null
) {
  section('TEST 7: Briefing Narrative Generation');

  try {
    if (!process.env.OPENAI_API_KEY) {
      log('⚠️  Skipping narrative generation (missing OPENAI_API_KEY)', 'yellow');
      return;
    }
    if (!clustersResult || !redFlagScores) {
      log('⚠️  Skipping narrative generation (missing clusters or red flag scores)', 'yellow');
      return;
    }

    const llmClient = new LLMClient({
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-4o-mini',
    });
    const narrativeGen = new NarrativeGenerator({
      llmClient,
    });

    log('🎙️  Generating briefing script...', 'cyan');
    const narrative = await narrativeGen.generateBriefing({
      clusters: clustersResult.clusters,
      redFlagScores,
      summaries: summaries ?? new Map(),
      userName: 'Alex', // Test user name
      currentTime: new Date(),
    });

    log('✅ Briefing script generated:', 'green');
    console.log('\n' + '─'.repeat(80));
    narrative.segments.forEach((seg) => {
      console.log(`[${seg.type}] ${seg.content}`);
    });
    console.log('─'.repeat(80) + '\n');
  } catch (error) {
    log(`❌ Narrative generation test failed: ${(error as Error).message}`, 'red');
    console.error(error);
  }
}

async function runTests() {
  log('\n🚀 NexusAEC Integration Test Suite\n', 'bright');
  log('Testing the Intelligence Layer and Email Processing Pipeline', 'cyan');

  // Check environment variables
  section('Environment Check');
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ];

  let allPresent = true;
  for (const envVar of requiredEnvVars) {
    const isPresent = !!process.env[envVar];
    log(`${isPresent ? '✅' : '❌'} ${envVar}`, isPresent ? 'green' : 'red');
    if (!isPresent) {
      allPresent = false;
    }
  }

  if (!allPresent) {
    log('\n⚠️  Some environment variables are missing. Check your .env file.', 'yellow');
    log('Continuing with available tests...\n', 'yellow');
  }

  // Run tests
  await testGmailAuth();
  const vectorStoreResult = await testVectorStore();
  await testRAGRetrieval(
    vectorStoreResult?.vectorStore || null,
    vectorStoreResult?.embeddingGenerator || null
  );

  const redFlagResult = await testRedFlagDetection();
  if (redFlagResult) {
    const clustersResult = await testTopicClustering(redFlagResult.mockEmails);
    const threads = buildThreadsFromEmails(redFlagResult.mockEmails);
    const summaries = await testEmailSummarization(threads);
    await testNarrativeGeneration(clustersResult ?? null, redFlagResult.redFlagScores, summaries);
  }

  // Final summary
  section('Test Summary');
  log('✅ Integration tests completed!', 'green');
  log('\n📋 Next Steps:', 'cyan');
  console.log('   1. Complete Gmail OAuth flow in your application');
  console.log('   2. Test with real email data from your Gmail account');
  console.log('   3. Verify Redis session state management');
  console.log('   4. Test the full voice briefing flow with LiveKit (Section 4.0)');
  console.log('\n');
}

// Run the tests
runTests().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
