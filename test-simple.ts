#!/usr/bin/env ts-node
/**
 * Simple Integration Test for NexusAEC
 *
 * This is a minimal test to verify core functionality works.
 * Run: npx ts-node test-simple.ts
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

import { LLMClient } from './packages/intelligence/src/knowledge/llm-client';
import { SupabaseVectorStore } from './packages/intelligence/src/knowledge/supabase-vector-store';

// Load environment variables
dotenv.config();

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function testEnvironment() {
  section('Environment Check');

  const requiredVars = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

  let allPresent = true;
  for (const envVar of requiredVars) {
    const isPresent = !!process.env[envVar];
    log(`${isPresent ? '✅' : '❌'} ${envVar}`, isPresent ? 'green' : 'red');
    if (!isPresent) {
      allPresent = false;
    }
  }

  if (!allPresent) {
    log('\n⚠️  Some required environment variables are missing!', 'red');
    log('Please check your .env file and try again.', 'yellow');
    process.exit(1);
  }

  log('\n✅ All required environment variables present!', 'green');
}

async function testVectorStore() {
  section('TEST 1: Vector Store & Embeddings');

  try {
    // Initialize OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // Initialize vector store
    const vectorStore = new SupabaseVectorStore({
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    });

    // Test 1: Generate an embedding
    log('📝 Generating embedding for test content...', 'cyan');
    const testContent = 'Pump Station P-104 at Riverside Bridge handles water distribution';

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testContent,
    });

    const embedding = embeddingResponse.data[0].embedding;
    log(`✅ Generated embedding (${embedding.length} dimensions)`, 'green');

    // Test 2: Upsert to vector store
    log('\n💾 Inserting document into vector store...', 'cyan');
    const documentIds = await vectorStore.upsertMany([
      {
        content: testContent,
        embedding,
        source_type: 'ASSET',
        metadata: {
          asset_id: 'P-104',
          category: 'Pump',
          location: 'Riverside Bridge',
        },
      },
    ]);

    log(`✅ Document inserted with ID: ${documentIds[0]}`, 'green');

    // Test 3: Search for similar documents
    log('\n🔍 Searching for similar content...', 'cyan');
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'water pump issues',
    });

    const searchResults = await vectorStore.search(queryEmbedding.data[0].embedding, {
      limit: 3,
      minSimilarity: 0.5,
    });

    log(`✅ Found ${searchResults.length} similar document(s):`, 'green');
    searchResults.forEach((result, idx) => {
      console.log(`   ${idx + 1}. Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`      Content: ${result.document.content.substring(0, 80)}...`);
      console.log(`      Metadata: ${JSON.stringify(result.document.metadata)}`);
    });

    return true;
  } catch (error) {
    log(`\n❌ Vector store test failed: ${(error as Error).message}`, 'red');
    console.error(error);
    return false;
  }
}

async function testLLMClient() {
  section('TEST 2: LLM Client (GPT-4o)');

  try {
    const llmClient = new LLMClient({
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: 'gpt-4o-mini', // Using mini for faster/cheaper testing
    });

    log('🤖 Sending test prompt to GPT-4o...', 'cyan');

    const result = await llmClient.complete(
      [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes email content.',
        },
        {
          role: 'user',
          content:
            'Summarize this: "Urgent pump failure at P-104. Water distribution affected. Need immediate repair."',
        },
      ],
      {
        maxTokens: 100,
      }
    );

    log('✅ LLM response received:', 'green');
    console.log(`\n   ${result.content}\n`);
    console.log(
      `   Tokens used: ${result.totalTokens} (prompt: ${result.promptTokens}, completion: ${result.completionTokens})`
    );
    console.log(`   Response time: ${result.responseTimeMs}ms`);

    return true;
  } catch (error) {
    log(`\n❌ LLM client test failed: ${(error as Error).message}`, 'red');
    console.error(error);
    return false;
  }
}

async function testDatabaseConnection() {
  section('TEST 3: Supabase Database Connection');

  try {
    const vectorStore = new SupabaseVectorStore({
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    });

    log('🔗 Checking Supabase connection...', 'cyan');

    // Simple query to verify connection
    const results = await vectorStore.search(new Array(1536).fill(0), {
      limit: 1,
    });

    log('✅ Supabase connection successful!', 'green');
    log(`   Database has ${results.length > 0 ? 'data' : 'no data yet'}`, 'cyan');

    return true;
  } catch (error) {
    log(`\n❌ Database connection failed: ${(error as Error).message}`, 'red');
    console.error(error);
    return false;
  }
}

async function main() {
  log('\n🚀 NexusAEC Simple Integration Test\n', 'bright');
  log('Testing core functionality: Vector Store, Embeddings, and LLM\n', 'cyan');

  // Run tests
  await testEnvironment();

  const test1 = await testVectorStore();
  const test2 = await testLLMClient();
  const test3 = await testDatabaseConnection();

  // Summary
  section('Test Summary');

  const results = [
    { name: 'Vector Store & Embeddings', passed: test1 },
    { name: 'LLM Client (GPT-4o)', passed: test2 },
    { name: 'Database Connection', passed: test3 },
  ];

  results.forEach(({ name, passed }) => {
    log(`${passed ? '✅' : '❌'} ${name}`, passed ? 'green' : 'red');
  });

  const allPassed = results.every((r) => r.passed);

  if (allPassed) {
    log('\n🎉 All tests passed! The intelligence layer is working correctly.', 'green');
    log('\n📋 Next Steps:', 'cyan');
    console.log('   1. Test with real Gmail data (requires OAuth setup)');
    console.log('   2. Test full red flag detection pipeline');
    console.log('   3. Move to Section 4.0: Voice Interface with LiveKit');
  } else {
    log('\n⚠️  Some tests failed. Please check the errors above.', 'yellow');
  }

  console.log('');
}

// Run tests
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
