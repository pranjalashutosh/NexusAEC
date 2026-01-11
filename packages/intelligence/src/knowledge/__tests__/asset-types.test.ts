/**
 * Tests for Asset Types
 */

import {
  type Asset,
  type SafetyDocument,
  validateAsset,
  validateSafetyDocument,
  assetToContent,
  safetyDocumentToContent,
  normalizeAssetCategory,
} from '../asset-types';

describe('Asset Types', () => {
  describe('validateAsset', () => {
    it('should validate valid asset', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(true);
    });

    it('should validate asset with optional fields', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        criticality: 'HIGH',
        status: 'OPERATIONAL',
        metadata: {
          manufacturer: 'FlowTech',
          model: 'FT-5000',
        },
      };

      expect(validateAsset(asset)).toBe(true);
    });

    it('should reject null', () => {
      expect(validateAsset(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateAsset(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateAsset('not an asset')).toBe(false);
      expect(validateAsset(123)).toBe(false);
      expect(validateAsset(true)).toBe(false);
    });

    it('should reject asset missing assetId', () => {
      const asset = {
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset missing name', () => {
      const asset = {
        assetId: 'P-104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset missing description', () => {
      const asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset missing category', () => {
      const asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset missing location', () => {
      const asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset with invalid field types', () => {
      const asset = {
        assetId: 123,
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset with invalid metadata type', () => {
      const asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        metadata: 'invalid',
      };

      expect(validateAsset(asset)).toBe(false);
    });

    it('should reject asset with null metadata', () => {
      const asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        metadata: null,
      };

      expect(validateAsset(asset)).toBe(false);
    });
  });

  describe('validateSafetyDocument', () => {
    it('should validate valid safety document', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
      };

      expect(validateSafetyDocument(doc)).toBe(true);
    });

    it('should validate document with optional fields', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
        relatedAssets: ['P-104', 'P-105'],
        metadata: {
          version: '2.0',
          author: 'Safety Team',
        },
      };

      expect(validateSafetyDocument(doc)).toBe(true);
    });

    it('should reject null', () => {
      expect(validateSafetyDocument(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateSafetyDocument(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateSafetyDocument('not a document')).toBe(false);
    });

    it('should reject document missing id', () => {
      const doc = {
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });

    it('should reject document missing title', () => {
      const doc = {
        id: 'SM-001',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });

    it('should reject document missing content', () => {
      const doc = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        type: 'SAFETY_MANUAL',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });

    it('should reject document missing type', () => {
      const doc = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });

    it('should reject document with invalid relatedAssets type', () => {
      const doc = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
        relatedAssets: 'P-104',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });

    it('should reject document with invalid metadata type', () => {
      const doc = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
        metadata: 'invalid',
      };

      expect(validateSafetyDocument(doc)).toBe(false);
    });
  });

  describe('assetToContent', () => {
    it('should convert asset to searchable content', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      const content = assetToContent(asset);

      expect(content).toContain('Asset ID: P-104');
      expect(content).toContain('Name: Pump Station 104');
      expect(content).toContain('Description: Main water distribution pump');
      expect(content).toContain('Category: PUMP');
      expect(content).toContain('Location: Riverside Bridge');
    });

    it('should include optional fields in content', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        criticality: 'HIGH',
        status: 'OPERATIONAL',
      };

      const content = assetToContent(asset);

      expect(content).toContain('Criticality: HIGH');
      expect(content).toContain('Status: OPERATIONAL');
    });

    it('should include metadata in content', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        metadata: {
          manufacturer: 'FlowTech',
          model: 'FT-5000',
        },
      };

      const content = assetToContent(asset);

      expect(content).toContain('manufacturer: FlowTech');
      expect(content).toContain('model: FT-5000');
    });

    it('should format content with newlines', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      const content = assetToContent(asset);

      expect(content.split('\n').length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('safetyDocumentToContent', () => {
    it('should convert safety document to searchable content', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
      };

      const content = safetyDocumentToContent(doc);

      expect(content).toContain('Document ID: SM-001');
      expect(content).toContain('Title: Pump Safety Manual');
      expect(content).toContain('Type: SAFETY_MANUAL');
      expect(content).toContain('Content: Safety procedures for pump operation');
    });

    it('should include related assets in content', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
        relatedAssets: ['P-104', 'P-105'],
      };

      const content = safetyDocumentToContent(doc);

      expect(content).toContain('Related Assets: P-104, P-105');
    });

    it('should include metadata in content', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
        metadata: {
          version: '2.0',
          author: 'Safety Team',
        },
      };

      const content = safetyDocumentToContent(doc);

      expect(content).toContain('version: 2.0');
      expect(content).toContain('author: Safety Team');
    });

    it('should format content with newlines', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures for pump operation',
        type: 'SAFETY_MANUAL',
      };

      const content = safetyDocumentToContent(doc);

      expect(content.split('\n').length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('normalizeAssetCategory', () => {
    it('should normalize lowercase to standard category', () => {
      expect(normalizeAssetCategory('pump')).toBe('PUMP');
      expect(normalizeAssetCategory('valve')).toBe('VALVE');
      expect(normalizeAssetCategory('generator')).toBe('GENERATOR');
      expect(normalizeAssetCategory('tank')).toBe('TANK');
      expect(normalizeAssetCategory('motor')).toBe('MOTOR');
    });

    it('should normalize mixed case to standard category', () => {
      expect(normalizeAssetCategory('Pump')).toBe('PUMP');
      expect(normalizeAssetCategory('Valve')).toBe('VALVE');
      expect(normalizeAssetCategory('GeNeRaToR')).toBe('GENERATOR');
    });

    it('should normalize categories with spaces', () => {
      expect(normalizeAssetCategory('control panel')).toBe('CONTROL_PANEL');
      expect(normalizeAssetCategory('Control Panel')).toBe('CONTROL_PANEL');
      expect(normalizeAssetCategory('CONTROL PANEL')).toBe('CONTROL_PANEL');
    });

    it('should normalize categories with hyphens', () => {
      expect(normalizeAssetCategory('control-panel')).toBe('CONTROL_PANEL');
      expect(normalizeAssetCategory('CONTROL-PANEL')).toBe('CONTROL_PANEL');
    });

    it('should return already normalized categories', () => {
      expect(normalizeAssetCategory('PUMP')).toBe('PUMP');
      expect(normalizeAssetCategory('VALVE')).toBe('VALVE');
      expect(normalizeAssetCategory('CONTROL_PANEL')).toBe('CONTROL_PANEL');
    });

    it('should preserve custom categories', () => {
      expect(normalizeAssetCategory('Custom Equipment')).toBe('Custom Equipment');
      expect(normalizeAssetCategory('Special Asset Type')).toBe('Special Asset Type');
    });

    it('should handle all standard categories', () => {
      const standardCategories = [
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

      standardCategories.forEach((category) => {
        expect(normalizeAssetCategory(category.toLowerCase())).toBe(category);
        expect(normalizeAssetCategory(category)).toBe(category);
        expect(normalizeAssetCategory(category.replace('_', ' '))).toBe(category);
      });
    });
  });

  describe('Type Definitions', () => {
    it('should allow creating Asset with required fields', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(asset).toBeDefined();
      expect(asset.assetId).toBe('P-104');
    });

    it('should allow creating Asset with all fields', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        criticality: 'HIGH',
        status: 'OPERATIONAL',
        metadata: {
          manufacturer: 'FlowTech',
          model: 'FT-5000',
          serialNumber: 'SN-12345',
        },
      };

      expect(asset).toBeDefined();
      expect(asset.criticality).toBe('HIGH');
      expect(asset.status).toBe('OPERATIONAL');
      expect(asset.metadata?.manufacturer).toBe('FlowTech');
    });

    it('should allow creating SafetyDocument with required fields', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
      };

      expect(doc).toBeDefined();
      expect(doc.id).toBe('SM-001');
    });

    it('should allow custom asset categories', () => {
      const asset: Asset = {
        assetId: 'X-001',
        name: 'Custom Equipment',
        description: 'Special equipment type',
        category: 'Custom Category',
        location: 'Main Site',
      };

      expect(asset.category).toBe('Custom Category');
    });
  });

  describe('Edge Cases', () => {
    it('should handle assets with empty metadata', () => {
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: 'Main water distribution pump',
        category: 'PUMP',
        location: 'Riverside Bridge',
        metadata: {},
      };

      expect(validateAsset(asset)).toBe(true);
      const content = assetToContent(asset);
      expect(content).toBeDefined();
    });

    it('should handle safety documents with empty related assets', () => {
      const doc: SafetyDocument = {
        id: 'SM-001',
        title: 'Pump Safety Manual',
        content: 'Safety procedures',
        type: 'SAFETY_MANUAL',
        relatedAssets: [],
      };

      expect(validateSafetyDocument(doc)).toBe(true);
      const content = safetyDocumentToContent(doc);
      expect(content).toBeDefined();
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const asset: Asset = {
        assetId: 'P-104',
        name: 'Pump Station 104',
        description: longDescription,
        category: 'PUMP',
        location: 'Riverside Bridge',
      };

      expect(validateAsset(asset)).toBe(true);
      const content = assetToContent(asset);
      expect(content).toContain(longDescription);
    });

    it('should handle special characters in asset fields', () => {
      const asset: Asset = {
        assetId: 'P-104/A',
        name: 'Pump Station #104 (Primary)',
        description: 'Main water distribution pump @ Riverside',
        category: 'PUMP',
        location: 'Riverside Bridge & Park',
      };

      expect(validateAsset(asset)).toBe(true);
      const content = assetToContent(asset);
      expect(content).toContain('Pump Station #104 (Primary)');
    });
  });
});
