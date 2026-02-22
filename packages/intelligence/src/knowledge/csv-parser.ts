/**
 * CSV Parser for Asset Data
 *
 * Parses CSV files containing asset data and converts them to Asset objects.
 * Validates required fields and handles optional metadata.
 */

import fs from 'fs';

import { parse } from 'csv-parse/sync';

import {
  type Asset,
  type AssetCriticality,
  type AssetStatus,
  validateAsset,
  normalizeAssetCategory,
} from './asset-types';

/**
 * Result of CSV parsing operation
 */
export interface CSVParseResult {
  /**
   * Successfully parsed assets
   */
  assets: Asset[];

  /**
   * Parsing errors
   */
  errors: Array<{
    /**
     * Row number (1-indexed, excluding header)
     */
    row: number;

    /**
     * Asset ID if available
     */
    assetId?: string;

    /**
     * Error message
     */
    error: string;
  }>;

  /**
   * Parse statistics
   */
  stats: {
    /**
     * Total rows processed (excluding header)
     */
    totalRows: number;

    /**
     * Successfully parsed assets
     */
    successCount: number;

    /**
     * Failed rows
     */
    failureCount: number;
  };
}

/**
 * Options for CSV parsing
 */
export interface CSVParseOptions {
  /**
   * Skip validation of parsed assets
   * Default: false
   */
  skipValidation?: boolean;

  /**
   * Continue parsing even if errors encountered
   * Default: true
   */
  continueOnError?: boolean;

  /**
   * Normalize category values to standard categories
   * Default: true
   */
  normalizeCategories?: boolean;

  /**
   * Column name mappings for non-standard CSV headers
   * Maps CSV column name to Asset property name
   *
   * Example: { "Asset ID": "assetId", "Asset Name": "name" }
   */
  columnMapping?: Record<string, string>;
}

/**
 * Required CSV columns
 */
const REQUIRED_COLUMNS = ['assetId', 'name', 'description', 'category', 'location'];

function coerceCSVRecords(parsed: unknown): Record<string, string>[] {
  if (!Array.isArray(parsed)) {
    throw new Error('CSV parser returned an unexpected result.');
  }

  for (const entry of parsed) {
    if (!isStringRecord(entry)) {
      throw new Error('CSV contains invalid rows. Expected string values.');
    }
  }

  return parsed as Record<string, string>[];
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Standard column names (case-insensitive alternatives)
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  assetId: ['assetid', 'asset_id', 'id', 'asset id', 'assetno', 'asset no', 'asset number'],
  name: ['name', 'asset name', 'asset_name', 'assetname', 'title'],
  description: ['description', 'desc', 'details', 'notes'],
  category: ['category', 'type', 'asset type', 'asset_type', 'assettype', 'class'],
  location: ['location', 'site', 'facility', 'place', 'address'],
  criticality: ['criticality', 'priority', 'importance', 'critical'],
  status: ['status', 'state', 'condition', 'operational status', 'operational_status'],
};

/**
 * Known metadata fields (not part of core Asset schema)
 */
const METADATA_FIELDS = [
  'manufacturer',
  'model',
  'serialNumber',
  'serial_number',
  'installDate',
  'install_date',
  'lastMaintenance',
  'last_maintenance',
  'nextMaintenance',
  'next_maintenance',
  'lastCalibration',
  'last_calibration',
  'nextCalibration',
  'next_calibration',
  'lastInspection',
  'last_inspection',
  'nextInspection',
  'next_inspection',
  'warranty',
  'capacity',
  'pressure',
  'powerRating',
  'power_rating',
  'voltage',
  'efficiency',
  'department',
  'responsible',
  'owner',
  'parentAsset',
  'parent_asset',
];

/**
 * Parse CSV file containing asset data
 *
 * @param filePath - Path to CSV file
 * @param options - Parsing options
 * @returns Parse result with assets and errors
 *
 * @example
 * ```typescript
 * const result = parseAssetCSV('./assets.csv');
 *
 * if (result.errors.length === 0) {
 *   console.log(`Successfully parsed ${result.assets.length} assets`);
 *   // Use result.assets for ingestion
 * } else {
 *   console.error(`Parsing errors: ${result.errors.length}`);
 *   result.errors.forEach(err => {
 *     console.error(`Row ${err.row}: ${err.error}`);
 *   });
 * }
 * ```
 */
export function parseAssetCSV(filePath: string, options: CSVParseOptions = {}): CSVParseResult {
  const {
    skipValidation = false,
    continueOnError = true,
    normalizeCategories = true,
    columnMapping = {},
  } = options;

  const result: CSVParseResult = {
    assets: [],
    errors: [],
    stats: {
      totalRows: 0,
      successCount: 0,
      failureCount: 0,
    },
  };

  try {
    // Read file
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Parse CSV
    const records = coerceCSVRecords(
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle UTF-8 BOM
      })
    );

    result.stats.totalRows = records.length;

    // Get headers from first record
    if (records.length === 0) {
      return result;
    }

    const firstRecord = records[0];
    if (!firstRecord) {
      return result;
    }
    const headers = Object.keys(firstRecord);

    // Map column names to standard property names
    const columnMap = buildColumnMap(headers, columnMapping);

    // Check for required columns
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !Object.keys(columnMap).includes(col));

    if (missingColumns.length > 0) {
      throw new Error(
        `Missing required columns: ${missingColumns.join(', ')}. ` +
          `Found columns: ${headers.join(', ')}`
      );
    }

    // Parse each record
    records.forEach((record, index) => {
      const rowNumber = index + 1;

      try {
        const asset = parseAssetRecord(record, columnMap, {
          normalizeCategories,
          skipValidation,
        });

        // Validate if requested
        if (!skipValidation && !validateAsset(asset)) {
          throw new Error('Asset validation failed');
        }

        result.assets.push(asset);
        result.stats.successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const assetIdCol = columnMap['assetId'];
        const assetIdValue = assetIdCol ? record[assetIdCol] : undefined;

        const rowErr: { row: number; assetId?: string; error: string } = {
          row: rowNumber,
          error: errorMessage,
        };
        if (assetIdValue) {
          rowErr.assetId = assetIdValue;
        }
        result.errors.push(rowErr);

        result.stats.failureCount++;

        if (!continueOnError) {
          throw new Error(`Parsing failed at row ${rowNumber}: ${errorMessage}`);
        }
      }
    });

    return result;
  } catch (error) {
    // Fatal parsing error
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (result.errors.length === 0) {
      // No row-specific errors yet, this is a file-level error
      result.errors.push({
        row: 0,
        error: errorMessage,
      });
    }

    return result;
  }
}

/**
 * Parse CSV string content
 *
 * @param csvContent - CSV file content as string
 * @param options - Parsing options
 * @returns Parse result
 */
export function parseAssetCSVString(
  csvContent: string,
  options: CSVParseOptions = {}
): CSVParseResult {
  const {
    skipValidation = false,
    continueOnError = true,
    normalizeCategories = true,
    columnMapping = {},
  } = options;

  const result: CSVParseResult = {
    assets: [],
    errors: [],
    stats: {
      totalRows: 0,
      successCount: 0,
      failureCount: 0,
    },
  };

  try {
    // Parse CSV
    const records = coerceCSVRecords(
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      })
    );

    result.stats.totalRows = records.length;

    if (records.length === 0) {
      return result;
    }

    const firstRecord = records[0];
    if (!firstRecord) {
      return result;
    }
    const headers = Object.keys(firstRecord);
    const columnMap = buildColumnMap(headers, columnMapping);

    const missingColumns = REQUIRED_COLUMNS.filter((col) => !Object.keys(columnMap).includes(col));

    if (missingColumns.length > 0) {
      throw new Error(
        `Missing required columns: ${missingColumns.join(', ')}. ` +
          `Found columns: ${headers.join(', ')}`
      );
    }

    records.forEach((record, index) => {
      const rowNumber = index + 1;

      try {
        const asset = parseAssetRecord(record, columnMap, {
          normalizeCategories,
          skipValidation,
        });

        if (!skipValidation && !validateAsset(asset)) {
          throw new Error('Asset validation failed');
        }

        result.assets.push(asset);
        result.stats.successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const assetIdCol = columnMap['assetId'];
        const assetIdValue = assetIdCol ? record[assetIdCol] : undefined;

        const rowErr: { row: number; assetId?: string; error: string } = {
          row: rowNumber,
          error: errorMessage,
        };
        if (assetIdValue) {
          rowErr.assetId = assetIdValue;
        }
        result.errors.push(rowErr);

        result.stats.failureCount++;

        if (!continueOnError) {
          throw new Error(`Parsing failed at row ${rowNumber}: ${errorMessage}`);
        }
      }
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (result.errors.length === 0) {
      result.errors.push({
        row: 0,
        error: errorMessage,
      });
    }

    return result;
  }
}

/**
 * Build column mapping from CSV headers to Asset properties
 */
function buildColumnMap(
  headers: string[],
  customMapping: Record<string, string>
): Record<string, string> {
  const columnMap: Record<string, string> = {};

  headers.forEach((header) => {
    const headerLower = header.toLowerCase().trim();

    // Check custom mapping first
    if (customMapping[header]) {
      columnMap[customMapping[header]] = header;
      return;
    }

    // Check against aliases
    for (const [propName, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(headerLower)) {
        columnMap[propName] = header;
        return;
      }
    }

    // Not a recognized core field - will be treated as metadata
  });

  return columnMap;
}

/**
 * Parse a single CSV record into an Asset
 */
function parseAssetRecord(
  record: Record<string, string>,
  columnMap: Record<string, string>,
  options: { normalizeCategories: boolean; skipValidation: boolean }
): Asset {
  // Resolve column names safely (avoids "undefined cannot be used as index type")
  const assetIdCol = columnMap['assetId'];
  const nameCol = columnMap['name'];
  const descCol = columnMap['description'];
  const categoryCol = columnMap['category'];
  const locationCol = columnMap['location'];
  const criticalityCol = columnMap['criticality'];
  const statusCol = columnMap['status'];

  // Extract required fields
  const assetId = assetIdCol ? record[assetIdCol]?.trim() : undefined;
  const name = nameCol ? record[nameCol]?.trim() : undefined;
  const description = descCol ? record[descCol]?.trim() : undefined;
  let category = categoryCol ? record[categoryCol]?.trim() : undefined;
  const location = locationCol ? record[locationCol]?.trim() : undefined;

  // Validate required fields (unless skipValidation is true)
  if (!options.skipValidation) {
    if (!assetId) {
      throw new Error('AssetID is required');
    }
    if (!name) {
      throw new Error('Name is required');
    }
    if (!description) {
      throw new Error('Description is required');
    }
    if (!category) {
      throw new Error('Category is required');
    }
    if (!location) {
      throw new Error('Location is required');
    }
  }

  // Normalize category if requested
  if (options.normalizeCategories) {
    category = normalizeAssetCategory(category ?? '');
  }

  // Extract optional fields
  const criticality = (criticalityCol ? record[criticalityCol]?.trim() : undefined) as
    | AssetCriticality
    | undefined;
  const status = (statusCol ? record[statusCol]?.trim() : undefined) as AssetStatus | undefined;

  // Extract metadata from remaining columns
  const metadata: Record<string, string> = {};

  Object.keys(record).forEach((header) => {
    const headerLower = header.toLowerCase().trim();

    // Skip core fields
    if (Object.values(columnMap).includes(header)) {
      return;
    }

    // Skip empty values
    const value = record[header]?.trim();
    if (!value) {
      return;
    }

    // Check if it's a known metadata field
    const isMetadata = METADATA_FIELDS.some((field) => field.toLowerCase() === headerLower);

    if (isMetadata || !Object.values(columnMap).includes(header)) {
      // Convert header to camelCase for metadata key
      const metadataKey = toCamelCase(header);
      metadata[metadataKey] = value;
    }
  });

  const asset: Asset = {
    assetId: assetId || '',
    name: name || '',
    description: description || '',
    category: category || '',
    location: location || '',
  };

  if (criticality) {
    asset.criticality = criticality;
  }

  if (status) {
    asset.status = status;
  }

  if (Object.keys(metadata).length > 0) {
    asset.metadata = metadata;
  }

  return asset;
}

/**
 * Convert string to camelCase
 * Handles spaces, hyphens, underscores while preserving existing camelCase
 */
function toCamelCase(str: string): string {
  // If the string has no spaces, hyphens, or underscores, return as-is with first char lowercase
  if (!/[\s\-_]/.test(str)) {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  // Convert strings with separators to camelCase
  return str
    .toLowerCase()
    .replace(/[\s\-_]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

/**
 * Detect CSV delimiter from file content
 *
 * @param content - CSV file content
 * @returns Detected delimiter (comma, semicolon, or tab)
 */
export function detectDelimiter(content: string): ',' | ';' | '\t' {
  const firstLine = content.split('\n')[0] ?? '';

  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) {
    return '\t';
  }

  if (semicolonCount > commaCount) {
    return ';';
  }

  return ',';
}
