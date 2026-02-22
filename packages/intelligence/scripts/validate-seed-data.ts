/**
 * Validation script for seed data files
 *
 * Validates that seed-assets.json conforms to Asset type schema
 */

import fs from 'fs';
import path from 'path';

import { validateAsset, type Asset } from '../src/knowledge/asset-types';

const DATA_DIR = path.join(__dirname, '../data');
const SEED_ASSETS_FILE = path.join(DATA_DIR, 'seed-assets.json');

function validateSeedAssets(): void {
  console.log('Validating seed-assets.json...\n');

  // Check if file exists
  if (!fs.existsSync(SEED_ASSETS_FILE)) {
    console.error(`❌ File not found: ${SEED_ASSETS_FILE}`);
    process.exit(1);
  }

  // Read and parse file
  let assets: unknown[];
  try {
    const fileContent = fs.readFileSync(SEED_ASSETS_FILE, 'utf-8');
    assets = JSON.parse(fileContent);
  } catch (error) {
    console.error(
      `❌ Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }

  // Validate it's an array
  if (!Array.isArray(assets)) {
    console.error('❌ Seed data must be an array');
    process.exit(1);
  }

  console.log(`Found ${assets.length} assets in seed file`);
  console.log('-----------------------------------\n');

  // Validate each asset
  let validCount = 0;
  let invalidCount = 0;
  const errors: Array<{ index: number; assetId: string; error: string }> = [];

  assets.forEach((asset, index) => {
    if (validateAsset(asset)) {
      validCount++;
      const a = asset;
      console.log(`✓ [${index + 1}/${assets.length}] ${a.assetId} - ${a.name}`);
    } else {
      invalidCount++;
      const assetId =
        typeof asset === 'object' && asset !== null && 'assetId' in asset
          ? String((asset as any).assetId)
          : 'UNKNOWN';

      errors.push({
        index: index + 1,
        assetId,
        error: 'Failed validation',
      });
      console.log(`✗ [${index + 1}/${assets.length}] ${assetId} - INVALID`);
    }
  });

  // Summary
  console.log('\n-----------------------------------');
  console.log('VALIDATION SUMMARY');
  console.log('-----------------------------------');
  console.log(`Total assets: ${assets.length}`);
  console.log(`Valid: ${validCount}`);
  console.log(`Invalid: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log('\n❌ VALIDATION FAILED');
    console.log('\nErrors:');
    errors.forEach((err) => {
      console.log(`  - Asset #${err.index} (${err.assetId}): ${err.error}`);
    });
    process.exit(1);
  }

  // Additional checks
  console.log('\n-----------------------------------');
  console.log('ADDITIONAL CHECKS');
  console.log('-----------------------------------');

  // Check for duplicate asset IDs
  const assetIds = (assets as Asset[]).map((a) => a.assetId);
  const duplicates = assetIds.filter((id, index) => assetIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    console.log(`❌ Duplicate asset IDs found: ${duplicates.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ No duplicate asset IDs`);

  // Check category distribution
  const categoryCounts: Record<string, number> = {};
  (assets as Asset[]).forEach((a) => {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  });
  console.log('\nCategory distribution:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  ${category}: ${count}`);
    });

  // Check criticality distribution
  const criticalityCounts: Record<string, number> = {};
  (assets as Asset[]).forEach((a) => {
    const crit = a.criticality || 'UNSPECIFIED';
    criticalityCounts[crit] = (criticalityCounts[crit] || 0) + 1;
  });
  console.log('\nCriticality distribution:');
  Object.entries(criticalityCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([criticality, count]) => {
      console.log(`  ${criticality}: ${count}`);
    });

  // Check location distribution
  const locationCounts: Record<string, number> = {};
  (assets as Asset[]).forEach((a) => {
    locationCounts[a.location] = (locationCounts[a.location] || 0) + 1;
  });
  console.log('\nLocation distribution:');
  Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([location, count]) => {
      console.log(`  ${location}: ${count}`);
    });

  console.log('\n✅ ALL VALIDATIONS PASSED\n');
}

// Run validation
validateSeedAssets();
