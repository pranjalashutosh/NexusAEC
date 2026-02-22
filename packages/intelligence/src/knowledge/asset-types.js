'use strict';
/**
 * Asset Schema Types
 *
 * Defines types for asset management system data.
 * Used for ingesting and querying asset information in the knowledge base.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.validateAsset = validateAsset;
exports.validateSafetyDocument = validateSafetyDocument;
exports.assetToContent = assetToContent;
exports.safetyDocumentToContent = safetyDocumentToContent;
exports.normalizeAssetCategory = normalizeAssetCategory;
/**
 * Validates asset data
 */
function validateAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    return false;
  }
  var a = asset;
  // Required fields
  if (!a.assetId || typeof a.assetId !== 'string') {
    return false;
  }
  if (!a.name || typeof a.name !== 'string') {
    return false;
  }
  if (!a.description || typeof a.description !== 'string') {
    return false;
  }
  if (!a.category || typeof a.category !== 'string') {
    return false;
  }
  if (!a.location || typeof a.location !== 'string') {
    return false;
  }
  // Optional fields type check
  if (a.criticality !== undefined && typeof a.criticality !== 'string') {
    return false;
  }
  if (a.status !== undefined && typeof a.status !== 'string') {
    return false;
  }
  if (a.metadata !== undefined && (typeof a.metadata !== 'object' || a.metadata === null)) {
    return false;
  }
  return true;
}
/**
 * Validates safety document data
 */
function validateSafetyDocument(doc) {
  if (!doc || typeof doc !== 'object') {
    return false;
  }
  var d = doc;
  // Required fields
  if (!d.id || typeof d.id !== 'string') {
    return false;
  }
  if (!d.title || typeof d.title !== 'string') {
    return false;
  }
  if (!d.content || typeof d.content !== 'string') {
    return false;
  }
  if (!d.type || typeof d.type !== 'string') {
    return false;
  }
  // Optional fields type check
  if (d.relatedAssets !== undefined && !Array.isArray(d.relatedAssets)) {
    return false;
  }
  if (d.metadata !== undefined && (typeof d.metadata !== 'object' || d.metadata === null)) {
    return false;
  }
  return true;
}
/**
 * Creates searchable content from asset for embedding
 */
function assetToContent(asset) {
  var parts = [
    'Asset ID: '.concat(asset.assetId),
    'Name: '.concat(asset.name),
    'Description: '.concat(asset.description),
    'Category: '.concat(asset.category),
    'Location: '.concat(asset.location),
  ];
  if (asset.criticality) {
    parts.push('Criticality: '.concat(asset.criticality));
  }
  if (asset.status) {
    parts.push('Status: '.concat(asset.status));
  }
  if (asset.metadata) {
    Object.entries(asset.metadata).forEach(function (_a) {
      var key = _a[0],
        value = _a[1];
      parts.push(''.concat(key, ': ').concat(value));
    });
  }
  return parts.join('\n');
}
/**
 * Creates searchable content from safety document for embedding
 */
function safetyDocumentToContent(doc) {
  var parts = [
    'Document ID: '.concat(doc.id),
    'Title: '.concat(doc.title),
    'Type: '.concat(doc.type),
    'Content: '.concat(doc.content),
  ];
  if (doc.relatedAssets && doc.relatedAssets.length > 0) {
    parts.push('Related Assets: '.concat(doc.relatedAssets.join(', ')));
  }
  if (doc.metadata) {
    Object.entries(doc.metadata).forEach(function (_a) {
      var key = _a[0],
        value = _a[1];
      parts.push(''.concat(key, ': ').concat(value));
    });
  }
  return parts.join('\n');
}
/**
 * Normalizes asset category to standard enum value
 */
function normalizeAssetCategory(category) {
  var normalized = category.toUpperCase().replace(/[^A-Z]/g, '_');
  var standardCategories = [
    'PUMP',
    'VALVE',
    'GENERATOR',
    'TANK',
    'MOTOR',
    'SENSOR',
    'CONTROL_PANEL',
    'PIPE',
    'HVAC',
    'ELECTRICAL',
    'MECHANICAL',
    'INSTRUMENTATION',
    'OTHER',
  ];
  // Check if normalized matches any standard category
  if (standardCategories.includes(normalized)) {
    return normalized;
  }
  // Return original if no match
  return category;
}
