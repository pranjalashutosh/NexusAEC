# Asset Seed Data

This directory contains seed data for development and testing of the NexusAEC
knowledge base (Tier 3).

## Files

### `seed-assets.json`

**Purpose:** MVP seed data for asset management system integration testing

**Contents:** 39 sample assets representing a typical water/wastewater utility
infrastructure

**Asset Categories:**

- Pumps (6) - P-xxx
- Sensors (5) - S-xxx
- Tanks (4) - T-xxx
- Mechanical Equipment (4) - F-xxx, D-xxx, A-xxx
- Instrumentation (4) - R-xxx, W-xxx, N-xxx
- Valves (3) - V-xxx
- Electrical Equipment (3) - E-xxx
- Generators (2) - G-xxx
- Motors (2) - M-xxx
- Control Panels (2) - C-xxx
- HVAC Systems (2) - H-xxx
- Other (2) - X-xxx

**Locations Represented:**

- Riverside Bridge Station
- North Plant
- South Treatment Plant
- East Reservoir Site
- Processing Plant Building 3
- Central Control Room

**Criticality Levels:**

- CRITICAL: 13 assets
- HIGH: 19 assets
- MEDIUM: 7 assets

### `seed-safety-manuals.json`

**Purpose:** MVP seed data for safety documentation and procedures

**Contents:** 7 comprehensive safety documents including manuals, procedures,
and guidelines

**Document Types:**

- Safety Manuals (3) - SM-xxx
  - Pump Station Emergency Shutdown
  - Chlorine Handling and Spill Response
  - Water Quality Monitoring Safety
- Procedures (3) - PROC-xxx
  - Lockout/Tagout (LOTO)
  - Confined Space Entry
  - Generator Testing and Maintenance
- Guidelines (1) - GUIDE-xxx
  - Electrical Safety and Arc Flash

**Topics Covered:**

- Emergency response procedures
- Chemical safety (sodium hypochlorite)
- Lockout/tagout requirements (OSHA 29 CFR 1910.147)
- Confined space entry (OSHA 29 CFR 1910.146)
- Electrical safety and arc flash protection (NFPA 70E)
- Water quality sampling and regulatory compliance
- Generator operation and maintenance (NFPA 110)

**Related Assets:** Documents reference 23 unique assets including pumps,
valves, tanks, sensors, electrical equipment, and generators. Each document
provides safety context for operations involving specific equipment.

**Content Statistics:**

- Average length: ~2,300 characters per document
- Total asset references: 35 across all documents
- Regulatory standards: OSHA, NFPA, EPA Safe Drinking Water Act

## Usage

### Development/Testing (MVP)

Use the seed data for local development and testing:

```bash
# Validate asset seed data
npx tsx scripts/validate-seed-data.ts

# Validate safety manual seed data
npx tsx scripts/validate-safety-manuals.ts

# Ingest seed data (coming in task 3.20-3.22)
npx ts-node cli/ingest-assets.ts --source seed
npx ts-node cli/ingest-manuals.ts --source seed
```

### Production

For production deployment, clients will provide their own asset data in CSV
format:

```bash
# Ingest from client CSV export
npx ts-node cli/ingest-assets.ts --source csv --file ./client-data/assets.csv
```

## Asset Schema

Each asset in `seed-assets.json` conforms to the `Asset` type:

```typescript
interface Asset {
  assetId: string; // Unique identifier (e.g., "P-104")
  name: string; // Human-readable name
  description: string; // Detailed description
  category: AssetCategory; // Asset type/category
  location: string; // Physical location
  criticality?: AssetCriticality; // CRITICAL | HIGH | MEDIUM | LOW
  status?: AssetStatus; // OPERATIONAL | MAINTENANCE | OFFLINE | DECOMMISSIONED
  metadata?: Record<string, string>; // Flexible additional fields
}
```

### Common Metadata Fields

The seed data includes realistic metadata fields that are typical for asset
management systems:

**Equipment Details:**

- `manufacturer` - Equipment manufacturer
- `model` - Model number
- `serialNumber` - Serial number

**Dates:**

- `installDate` - Installation date (ISO 8601 format)
- `lastMaintenance` - Last maintenance date
- `nextMaintenance` - Scheduled next maintenance
- `lastCalibration` - Last calibration date (for instruments)
- `nextCalibration` - Next calibration due date

**Technical Specifications:**

- `capacity` - Equipment capacity (GPM, kW, etc.)
- `pressure` - Pressure rating (PSI)
- `powerRating` - Power consumption (HP, kW)
- `voltage` - Operating voltage
- `efficiency` - Efficiency rating

**Organizational:**

- `department` - Responsible department
- `responsible` - Responsible person/team
- `parentAsset` - Parent asset ID (for hierarchical assets)

## Expected CSV Format for Production

Clients should provide asset data as CSV exports from their asset management
systems (NCE, Maximo, SAP PM, etc.).

### Minimum Required Columns

```csv
AssetID,Name,Description,Category,Location
```

### Full Format with Optional Fields

```csv
AssetID,Name,Description,Category,Location,Criticality,Status,Manufacturer,Model,SerialNumber,InstallDate,LastMaintenance,Department,Responsible
```

### Example CSV Template

See `assets-template.csv` for a complete example:

```csv
AssetID,Name,Description,Category,Location,Criticality,Status,Manufacturer,Model,SerialNumber,InstallDate,LastMaintenance,Department,Responsible
P-104,Pump Station 104,Main water distribution pump for Riverside district,PUMP,Riverside Bridge Station,CRITICAL,OPERATIONAL,FlowTech Industries,FT-5000,FT5K-2018-0104,2018-03-15,2024-11-20,Water Operations,John Martinez
V-201,Valve Assembly 201,Main pressure regulation valve for north sector,VALVE,North Plant,MEDIUM,OPERATIONAL,ValveTech Solutions,VTS-24-BF,VTS24-2019-0201,2019-08-12,2024-10-30,Water Distribution,David Lee
G-301,Generator G301,Emergency standby generator for South Treatment Plant,GENERATOR,South Treatment Plant,CRITICAL,OPERATIONAL,PowerGen Systems,PGS-500D,PGS500-2020-0301,2020-01-10,2024-12-01,Facilities,Tom Anderson
```

## CSV Requirements

1. **AssetID** - Must be unique across all assets
2. **Name** - Human-readable asset name
3. **Description** - Detailed description (used for semantic search)
4. **Category** - Must match one of the standard categories or be a custom value
5. **Location** - Physical location or site name

Optional fields will be stored in the `metadata` object.

## Category Normalization

The system automatically normalizes category values:

- Lowercase → UPPERCASE
- Spaces/hyphens → underscores
- Example: "control panel" → "CONTROL_PANEL"

Standard categories:

- PUMP
- VALVE
- GENERATOR
- TANK
- MOTOR
- SENSOR
- CONTROL_PANEL
- PIPE
- HVAC
- ELECTRICAL
- MECHANICAL
- INSTRUMENTATION
- OTHER

Custom categories are preserved as-is if they don't match standard values.

## Validation

To validate your seed data or CSV file structure:

```bash
# Validate seed-assets.json
npx tsx scripts/validate-seed-data.ts

# Expected output:
# ✅ ALL VALIDATIONS PASSED
# Total assets: 39
# Valid: 39
# Invalid: 0

# Validate seed-safety-manuals.json
npx tsx scripts/validate-safety-manuals.ts

# Expected output:
# ✅ ALL VALIDATIONS PASSED
# Total documents: 7
# Valid: 7
# Invalid: 0
```

The validation scripts check:

- **Assets:** Schema compliance, no duplicate IDs, category/criticality/location
  distributions
- **Safety Manuals:** Schema compliance, no duplicate IDs, type distribution,
  content statistics, related asset references

## Data Quality Tips

**For Best Search Results:**

1. **Rich Descriptions** - Include detailed descriptions with relevant keywords
   - Good: "Main water distribution pump for Riverside district. Primary pump
     delivering 5000 GPM at 150 PSI."
   - Poor: "Pump"

2. **Consistent Locations** - Use consistent location naming
   - Good: "Riverside Bridge Station", "North Plant"
   - Poor: "RB Station", "PLANT-NORTH", "plant north"

3. **Complete Metadata** - Include manufacturer, model, install date when
   available
   - Helps with maintenance tracking and vendor management

4. **Accurate Criticality** - Properly classify asset criticality
   - CRITICAL: Service disruption affects large area or safety
   - HIGH: Important but has redundancy
   - MEDIUM: Standard equipment
   - LOW: Non-essential

## Next Steps

After validating your seed data:

1. Generate embeddings (Task 3.20)
2. Ingest into Supabase vector store (Task 3.20)
3. Test semantic search queries (Task 3.25)
4. Use in RAG retrieval for voice assistant (Task 3.25+)

## Support

For questions about asset data format or ingestion, see:

- `packages/intelligence/src/knowledge/asset-types.ts` - Type definitions
- `packages/intelligence/src/knowledge/supabase-vector-store.ts` - Vector
  storage
- Task 3.18-3.24 for CSV parsing and ingestion implementation
