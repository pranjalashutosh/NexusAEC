#!/usr/bin/env ts-node
'use strict';
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
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype);
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
var dotenv_1 = __importDefault(require('dotenv'));
var openai_1 = __importDefault(require('openai'));
var gmail_adapter_1 = require('./packages/email-providers/src/adapters/gmail-adapter');
var keyword_matcher_1 = require('./packages/intelligence/src/red-flags/keyword-matcher');
var vip_detector_1 = require('./packages/intelligence/src/red-flags/vip-detector');
var thread_velocity_1 = require('./packages/intelligence/src/red-flags/thread-velocity');
var calendar_proximity_1 = require('./packages/intelligence/src/red-flags/calendar-proximity');
var scorer_1 = require('./packages/intelligence/src/red-flags/scorer');
var topic_clusterer_1 = require('./packages/intelligence/src/clustering/topic-clusterer');
var supabase_vector_store_1 = require('./packages/intelligence/src/knowledge/supabase-vector-store');
var rag_retriever_1 = require('./packages/intelligence/src/knowledge/rag-retriever');
var email_summarizer_1 = require('./packages/intelligence/src/knowledge/email-summarizer');
var narrative_generator_1 = require('./packages/intelligence/src/knowledge/narrative-generator');
var default_patterns_1 = require('./packages/intelligence/src/red-flags/default-patterns');
// Load environment variables
dotenv_1.default.config();
// ANSI color codes for pretty output
var colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};
function log(message, color) {
  if (color === void 0) {
    color = 'reset';
  }
  console.log(''.concat(colors[color]).concat(message).concat(colors.reset));
}
function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}
function testGmailAuth() {
  return __awaiter(this, void 0, void 0, function () {
    var gmailAdapter;
    return __generator(this, function (_a) {
      section('TEST 1: Gmail Authentication & Email Fetching');
      try {
        gmailAdapter = new gmail_adapter_1.GmailAdapter({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri:
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
        });
        // Check if we have stored tokens
        log('Checking for stored Gmail tokens...', 'cyan');
        // For now, we'll skip actual OAuth (requires browser)
        log('⚠️  OAuth flow requires browser interaction', 'yellow');
        log('   To test Gmail: Run the OAuth flow in your app first', 'yellow');
        log("   For now, we'll use mock data for other tests", 'yellow');
        return [2 /*return*/, null];
      } catch (error) {
        log('\u274C Gmail auth test failed: '.concat(error.message), 'red');
        return [2 /*return*/, null];
      }
      return [2 /*return*/];
    });
  });
}
// Helper to create embedding generator
function createEmbeddingGenerator(openai) {
  var _this = this;
  return function (text) {
    return __awaiter(_this, void 0, void 0, function () {
      var response;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              openai.embeddings.create({
                model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                input: text,
              }),
            ];
          case 1:
            response = _a.sent();
            return [2 /*return*/, response.data[0].embedding];
        }
      });
    });
  };
}
function testVectorStore() {
  return __awaiter(this, void 0, void 0, function () {
    var openai,
      embeddingGenerator,
      vectorStore,
      testContent,
      embedding,
      testDoc,
      queryEmbedding,
      results,
      error_1;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 2: Vector Store Operations');
          _a.label = 1;
        case 1:
          _a.trys.push([1, 6, , 7]);
          openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
          embeddingGenerator = createEmbeddingGenerator(openai);
          vectorStore = new supabase_vector_store_1.SupabaseVectorStore({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          });
          // Test 1: Upsert a document
          log('📝 Upserting test document...', 'cyan');
          testContent =
            'Pump Station P-104 is located at Riverside Bridge. It handles main water distribution for the district.';
          // Generate embedding
          log('   Generating embedding...', 'cyan');
          return [4 /*yield*/, embeddingGenerator(testContent)];
        case 2:
          embedding = _a.sent();
          testDoc = {
            content: testContent,
            embedding: embedding,
            source_type: 'ASSET',
            metadata: {
              asset_id: 'P-104',
              category: 'Pump',
              location: 'Riverside Bridge',
            },
          };
          return [4 /*yield*/, vectorStore.upsertMany([testDoc])];
        case 3:
          _a.sent();
          log('✅ Document upserted successfully', 'green');
          // Test 2: Query similar documents
          log('\n🔍 Querying for "water pump issue"...', 'cyan');
          return [4 /*yield*/, embeddingGenerator('water pump issue')];
        case 4:
          queryEmbedding = _a.sent();
          return [
            4 /*yield*/,
            vectorStore.search(queryEmbedding, {
              limit: 3,
              minSimilarity: 0.5,
            }),
          ];
        case 5:
          results = _a.sent();
          log('\u2705 Found '.concat(results.length, ' relevant documents:'), 'green');
          results.forEach(function (result, idx) {
            console.log(
              '   '
                .concat(idx + 1, '. Score: ')
                .concat(result.similarity.toFixed(3), ' | ')
                .concat(result.document.content.substring(0, 100), '...')
            );
            console.log('      Metadata: '.concat(JSON.stringify(result.document.metadata)));
          });
          return [
            2 /*return*/,
            { vectorStore: vectorStore, embeddingGenerator: embeddingGenerator },
          ];
        case 6:
          error_1 = _a.sent();
          log('\u274C Vector store test failed: '.concat(error_1.message), 'red');
          console.error(error_1);
          return [2 /*return*/, null];
        case 7:
          return [2 /*return*/];
      }
    });
  });
}
function testRAGRetrieval(vectorStore, embeddingGenerator) {
  return __awaiter(this, void 0, void 0, function () {
    var ragRetriever, context, error_2;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 3: RAG Retrieval');
          if (!vectorStore || !embeddingGenerator) {
            log(
              '⚠️  Skipping RAG test (vector store or embedding generator unavailable)',
              'yellow'
            );
            return [2 /*return*/];
          }
          _a.label = 1;
        case 1:
          _a.trys.push([1, 3, , 4]);
          ragRetriever = new rag_retriever_1.RAGRetriever({
            vectorStore: vectorStore,
            embeddingGenerator: embeddingGenerator,
          });
          log('🔍 Retrieving context for: "Tell me about pump maintenance"', 'cyan');
          return [
            4 /*yield*/,
            ragRetriever.retrieve('Tell me about pump maintenance', {
              topK: 3,
              minSimilarity: 0.6,
              sourceType: 'asset',
            }),
          ];
        case 2:
          context = _a.sent();
          log('\u2705 Retrieved '.concat(context.length, ' context chunks:'), 'green');
          context.forEach(function (chunk, idx) {
            console.log(
              '   '
                .concat(idx + 1, '. [')
                .concat(chunk.sourceType, '] Score: ')
                .concat(chunk.score.toFixed(3))
            );
            console.log('      '.concat(chunk.content.substring(0, 150), '...'));
          });
          return [3 /*break*/, 4];
        case 3:
          error_2 = _a.sent();
          log('\u274C RAG retrieval test failed: '.concat(error_2.message), 'red');
          console.error(error_2);
          return [3 /*break*/, 4];
        case 4:
          return [2 /*return*/];
      }
    });
  });
}
function testRedFlagDetection() {
  return __awaiter(this, void 0, void 0, function () {
    var mockEmails,
      keywordMatcher,
      vipDetector,
      velocityCalculator,
      calendarScorer,
      redFlagScorer,
      redFlags,
      error_3;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 4: Red Flag Detection');
          _a.label = 1;
        case 1:
          _a.trys.push([1, 3, , 4]);
          mockEmails = [
            {
              id: 'email-1',
              source: 'GMAIL',
              providerMessageId: 'msg-1',
              threadId: 'thread-1',
              subject: 'URGENT: Pump P-104 failure at Riverside',
              from: { email: 'john.smith@example.com', name: 'John Smith' },
              to: [{ email: 'me@example.com', name: 'Me' }],
              receivedAt: new Date().toISOString(),
              isRead: false,
              snippet: 'We have an urgent pump failure that needs immediate attention',
              bodyPreview: 'The pump has stopped working and water distribution is affected',
            },
            {
              id: 'email-2',
              source: 'GMAIL',
              providerMessageId: 'msg-2',
              threadId: 'thread-2',
              subject: 'Weekly status update',
              from: { email: 'jane.doe@example.com', name: 'Jane Doe' },
              to: [{ email: 'me@example.com', name: 'Me' }],
              receivedAt: new Date(Date.now() - 3600000).toISOString(),
              isRead: false,
              snippet: 'Here is the weekly status for all projects',
              bodyPreview: 'All projects are on track this week',
            },
            {
              id: 'email-3',
              source: 'GMAIL',
              providerMessageId: 'msg-3',
              threadId: 'thread-1',
              subject: 'RE: URGENT: Pump P-104 failure at Riverside',
              from: { email: 'john.smith@example.com', name: 'John Smith' },
              to: [{ email: 'me@example.com', name: 'Me' }],
              receivedAt: new Date(Date.now() - 1800000).toISOString(),
              isRead: false,
              snippet: 'Following up - this is critical, please respond ASAP',
              bodyPreview: 'I sent this 30 minutes ago and need urgent response',
            },
          ];
          keywordMatcher = new keyword_matcher_1.KeywordMatcher(
            default_patterns_1.DEFAULT_RED_FLAG_PATTERNS
          );
          vipDetector = new vip_detector_1.VIPDetector({
            vips: [
              {
                email: 'john.smith@example.com',
                name: 'John Smith',
                addedAt: new Date().toISOString(),
              },
            ],
          });
          velocityCalculator = new thread_velocity_1.ThreadVelocityCalculator();
          calendarScorer = new calendar_proximity_1.CalendarProximityScorer({
            upcomingEvents: [], // No calendar events for this test
          });
          redFlagScorer = new scorer_1.RedFlagScorer({
            keywordMatcher: keywordMatcher,
            vipDetector: vipDetector,
            velocityCalculator: velocityCalculator,
            calendarScorer: calendarScorer,
          });
          log('🚩 Analyzing emails for red flags...', 'cyan');
          return [4 /*yield*/, redFlagScorer.scoreEmails(mockEmails)];
        case 2:
          redFlags = _a.sent();
          log('\u2705 Found '.concat(redFlags.length, ' red flag(s):'), 'green');
          redFlags.forEach(function (flag) {
            console.log('\n   \uD83D\uDCE7 Email: '.concat(flag.email.subject));
            console.log(
              '   \uD83C\uDFAF Score: '
                .concat(flag.score.toFixed(3), ' (threshold: ')
                .concat(flag.threshold, ')')
            );
            console.log('   \uD83D\uDCCA Breakdown:');
            console.log('      - Keyword: '.concat(flag.breakdown.keywordScore.toFixed(2)));
            console.log('      - VIP: '.concat(flag.breakdown.vipScore.toFixed(2)));
            console.log('      - Velocity: '.concat(flag.breakdown.velocityScore.toFixed(2)));
            console.log('      - Calendar: '.concat(flag.breakdown.calendarScore.toFixed(2)));
            console.log(
              '   \uD83D\uDCA1 Reason: '.concat(
                flag.reason || 'Multiple high-priority signals detected'
              )
            );
          });
          return [2 /*return*/, { mockEmails: mockEmails, redFlags: redFlags }];
        case 3:
          error_3 = _a.sent();
          log('\u274C Red flag detection test failed: '.concat(error_3.message), 'red');
          console.error(error_3);
          return [2 /*return*/, null];
        case 4:
          return [2 /*return*/];
      }
    });
  });
}
function testTopicClustering(mockEmails) {
  return __awaiter(this, void 0, void 0, function () {
    var clusterer, topics, error_4;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 5: Topic Clustering');
          _a.label = 1;
        case 1:
          _a.trys.push([1, 3, , 4]);
          clusterer = new topic_clusterer_1.TopicClusterer();
          log('🗂️  Clustering emails by topic...', 'cyan');
          return [4 /*yield*/, clusterer.clusterEmails(mockEmails)];
        case 2:
          topics = _a.sent();
          log('\u2705 Found '.concat(topics.length, ' topic(s):'), 'green');
          topics.forEach(function (topic) {
            console.log('\n   \uD83D\uDCC1 Topic: '.concat(topic.name));
            console.log('   \uD83D\uDCE7 Emails: '.concat(topic.emailCount));
            console.log('   \uD83D\uDEA9 Red flags: '.concat(topic.redFlagCount));
            console.log(
              '   \uD83D\uDD52 Last activity: '.concat(
                new Date(topic.lastActivityAt).toLocaleString()
              )
            );
          });
          return [3 /*break*/, 4];
        case 3:
          error_4 = _a.sent();
          log('\u274C Topic clustering test failed: '.concat(error_4.message), 'red');
          return [3 /*break*/, 4];
        case 4:
          return [2 /*return*/];
      }
    });
  });
}
function testEmailSummarization(mockEmails) {
  return __awaiter(this, void 0, void 0, function () {
    var summarizer, summary, error_5;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 6: Email Summarization');
          _a.label = 1;
        case 1:
          _a.trys.push([1, 3, , 4]);
          summarizer = new email_summarizer_1.EmailSummarizer({
            openAIKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini', // Use mini for faster/cheaper testing
          });
          log('📝 Summarizing email thread...', 'cyan');
          return [
            4 /*yield*/,
            summarizer.summarizeThread(
              mockEmails.filter(function (e) {
                return e.threadId === 'thread-1';
              })
            ),
          ];
        case 2:
          summary = _a.sent();
          log('✅ Summary generated:', 'green');
          console.log('\n   '.concat(summary, '\n'));
          return [3 /*break*/, 4];
        case 3:
          error_5 = _a.sent();
          log('\u274C Email summarization test failed: '.concat(error_5.message), 'red');
          console.error(error_5);
          return [3 /*break*/, 4];
        case 4:
          return [2 /*return*/];
      }
    });
  });
}
function testNarrativeGeneration(mockEmails, redFlags) {
  return __awaiter(this, void 0, void 0, function () {
    var narrativeGen, clusterer, topics, narrative, error_6;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          section('TEST 7: Briefing Narrative Generation');
          _a.label = 1;
        case 1:
          _a.trys.push([1, 4, , 5]);
          narrativeGen = new narrative_generator_1.NarrativeGenerator({
            openAIKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini',
          });
          clusterer = new topic_clusterer_1.TopicClusterer();
          return [4 /*yield*/, clusterer.clusterEmails(mockEmails)];
        case 2:
          topics = _a.sent();
          log('🎙️  Generating briefing script...', 'cyan');
          return [
            4 /*yield*/,
            narrativeGen.generateBriefing({
              topics: topics,
              redFlags: redFlags,
              totalEmailCount: mockEmails.length,
              userName: 'Alex', // Test user name
            }),
          ];
        case 3:
          narrative = _a.sent();
          log('✅ Briefing script generated:', 'green');
          console.log('\n' + '─'.repeat(80));
          console.log(narrative);
          console.log('─'.repeat(80) + '\n');
          return [3 /*break*/, 5];
        case 4:
          error_6 = _a.sent();
          log('\u274C Narrative generation test failed: '.concat(error_6.message), 'red');
          console.error(error_6);
          return [3 /*break*/, 5];
        case 5:
          return [2 /*return*/];
      }
    });
  });
}
function runTests() {
  return __awaiter(this, void 0, void 0, function () {
    var requiredEnvVars,
      allPresent,
      _i,
      requiredEnvVars_1,
      envVar,
      isPresent,
      vectorStoreResult,
      redFlagResult;
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          log('\n🚀 NexusAEC Integration Test Suite\n', 'bright');
          log('Testing the Intelligence Layer and Email Processing Pipeline', 'cyan');
          // Check environment variables
          section('Environment Check');
          requiredEnvVars = [
            'OPENAI_API_KEY',
            'SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
          ];
          allPresent = true;
          for (_i = 0, requiredEnvVars_1 = requiredEnvVars; _i < requiredEnvVars_1.length; _i++) {
            envVar = requiredEnvVars_1[_i];
            isPresent = !!process.env[envVar];
            log(
              ''.concat(isPresent ? '✅' : '❌', ' ').concat(envVar),
              isPresent ? 'green' : 'red'
            );
            if (!isPresent) allPresent = false;
          }
          if (!allPresent) {
            log('\n⚠️  Some environment variables are missing. Check your .env file.', 'yellow');
            log('Continuing with available tests...\n', 'yellow');
          }
          // Run tests
          return [4 /*yield*/, testGmailAuth()];
        case 1:
          // Run tests
          _a.sent();
          return [4 /*yield*/, testVectorStore()];
        case 2:
          vectorStoreResult = _a.sent();
          return [
            4 /*yield*/,
            testRAGRetrieval(
              (vectorStoreResult === null || vectorStoreResult === void 0
                ? void 0
                : vectorStoreResult.vectorStore) || null,
              (vectorStoreResult === null || vectorStoreResult === void 0
                ? void 0
                : vectorStoreResult.embeddingGenerator) || null
            ),
          ];
        case 3:
          _a.sent();
          return [4 /*yield*/, testRedFlagDetection()];
        case 4:
          redFlagResult = _a.sent();
          if (!redFlagResult) return [3 /*break*/, 8];
          return [4 /*yield*/, testTopicClustering(redFlagResult.mockEmails)];
        case 5:
          _a.sent();
          return [4 /*yield*/, testEmailSummarization(redFlagResult.mockEmails)];
        case 6:
          _a.sent();
          return [
            4 /*yield*/,
            testNarrativeGeneration(redFlagResult.mockEmails, redFlagResult.redFlags),
          ];
        case 7:
          _a.sent();
          _a.label = 8;
        case 8:
          // Final summary
          section('Test Summary');
          log('✅ Integration tests completed!', 'green');
          log('\n📋 Next Steps:', 'cyan');
          console.log('   1. Complete Gmail OAuth flow in your application');
          console.log('   2. Test with real email data from your Gmail account');
          console.log('   3. Verify Redis session state management');
          console.log('   4. Test the full voice briefing flow with LiveKit (Section 4.0)');
          console.log('\n');
          return [2 /*return*/];
      }
    });
  });
}
// Run the tests
runTests().catch(function (error) {
  log('\n\u274C Fatal error: '.concat(error.message), 'red');
  console.error(error);
  process.exit(1);
});
