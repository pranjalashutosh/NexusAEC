#!/usr/bin/env node

/**
 * CLI tool for listing and searching assets in the vector store
 *
 * Usage:
 *   npx tsx cli/list-assets.ts
 *   npx tsx cli/list-assets.ts --count
 *   npx tsx cli/list-assets.ts --search "pump station"
 *   npx tsx cli/list-assets.ts --type asset --limit 10
 *
 * Environment variables required:
 *   OPENAI_API_KEY - OpenAI API key (for semantic search)
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_ANON_KEY - Supabase anonymous key
 */

import { Command } from 'commander';
import { config } from 'dotenv';
import { OpenAI } from 'openai';

import { SupabaseVectorStore } from '../src/knowledge/supabase-vector-store';

import type { Asset, SafetyDocument } from '../src/knowledge/asset-types';

// Load environment variables
config();

/**
 * Format asset for display
 */
function formatAsset(asset: Asset, index: number): string {
  const lines = [
    `\n${index + 1}. ${asset.name} [${asset.assetId}]`,
    `   Category: ${asset.category}`,
    `   Location: ${asset.location}`,
  ];

  if (asset.criticality) {
    const criticalityColors: Record<string, string> = {
      CRITICAL: '\x1b[31m', // Red
      HIGH: '\x1b[33m', // Yellow
      MEDIUM: '\x1b[36m', // Cyan
      LOW: '\x1b[37m', // White
    };
    const color = criticalityColors[asset.criticality] || '\x1b[0m';
    const reset = '\x1b[0m';
    lines.push(`   Criticality: ${color}${asset.criticality}${reset}`);
  }

  if (asset.status) {
    lines.push(`   Status: ${asset.status}`);
  }

  lines.push(
    `   Description: ${asset.description.substring(0, 100)}${asset.description.length > 100 ? '...' : ''}`
  );

  return lines.join('\n');
}

/**
 * Format safety document for display
 */
function formatSafetyDocument(doc: SafetyDocument, index: number): string {
  const lines = [`\n${index + 1}. ${doc.title} [${doc.id}]`, `   Type: ${doc.type}`];

  if (doc.relatedAssets && doc.relatedAssets.length > 0) {
    lines.push(
      `   Related Assets: ${doc.relatedAssets.slice(0, 5).join(', ')}${doc.relatedAssets.length > 5 ? '...' : ''}`
    );
  }

  lines.push(
    `   Content: ${doc.content.substring(0, 100)}${doc.content.length > 100 ? '...' : ''}`
  );

  return lines.join('\n');
}

/**
 * Display summary statistics
 */
function displaySummary(
  totalAssets: number,
  totalManuals: number,
  displayedAssets: number,
  displayedManuals: number,
  showAll: boolean
): void {
  console.log('\n' + '─'.repeat(50));
  console.log('SUMMARY');
  console.log('─'.repeat(50));
  console.log(`Total Assets: ${totalAssets}`);
  console.log(`Total Safety Manuals: ${totalManuals}`);
  console.log(`Total Documents: ${totalAssets + totalManuals}`);

  if (!showAll) {
    if (displayedAssets > 0) {
      console.log(`\nDisplayed Assets: ${displayedAssets} of ${totalAssets}`);
    }
    if (displayedManuals > 0) {
      console.log(`Displayed Manuals: ${displayedManuals} of ${totalManuals}`);
    }
  }

  console.log('');
}

/**
 * Main CLI function
 */
async function main() {
  const program = new Command();

  program
    .name('list-assets')
    .description('List and search assets and safety manuals in the vector store')
    .version('1.0.0')
    .option('-t, --type <type>', 'Filter by type: asset, manual, or all', 'all')
    .option('-l, --limit <number>', 'Maximum number of items to display', '20')
    .option('-o, --offset <number>', 'Number of items to skip', '0')
    .option('-s, --search <query>', 'Semantic search query')
    .option('-c, --count', 'Only display counts, not items')
    .option('--similarity <threshold>', 'Minimum similarity threshold for search (0-1)', '0.7')
    .option('--no-color', 'Disable colored output')
    .parse(process.argv);

  const options = program.opts();

  // Validate environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error('❌ Error: SUPABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!supabaseAnonKey) {
    console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required');
    process.exit(1);
  }

  // Validate type option
  const validTypes = ['asset', 'manual', 'all'];
  if (!validTypes.includes(options.type)) {
    console.error(`❌ Error: Invalid type. Must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  try {
    // Initialize vector store (wraps Supabase client internally)
    const vectorStore = new SupabaseVectorStore({
      supabaseUrl,
      supabaseKey: supabaseAnonKey,
    });

    console.log('\n📊 NexusAEC Knowledge Base');
    console.log('─'.repeat(50));

    // Get counts
    const assetCount = await vectorStore.count('ASSET');
    const manualCount = await vectorStore.count('SAFETY_MANUAL');

    // If only count requested, display and exit
    if (options.count) {
      console.log(`Assets: ${assetCount}`);
      console.log(`Safety Manuals: ${manualCount}`);
      console.log(`Total: ${assetCount + manualCount}`);
      console.log('');
      process.exit(0);
    }

    const limit = parseInt(options.limit, 10);
    const offset = parseInt(options.offset, 10);
    const similarityThreshold = parseFloat(options.similarity);

    let assets: Asset[] = [];
    let manuals: SafetyDocument[] = [];

    // Semantic search mode
    if (options.search) {
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        console.error('❌ Error: OPENAI_API_KEY environment variable is required for search');
        process.exit(1);
      }

      console.log(`Search query: "${options.search}"`);
      console.log(`Similarity threshold: ${similarityThreshold}`);
      console.log('─'.repeat(50));

      // Generate embedding for search query
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: options.search,
        encoding_format: 'float',
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search based on type
      if (options.type === 'asset' || options.type === 'all') {
        const assetResults = await vectorStore.search(queryEmbedding, {
          limit,
          minSimilarity: similarityThreshold,
          sourceType: 'ASSET',
        });

        assets = assetResults.map((result) => result.document.metadata as unknown as Asset);
      }

      if (options.type === 'manual' || options.type === 'all') {
        const manualResults = await vectorStore.search(queryEmbedding, {
          limit,
          minSimilarity: similarityThreshold,
          sourceType: 'SAFETY_MANUAL',
        });

        manuals = manualResults.map(
          (result) => result.document.metadata as unknown as SafetyDocument
        );
      }

      console.log(`\nFound ${assets.length} assets and ${manuals.length} safety manuals`);
    }
    // List mode
    else {
      console.log(`Type: ${options.type}`);
      console.log(`Limit: ${limit}`);
      console.log(`Offset: ${offset}`);
      console.log('─'.repeat(50));

      // Fetch assets
      if (options.type === 'asset' || options.type === 'all') {
        const assetDocs = await vectorStore.list({
          sourceType: 'ASSET',
          limit,
          offset,
        });

        assets = assetDocs.map((doc) => doc.metadata as unknown as Asset);
      }

      // Fetch safety manuals
      if (options.type === 'manual' || options.type === 'all') {
        const manualDocs = await vectorStore.list({
          sourceType: 'SAFETY_MANUAL',
          limit,
          offset,
        });

        manuals = manualDocs.map((doc) => doc.metadata as unknown as SafetyDocument);
      }
    }

    // Display assets
    if (assets.length > 0) {
      console.log('\n🔧 ASSETS');
      console.log('─'.repeat(50));
      assets.forEach((asset, index) => {
        console.log(formatAsset(asset, index));
      });
    }

    // Display safety manuals
    if (manuals.length > 0) {
      console.log('\n📚 SAFETY MANUALS');
      console.log('─'.repeat(50));
      manuals.forEach((manual, index) => {
        console.log(formatSafetyDocument(manual, index));
      });
    }

    // Display summary
    displaySummary(assetCount, manualCount, assets.length, manuals.length, false);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    process.exit(1);
  }
}

// Run CLI
void main();
