#!/usr/bin/env node

/**
 * CLI tool for ingesting assets into the vector store
 *
 * Usage:
 *   npx tsx cli/ingest-assets.ts --file ./data/assets.csv
 *   npx tsx cli/ingest-assets.ts --file ./data/seed-assets.json --clear
 *
 * Environment variables required:
 *   OPENAI_API_KEY - OpenAI API key for embeddings
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_ANON_KEY - Supabase anonymous key
 */

import path from 'path';

import { Command } from 'commander';
import { config } from 'dotenv';
import { OpenAI } from 'openai';

import { AssetIngestion, type IngestionProgress } from '../src/knowledge/asset-ingestion';
import { SupabaseVectorStore } from '../src/knowledge/supabase-vector-store';

// Load environment variables
config();

/**
 * Progress bar display
 */
function displayProgress(progress: IngestionProgress): void {
  const barLength = 40;
  const filled = Math.round((progress.percentage / 100) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  const phaseColors: Record<string, string> = {
    loading: '\x1b[36m', // Cyan
    embedding: '\x1b[33m', // Yellow
    storing: '\x1b[34m', // Blue
    complete: '\x1b[32m', // Green
  };

  const color = phaseColors[progress.phase] || '\x1b[0m';
  const reset = '\x1b[0m';

  // Clear line and write progress
  process.stdout.write('\r\x1b[K');
  process.stdout.write(
    `${color}${progress.phase.toUpperCase()}${reset} [${bar}] ${progress.percentage}% - ${progress.message}`
  );

  if (progress.phase === 'complete') {
    process.stdout.write('\n');
  }
}

/**
 * Create OpenAI embedding generator
 */
function createEmbeddingGenerator(apiKey: string, model = 'text-embedding-3-small') {
  const openai = new OpenAI({ apiKey });

  return async (text: string): Promise<number[]> => {
    try {
      const response = await openai.embeddings.create({
        model,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI embedding error: ${errorMessage}`);
    }
  };
}

/**
 * Main CLI function
 */
async function main() {
  const program = new Command();

  program
    .name('ingest-assets')
    .description('Ingest assets from CSV or JSON files into the vector store')
    .version('1.0.0')
    .requiredOption('-f, --file <path>', 'Path to CSV or JSON file')
    .option('-c, --clear', 'Clear existing assets before ingestion', false)
    .option('-b, --batch-size <number>', 'Batch size for processing', '10')
    .option('--skip-validation', 'Skip asset validation', false)
    .option('--max-concurrency <number>', 'Max concurrent embedding requests', '5')
    .option('--embedding-model <model>', 'OpenAI embedding model', 'text-embedding-3-small')
    .option('--no-progress', 'Disable progress reporting')
    .parse(process.argv);

  const options = program.opts();

  // Validate environment variables
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!openaiApiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!supabaseUrl) {
    console.error('❌ Error: SUPABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!supabaseAnonKey) {
    console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required');
    process.exit(1);
  }

  // Validate file path
  const filePath = path.resolve(options.file);
  const fileExt = path.extname(filePath).toLowerCase();

  if (!['.csv', '.json'].includes(fileExt)) {
    console.error('❌ Error: File must be .csv or .json');
    process.exit(1);
  }

  console.log('\n📦 NexusAEC Asset Ingestion');
  console.log('─'.repeat(50));
  console.log(`File: ${filePath}`);
  console.log(`Format: ${fileExt.substring(1).toUpperCase()}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Max concurrency: ${options.maxConcurrency}`);
  console.log(`Embedding model: ${options.embeddingModel}`);
  console.log(`Clear existing: ${options.clear ? 'Yes' : 'No'}`);
  console.log(`Skip validation: ${options.skipValidation ? 'Yes' : 'No'}`);
  console.log('─'.repeat(50));
  console.log('');

  try {
    // Initialize vector store (wraps Supabase client internally)
    const vectorStore = new SupabaseVectorStore({
      supabaseUrl,
      supabaseKey: supabaseAnonKey,
    });

    // Create embedding generator
    const embeddingGenerator = createEmbeddingGenerator(openaiApiKey, options.embeddingModel);

    // Create ingestion instance
    const ingestion = new AssetIngestion(vectorStore, embeddingGenerator, {
      batchSize: parseInt(options.batchSize, 10),
      clearExisting: options.clear,
      skipValidation: options.skipValidation,
      maxConcurrency: parseInt(options.maxConcurrency, 10),
      ...(options.progress ? { onProgress: displayProgress } : {}),
    });

    // Start ingestion
    let result;

    if (fileExt === '.csv') {
      result = await ingestion.ingestAssetsFromCSV(filePath);
    } else {
      result = await ingestion.ingestAssetsFromJSON(filePath);
    }

    // Display results
    console.log('\n✅ Ingestion Complete');
    console.log('─'.repeat(50));
    console.log(`Total assets: ${result.total}`);
    console.log(`✓ Succeeded: ${result.succeeded}`);
    console.log(`✗ Failed: ${result.failed}`);
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach((err) => {
        const itemInfo = err.itemId ? ` [${err.itemId}]` : '';
        const rowInfo = err.index !== undefined ? ` (row ${err.index})` : '';
        console.log(`  - ${err.error}${itemInfo}${rowInfo}`);
      });

      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    console.log('');

    // Exit with appropriate code
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal Error:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    process.exit(1);
  }
}

// Run CLI
void main();
