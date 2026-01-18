/**
 * Validation script for safety manual seed data
 */

import fs from 'fs';
import path from 'path';

import { validateSafetyDocument, type SafetyDocument } from '../src/knowledge/asset-types';

const DATA_DIR = path.join(__dirname, '../data');
const SEED_MANUALS_FILE = path.join(DATA_DIR, 'seed-safety-manuals.json');

function validateSafetyManuals(): void {
  console.log('Validating seed-safety-manuals.json...\n');

  // Check if file exists
  if (!fs.existsSync(SEED_MANUALS_FILE)) {
    console.error(`❌ File not found: ${SEED_MANUALS_FILE}`);
    process.exit(1);
  }

  // Read and parse file
  let documents: unknown[];
  try {
    const fileContent = fs.readFileSync(SEED_MANUALS_FILE, 'utf-8');
    documents = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Validate it's an array
  if (!Array.isArray(documents)) {
    console.error('❌ Seed data must be an array');
    process.exit(1);
  }

  console.log(`Found ${documents.length} safety documents in seed file`);
  console.log('-----------------------------------\n');

  // Validate each document
  let validCount = 0;
  let invalidCount = 0;
  const errors: Array<{ index: number; id: string; error: string }> = [];

  documents.forEach((doc, index) => {
    if (validateSafetyDocument(doc)) {
      validCount++;
      const d = doc;
      console.log(`✓ [${index + 1}/${documents.length}] ${d.id} - ${d.title.substring(0, 60)}...`);
    } else {
      invalidCount++;
      const id = typeof doc === 'object' && doc !== null && 'id' in doc
        ? String((doc as any).id)
        : 'UNKNOWN';

      errors.push({
        index: index + 1,
        id,
        error: 'Failed validation',
      });
      console.log(`✗ [${index + 1}/${documents.length}] ${id} - INVALID`);
    }
  });

  // Summary
  console.log('\n-----------------------------------');
  console.log('VALIDATION SUMMARY');
  console.log('-----------------------------------');
  console.log(`Total documents: ${documents.length}`);
  console.log(`Valid: ${validCount}`);
  console.log(`Invalid: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log('\n❌ VALIDATION FAILED');
    console.log('\nErrors:');
    errors.forEach((err) => {
      console.log(`  - Document #${err.index} (${err.id}): ${err.error}`);
    });
    process.exit(1);
  }

  // Additional checks
  console.log('\n-----------------------------------');
  console.log('ADDITIONAL CHECKS');
  console.log('-----------------------------------');

  // Check for duplicate IDs
  const ids = (documents as SafetyDocument[]).map((d) => d.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    console.log(`❌ Duplicate document IDs found: ${duplicates.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ No duplicate document IDs`);

  // Check type distribution
  const typeCounts: Record<string, number> = {};
  (documents as SafetyDocument[]).forEach((d) => {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
  });
  console.log('\nDocument type distribution:');
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  // Check content length
  const contentLengths = (documents as SafetyDocument[]).map((d) => d.content.length);
  const avgLength = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
  const minLength = Math.min(...contentLengths);
  const maxLength = Math.max(...contentLengths);
  console.log('\nContent statistics:');
  console.log(`  Average length: ${avgLength.toLocaleString()} characters`);
  console.log(`  Min length: ${minLength.toLocaleString()} characters`);
  console.log(`  Max length: ${maxLength.toLocaleString()} characters`);

  // Check related assets
  const totalRelatedAssets = (documents as SafetyDocument[]).reduce((sum, d) => {
    return sum + (d.relatedAssets?.length || 0);
  }, 0);
  const avgRelatedAssets = (totalRelatedAssets / documents.length).toFixed(1);
  console.log('\nRelated assets:');
  console.log(`  Total asset references: ${totalRelatedAssets}`);
  console.log(`  Average per document: ${avgRelatedAssets}`);

  // List all related assets
  const allAssets = new Set<string>();
  (documents as SafetyDocument[]).forEach((d) => {
    d.relatedAssets?.forEach((asset) => allAssets.add(asset));
  });
  console.log(`  Unique assets referenced: ${allAssets.size}`);
  console.log(`  Assets: ${Array.from(allAssets).sort().join(', ')}`);

  console.log('\n✅ ALL VALIDATIONS PASSED\n');
}

// Run validation
validateSafetyManuals();
