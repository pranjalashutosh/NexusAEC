/**
 * Tests for CSV Parser
 */

import { parseAssetCSVString, detectDelimiter, type CSVParseResult } from '../csv-parser';
import type { Asset } from '../asset-types';

describe('CSV Parser', () => {
  describe('parseAssetCSVString', () => {
    describe('Basic parsing', () => {
      it('should parse valid CSV with required columns', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A
P-002,Pump 2,Backup pump,PUMP,Building B`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(2);
        expect(result.stats.successCount).toBe(2);
        expect(result.stats.failureCount).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.assets).toHaveLength(2);

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
        });
      });

      it('should parse CSV with optional fields', () => {
        const csv = `assetId,name,description,category,location,criticality,status
P-001,Pump 1,Main pump,PUMP,Building A,CRITICAL,OPERATIONAL`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
          criticality: 'CRITICAL',
          status: 'OPERATIONAL',
        });
      });

      it('should extract metadata from additional columns', () => {
        const csv = `assetId,name,description,category,location,manufacturer,model,serialNumber
P-001,Pump 1,Main pump,PUMP,Building A,FlowTech,FT-5000,SN-12345`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          manufacturer: 'FlowTech',
          model: 'FT-5000',
          serialNumber: 'SN-12345',
        });
      });

      it('should convert metadata keys to camelCase', () => {
        const csv = `assetId,name,description,category,location,Install Date,Last Maintenance,Power Rating
P-001,Pump 1,Main pump,PUMP,Building A,2020-01-01,2024-01-01,5kW`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          installDate: '2020-01-01',
          lastMaintenance: '2024-01-01',
          powerRating: '5kW',
        });
      });

      it('should handle empty CSV', () => {
        const csv = `assetId,name,description,category,location`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(0);
        expect(result.assets).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });

      it('should skip empty lines', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A

P-002,Pump 2,Backup pump,PUMP,Building B`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(2);
        expect(result.assets).toHaveLength(2);
      });

      it('should trim whitespace from values', () => {
        const csv = `assetId,name,description,category,location
  P-001  ,  Pump 1  ,  Main pump  ,  PUMP  ,  Building A  `;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
        });
      });
    });

    describe('Column mapping', () => {
      it('should recognize assetId aliases', () => {
        const testCases = [
          'assetid',
          'asset_id',
          'id',
          'asset id',
          'assetno',
          'asset no',
          'asset number',
        ];

        testCases.forEach((alias) => {
          const csv = `${alias},name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A`;

          const result = parseAssetCSVString(csv);

          expect(result.assets[0].assetId).toBe('P-001');
        });
      });

      it('should recognize name aliases', () => {
        const testCases = ['name', 'asset name', 'asset_name', 'assetname', 'title'];

        testCases.forEach((alias) => {
          const csv = `assetId,${alias},description,category,location
P-001,Pump 1,Main pump,PUMP,Building A`;

          const result = parseAssetCSVString(csv);

          expect(result.assets[0].name).toBe('Pump 1');
        });
      });

      it('should recognize category aliases', () => {
        const testCases = ['category', 'type', 'asset type', 'asset_type', 'assettype', 'class'];

        testCases.forEach((alias) => {
          const csv = `assetId,name,description,${alias},location
P-001,Pump 1,Main pump,PUMP,Building A`;

          const result = parseAssetCSVString(csv);

          expect(result.assets[0].category).toBe('PUMP');
        });
      });

      it('should recognize location aliases', () => {
        const testCases = ['location', 'site', 'facility', 'place', 'address'];

        testCases.forEach((alias) => {
          const csv = `assetId,name,description,category,${alias}
P-001,Pump 1,Main pump,PUMP,Building A`;

          const result = parseAssetCSVString(csv);

          expect(result.assets[0].location).toBe('Building A');
        });
      });

      it('should use custom column mapping', () => {
        const csv = `ID,AssetName,Details,Type,Site
P-001,Pump 1,Main pump,PUMP,Building A`;

        const result = parseAssetCSVString(csv, {
          columnMapping: {
            ID: 'assetId',
            AssetName: 'name',
            Details: 'description',
            Type: 'category',
            Site: 'location',
          },
        });

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
        });
      });

      it('should handle case-insensitive column matching', () => {
        const csv = `ASSETID,NAME,DESCRIPTION,CATEGORY,LOCATION
P-001,Pump 1,Main pump,PUMP,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
        });
      });
    });

    describe('Category normalization', () => {
      it('should normalize categories by default', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,pump,Building A
V-001,Valve 1,Main valve,control panel,Building B`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].category).toBe('PUMP');
        expect(result.assets[1].category).toBe('CONTROL_PANEL');
      });

      it('should skip normalization when disabled', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,pump,Building A`;

        const result = parseAssetCSVString(csv, {
          normalizeCategories: false,
        });

        expect(result.assets[0].category).toBe('pump');
      });

      it('should preserve custom categories', () => {
        const csv = `assetId,name,description,category,location
X-001,Custom 1,Custom equipment,CUSTOM_TYPE,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].category).toBe('CUSTOM_TYPE');
      });
    });

    describe('Validation', () => {
      it('should validate assets by default', () => {
        const csv = `assetId,name,description,category,location
,Pump 1,Main pump,PUMP,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.failureCount).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].error).toContain('AssetID is required');
      });

      it('should skip validation when disabled', () => {
        const csv = `assetId,name,description,category,location
,Pump 1,Main pump,PUMP,Building A`;

        const result = parseAssetCSVString(csv, {
          skipValidation: true,
        });

        expect(result.stats.successCount).toBe(1);
        expect(result.errors).toHaveLength(0);
      });

      it('should report validation errors with row numbers', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A
,,Missing fields,PUMP,Building B
P-003,Pump 3,Good pump,PUMP,Building C`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.successCount).toBe(2);
        expect(result.stats.failureCount).toBe(1);
        expect(result.errors[0].row).toBe(2);
      });

      it('should include assetId in error reports when available', () => {
        const csv = `assetId,name,description,category,location
P-001,,Missing name,PUMP,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.errors[0].assetId).toBe('P-001');
        expect(result.errors[0].error).toContain('Name is required');
      });
    });

    describe('Error handling', () => {
      it('should continue on error by default', () => {
        const csv = `assetId,name,description,category,location
P-001,,Missing name,PUMP,Building A
P-002,Pump 2,Good pump,PUMP,Building B
P-003,Pump 3,,PUMP,Building C`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(3);
        expect(result.stats.successCount).toBe(1);
        expect(result.stats.failureCount).toBe(2);
        expect(result.assets).toHaveLength(1);
        expect(result.errors).toHaveLength(2);
      });

      it('should stop on first error when continueOnError is false', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Good pump,PUMP,Building A
P-002,,Missing name,PUMP,Building B
P-003,Pump 3,Another pump,PUMP,Building C`;

        const result = parseAssetCSVString(csv, {
          continueOnError: false,
        });

        expect(result.stats.successCount).toBe(1);
        expect(result.stats.failureCount).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(2);
      });

      it('should handle missing required columns', () => {
        const csv = `assetId,name,description
P-001,Pump 1,Main pump`;

        const result = parseAssetCSVString(csv);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(0);
        expect(result.errors[0].error).toContain('Missing required columns');
        expect(result.errors[0].error).toContain('category');
        expect(result.errors[0].error).toContain('location');
      });

      it('should report found columns when required columns are missing', () => {
        const csv = `assetId,name
P-001,Pump 1`;

        const result = parseAssetCSVString(csv);

        expect(result.errors[0].error).toContain('Found columns: assetId, name');
      });

      it('should handle malformed CSV', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,"Unclosed quote,PUMP,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(0);
      });
    });

    describe('Metadata handling', () => {
      it('should not include empty metadata values', () => {
        const csv = `assetId,name,description,category,location,manufacturer,model
P-001,Pump 1,Main pump,PUMP,Building A,FlowTech,`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          manufacturer: 'FlowTech',
        });
      });

      it('should not include metadata object if no metadata fields', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toBeUndefined();
      });

      it('should handle snake_case metadata fields', () => {
        const csv = `assetId,name,description,category,location,serial_number,install_date
P-001,Pump 1,Main pump,PUMP,Building A,SN-123,2020-01-01`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          serialNumber: 'SN-123',
          installDate: '2020-01-01',
        });
      });

      it('should handle all known metadata fields', () => {
        const csv = `assetId,name,description,category,location,manufacturer,model,serialNumber,installDate,lastMaintenance,nextMaintenance,warranty,capacity,pressure,powerRating,voltage,efficiency,department,responsible,parentAsset
P-001,Pump 1,Main pump,PUMP,Building A,FlowTech,FT-5000,SN-123,2020-01-01,2024-01-01,2024-07-01,2025-01-01,5000 GPM,150 PSI,5kW,480V,85%,Operations,John Doe,P-000`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          manufacturer: 'FlowTech',
          model: 'FT-5000',
          serialNumber: 'SN-123',
          installDate: '2020-01-01',
          lastMaintenance: '2024-01-01',
          nextMaintenance: '2024-07-01',
          warranty: '2025-01-01',
          capacity: '5000 GPM',
          pressure: '150 PSI',
          powerRating: '5kW',
          voltage: '480V',
          efficiency: '85%',
          department: 'Operations',
          responsible: 'John Doe',
          parentAsset: 'P-000',
        });
      });

      it('should handle custom metadata fields', () => {
        const csv = `assetId,name,description,category,location,CustomField1,Another Custom
P-001,Pump 1,Main pump,PUMP,Building A,Value1,Value2`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].metadata).toEqual({
          customField1: 'Value1',
          anotherCustom: 'Value2',
        });
      });
    });

    describe('Statistics', () => {
      it('should track total rows', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A
P-002,Pump 2,Backup pump,PUMP,Building B
P-003,Pump 3,Reserve pump,PUMP,Building C`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(3);
      });

      it('should track success and failure counts', () => {
        const csv = `assetId,name,description,category,location
P-001,Pump 1,Main pump,PUMP,Building A
P-002,,Missing name,PUMP,Building B
P-003,Pump 3,Reserve pump,PUMP,Building C
P-004,Pump 4,,PUMP,Building D`;

        const result = parseAssetCSVString(csv);

        expect(result.stats.totalRows).toBe(4);
        expect(result.stats.successCount).toBe(2);
        expect(result.stats.failureCount).toBe(2);
      });
    });

    describe('Real-world scenarios', () => {
      it('should handle typical AMS export format', () => {
        const csv = `Asset ID,Asset Name,Description,Type,Location,Criticality,Status,Manufacturer,Model,Serial Number,Install Date,Last Maintenance
P-104,Pump Station 104,Main water distribution pump for Riverside district,PUMP,Riverside Bridge Station,CRITICAL,OPERATIONAL,FlowTech Industries,FT-5000,FT5K-2018-0104,2018-03-15,2024-11-20`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0]).toMatchObject({
          assetId: 'P-104',
          name: 'Pump Station 104',
          description: 'Main water distribution pump for Riverside district',
          category: 'PUMP',
          location: 'Riverside Bridge Station',
          criticality: 'CRITICAL',
          status: 'OPERATIONAL',
        });

        expect(result.assets[0].metadata).toEqual({
          manufacturer: 'FlowTech Industries',
          model: 'FT-5000',
          serialNumber: 'FT5K-2018-0104',
          installDate: '2018-03-15',
          lastMaintenance: '2024-11-20',
        });
      });

      it('should handle mixed case and spacing in headers', () => {
        const csv = `Asset ID,  ASSET NAME  ,Description,asset type,LOCATION
P-001,Pump 1,Main pump,pump,Building A`;

        const result = parseAssetCSVString(csv);

        expect(result.assets[0]).toEqual({
          assetId: 'P-001',
          name: 'Pump 1',
          description: 'Main pump',
          category: 'PUMP',
          location: 'Building A',
        });
      });

      it('should handle UTF-8 BOM', () => {
        const csv =
          '\uFEFFassetId,name,description,category,location\nP-001,Pump 1,Main pump,PUMP,Building A';

        const result = parseAssetCSVString(csv);

        expect(result.assets[0].assetId).toBe('P-001');
      });
    });
  });

  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      const csv = 'assetId,name,description,category,location';
      expect(detectDelimiter(csv)).toBe(',');
    });

    it('should detect semicolon delimiter', () => {
      const csv = 'assetId;name;description;category;location';
      expect(detectDelimiter(csv)).toBe(';');
    });

    it('should detect tab delimiter', () => {
      const csv = 'assetId\tname\tdescription\tcategory\tlocation';
      expect(detectDelimiter(csv)).toBe('\t');
    });

    it('should prefer tab over comma when both present', () => {
      const csv = 'assetId\tname,with,commas\tdescription\tcategory';
      expect(detectDelimiter(csv)).toBe('\t');
    });

    it('should prefer semicolon over comma', () => {
      const csv = 'assetId;name;description,with,commas;category';
      expect(detectDelimiter(csv)).toBe(';');
    });

    it('should default to comma when no delimiters found', () => {
      const csv = 'assetId';
      expect(detectDelimiter(csv)).toBe(',');
    });
  });
});
