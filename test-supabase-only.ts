#!/usr/bin/env ts-node
/**
 * Supabase-Only Test (No OpenAI Required)
 *
 * Tests database connectivity and vector operations without needing OpenAI credits
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabaseProjectRef(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

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

async function main() {
  log('\n🧪 Supabase Database Test (No OpenAI Required)\n', 'bright');

  section('Environment Check');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 'red');
    log('Please check your .env file', 'yellow');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = getSupabaseProjectRef(supabaseUrl);

  log('✅ SUPABASE_URL', 'green');
  log('✅ SUPABASE_SERVICE_ROLE_KEY', 'green');
  if (projectRef) {
    log(`ℹ️  Project ref: ${projectRef}`, 'cyan');
  }

  section('TEST 1: Database Connection');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    log('🔗 Connecting to Supabase...', 'cyan');

    // Test 1: Check if assets table exists and has data
    const { data: assets, error: assetsError } = await supabase.from('assets').select('*').limit(5);

    if (assetsError) {
      // Helpful diagnostics when PostgREST doesn't see any tables for this project.
      if (assetsError.message.includes('schema cache')) {
        try {
          const r = await fetch(`${supabaseUrl}/rest/v1/`, {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          });
          const swaggerText = await r.text();
          const hasAssetsEndpoint = swaggerText.includes('"/assets"');
          if (!hasAssetsEndpoint) {
            log(
              `❌ Supabase REST API does not expose an /assets endpoint for this project (schema cache has no assets table).`,
              'red'
            );
            log(
              `This typically means migrations/schema were NOT applied to this Supabase project.`,
              'yellow'
            );
            if (projectRef) {
              log(
                `Double-check you're in the right Supabase project: dashboard URL should include /project/${projectRef}/`,
                'yellow'
              );
            }
            log(
              `Fix: run the SQL in supabase/migrations/ (or infra/init-db.sql) in the Supabase SQL editor, then reload PostgREST schema.`,
              'yellow'
            );
          }
        } catch {
          // ignore diagnostics fetch failures; we'll throw the original error below
        }
      }
      throw new Error(`Assets query failed: ${assetsError.message}`);
    }

    log(`✅ Connected to Supabase successfully!`, 'green');
    log(`   Found ${assets?.length || 0} assets in database`, 'cyan');

    if (assets && assets.length > 0) {
      log('\n📋 Sample assets:', 'cyan');
      assets.forEach((asset, idx) => {
        console.log(`   ${idx + 1}. ${asset.asset_id}: ${asset.name} (${asset.category})`);
      });
    }

    section('TEST 2: Documents Table');

    // Test 2: Check documents table
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, source_type, metadata')
      .limit(5);

    if (docsError) {
      throw new Error(`Documents query failed: ${docsError.message}`);
    }

    log(`✅ Documents table accessible`, 'green');
    log(`   Found ${documents?.length || 0} documents`, 'cyan');

    if (documents && documents.length > 0) {
      log('\n📄 Sample documents:', 'cyan');
      documents.forEach((doc, idx) => {
        console.log(`   ${idx + 1}. [${doc.source_type}] ID: ${doc.id}`);
      });
    }

    section('TEST 3: Insert Mock Vector Data');

    // Create a fake embedding (1536 dimensions of zeros)
    const fakeEmbedding = new Array(1536).fill(0);

    log('📝 Inserting test document with mock embedding...', 'cyan');

    const fakeEmbeddingStr = JSON.stringify(fakeEmbedding); // pgvector expects a string like "[0,0,...]"

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert({
        content: 'Test document for Supabase verification',
        embedding: fakeEmbeddingStr,
        source_type: 'ASSET',
        metadata: {
          test: true,
          created_by: 'test-script',
        },
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }

    log(`✅ Test document inserted successfully!`, 'green');
    log(`   Document ID: ${inserted.id}`, 'cyan');

    section('TEST 4: Vector Search Function');

    // Test the match_documents function
    log('🔍 Testing match_documents function...', 'cyan');

    const { data: searchResults, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: fakeEmbeddingStr,
      match_threshold: 0.0,
      match_count: 3,
    });

    if (searchError) {
      throw new Error(`Vector search failed: ${searchError.message}`);
    }

    log(`✅ Vector search function works!`, 'green');
    log(`   Found ${searchResults?.length || 0} matching documents`, 'cyan');

    section('Test Summary');

    log('✅ Database Connection', 'green');
    log('✅ Assets Table Query', 'green');
    log('✅ Documents Table Query', 'green');
    log('✅ Document Insert', 'green');
    log('✅ Vector Search Function', 'green');

    log('\n🎉 All Supabase tests passed!', 'green');
    log('\n📋 Next Steps:', 'cyan');
    console.log('   1. ✅ Supabase is working correctly');
    console.log('   2. 💰 Add credits to your OpenAI account to test embeddings');
    console.log('   3. 🧪 Run full test: npx ts-node test-simple.ts');
    console.log('');
  } catch (error) {
    log(`\n❌ Test failed: ${(error as Error).message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

void main();
