/**
 * Tests for PDF Extractor
 */

import {
  extractPDF,
  extractPDFFromBuffer,
  extractPages,
  getPDFMetadata,
  isValidPDF,
  splitIntoSections,
  extractTableOfContents,
  type PDFExtractionResult,
} from '../pdf-extractor';
import fs from 'fs';

// Mock dependencies
jest.mock('fs');
jest.mock('pdf-parse', () => {
  return jest.fn();
});

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPdf = require('pdf-parse') as jest.Mock;

describe('PDF Extractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractPDFFromBuffer', () => {
    it('should extract text from PDF buffer', async () => {
      const mockBuffer = Buffer.from('fake pdf content');
      const mockPdfData = {
        text: 'Safety Manual\n\nThis is a test safety manual.\nIt contains important safety information.',
        numpages: 5,
        info: {
          Title: 'Safety Manual',
          Author: 'Safety Department',
        },
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer);

      expect(result.text).toContain('Safety Manual');
      expect(result.pageCount).toBe(5);
      expect(result.metadata.title).toBe('Safety Manual');
      expect(result.metadata.author).toBe('Safety Department');
      expect(result.stats.characterCount).toBeGreaterThan(0);
      expect(result.stats.wordCount).toBeGreaterThan(0);
      expect(result.stats.avgCharsPerPage).toBeGreaterThan(0);
    });

    it('should normalize whitespace by default', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Text   with    multiple     spaces\n\n\n\nand\n\n\n\nmultiple newlines',
        numpages: 1,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer);

      expect(result.text).not.toContain('   ');
      expect(result.text).not.toContain('\n\n\n');
    });

    it('should skip whitespace normalization when disabled', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Text   with    spaces',
        numpages: 1,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer, {
        normalizeWhitespace: false,
      });

      expect(result.text).toBe('Text   with    spaces');
    });

    it('should remove page numbers when requested', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Content here\nPage 1\nMore content\n- 2 -\nEven more\n| 3 |',
        numpages: 3,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer, {
        removePageNumbers: true,
      });

      expect(result.text).not.toContain('Page 1');
      expect(result.text).not.toContain('- 2 -');
      expect(result.text).not.toContain('| 3 |');
    });

    it('should handle maxPages option', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Limited content',
        numpages: 2,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      await extractPDFFromBuffer(mockBuffer, { maxPages: 2 });

      expect(mockPdf).toHaveBeenCalledWith(mockBuffer, { max: 2 });
    });

    it('should handle password-protected PDFs', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Protected content',
        numpages: 1,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      await extractPDFFromBuffer(mockBuffer, { password: 'secret123' });

      expect(mockPdf).toHaveBeenCalledWith(mockBuffer, { password: 'secret123' });
    });

    it('should calculate statistics correctly', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'This is a test with ten words in the text.',
        numpages: 2,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer);

      expect(result.stats.characterCount).toBe(mockPdfData.text.length);
      expect(result.stats.wordCount).toBe(10);
      expect(result.stats.avgCharsPerPage).toBe(
        Math.round(mockPdfData.text.length / 2)
      );
    });

    it('should handle PDFs with no pages gracefully', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: '',
        numpages: 0,
        info: {},
      };

      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDFFromBuffer(mockBuffer);

      expect(result.pageCount).toBe(0);
      expect(result.stats.avgCharsPerPage).toBe(0);
    });

    it('should throw error on PDF parsing failure', async () => {
      const mockBuffer = Buffer.from('invalid pdf');

      mockPdf.mockRejectedValue(new Error('Invalid PDF structure'));

      await expect(extractPDFFromBuffer(mockBuffer)).rejects.toThrow(
        'Failed to extract PDF from buffer'
      );
    });
  });

  describe('extractPDF', () => {
    it('should extract text from PDF file', async () => {
      const mockBuffer = Buffer.from('fake pdf');
      const mockPdfData = {
        text: 'Safety procedures document',
        numpages: 3,
        info: { Title: 'Safety Procedures' },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDF('/path/to/manual.pdf');

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/manual.pdf');
      expect(result.text).toBe('Safety procedures document');
      expect(result.pageCount).toBe(3);
    });

    it('should pass options to buffer extraction', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Content',
        numpages: 1,
        info: {},
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      await extractPDF('/path/to/file.pdf', {
        maxPages: 5,
        normalizeWhitespace: false,
      });

      expect(mockPdf).toHaveBeenCalledWith(mockBuffer, { max: 5 });
    });

    it('should throw error if file read fails', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(extractPDF('/nonexistent.pdf')).rejects.toThrow(
        'Failed to extract PDF from file'
      );
    });
  });

  describe('extractPages', () => {
    it('should extract specific pages', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Pages 3-5 content',
        numpages: 3,
        info: {},
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPages('/path/to/file.pdf', [3, 4, 5]);

      expect(result.text).toBe('Pages 3-5 content');
    });

    it('should sort pages before extraction', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Content',
        numpages: 5,
        info: {},
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      await extractPages('/path/to/file.pdf', [5, 1, 3]);

      // Should create page range from 1 to 5
      expect(mockPdf).toHaveBeenCalled();
    });

    it('should throw error for empty pages array', async () => {
      await expect(extractPages('/path/to/file.pdf', [])).rejects.toThrow(
        'Pages array cannot be empty'
      );
    });
  });

  describe('getPDFMetadata', () => {
    it('should extract metadata without full content', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: '',
        numpages: 10,
        info: {
          Title: 'Emergency Procedures',
          Author: 'Safety Team',
          Subject: 'Emergency Response',
          Creator: 'Adobe Acrobat',
          Producer: 'Adobe PDF Library',
          CreationDate: 'D:20240101120000',
          ModDate: 'D:20240115150000',
        },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await getPDFMetadata('/path/to/manual.pdf');

      expect(result.pageCount).toBe(10);
      expect(result.metadata.title).toBe('Emergency Procedures');
      expect(result.metadata.author).toBe('Safety Team');
      expect(result.metadata.subject).toBe('Emergency Response');
      expect(result.metadata.creator).toBe('Adobe Acrobat');
      expect(result.metadata.producer).toBe('Adobe PDF Library');
      expect(result.metadata.creationDate).toBeInstanceOf(Date);
      expect(result.metadata.modificationDate).toBeInstanceOf(Date);
    });

    it('should handle missing metadata fields', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await getPDFMetadata('/path/to/file.pdf');

      expect(result.pageCount).toBe(1);
      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.author).toBeUndefined();
    });

    it('should throw error on file read failure', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Access denied');
      });

      await expect(getPDFMetadata('/path/to/file.pdf')).rejects.toThrow(
        'Failed to get PDF metadata'
      );
    });
  });

  describe('isValidPDF', () => {
    it('should return true for valid PDF', async () => {
      const mockBuffer = Buffer.from('%PDF-1.4\n...');
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await isValidPDF('/path/to/file.pdf');

      expect(result).toBe(true);
    });

    it('should return false for file without PDF header', async () => {
      const mockBuffer = Buffer.from('Not a PDF file');

      mockFs.readFileSync.mockReturnValue(mockBuffer);

      const result = await isValidPDF('/path/to/file.txt');

      expect(result).toBe(false);
    });

    it('should return false for corrupted PDF', async () => {
      const mockBuffer = Buffer.from('%PDF-1.4\ncorrupted data');

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockRejectedValue(new Error('Corrupted PDF'));

      const result = await isValidPDF('/path/to/file.pdf');

      expect(result).toBe(false);
    });

    it('should return false on file read error', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await isValidPDF('/nonexistent.pdf');

      expect(result).toBe(false);
    });
  });

  describe('splitIntoSections', () => {
    it('should split text into sections by headers', () => {
      const text = `SECTION 1: Introduction
This is the introduction.

SECTION 2: Procedures
These are the procedures.

SECTION 3: References
These are the references.`;

      const sections = splitIntoSections(text, [/^SECTION \d+:/]);

      expect(sections.size).toBe(3);
      expect(sections.get('SECTION 1: Introduction')).toContain('introduction');
      expect(sections.get('SECTION 2: Procedures')).toContain('procedures');
      expect(sections.get('SECTION 3: References')).toContain('references');
    });

    it('should handle multiple header patterns', () => {
      const text = `CHAPTER 1: Basics
Content 1

SECTION A: Details
Content 2

CHAPTER 2: Advanced
Content 3`;

      const sections = splitIntoSections(text, [/^CHAPTER \d+:/, /^SECTION [A-Z]:/]);

      expect(sections.size).toBe(3);
      expect(sections.has('CHAPTER 1: Basics')).toBe(true);
      expect(sections.has('SECTION A: Details')).toBe(true);
      expect(sections.has('CHAPTER 2: Advanced')).toBe(true);
    });

    it('should create introduction section for content before first header', () => {
      const text = `This is introductory content.

SECTION 1: Main Content
This is the main content.`;

      const sections = splitIntoSections(text, [/^SECTION \d+:/]);

      expect(sections.has('Introduction')).toBe(true);
      expect(sections.get('Introduction')).toContain('introductory');
    });

    it('should handle text with no sections', () => {
      const text = 'This is plain text with no sections.';

      const sections = splitIntoSections(text, [/^SECTION \d+:/]);

      expect(sections.size).toBe(1);
      expect(sections.has('Introduction')).toBe(true);
    });

    it('should trim whitespace from section content', () => {
      const text = `SECTION 1: Test

  Content with spaces

SECTION 2: Next`;

      const sections = splitIntoSections(text, [/^SECTION \d+:/]);

      const section1 = sections.get('SECTION 1: Test');
      expect(section1).toBe('Content with spaces');
    });
  });

  describe('extractTableOfContents', () => {
    it('should extract TOC entries with page numbers', () => {
      const text = `Table of Contents
Introduction ........................ 1
Chapter 1: Safety Basics ........... 5
Chapter 2: Emergency Procedures ... 12
Chapter 3: Equipment .............. 20
Appendix .......................... 35`;

      const toc = extractTableOfContents(text);

      expect(toc.length).toBeGreaterThan(0);
      expect(toc).toContainEqual({ title: 'Introduction', page: 1 });
      expect(toc).toContainEqual({ title: 'Chapter 1: Safety Basics', page: 5 });
    });

    it('should handle different TOC formats', () => {
      const text = `1. Introduction                    1
2. Safety Procedures              10
3. Emergency Response             25`;

      const toc = extractTableOfContents(text);

      expect(toc.length).toBeGreaterThan(0);
      expect(toc.some((entry) => entry.title.includes('Introduction'))).toBe(true);
    });

    it('should filter out short entries', () => {
      const text = `Real Entry ...................... 5
AB ............................. 10
Another Real Entry ............. 15`;

      const toc = extractTableOfContents(text);

      // "AB" should be filtered out as too short
      expect(toc.every((entry) => entry.title.length > 3)).toBe(true);
    });

    it('should filter out invalid page numbers', () => {
      const text = `Valid Entry .................... 5
Invalid Entry ................. 99999
Another Valid ................. 10`;

      const toc = extractTableOfContents(text);

      expect(toc.every((entry) => entry.page < 9999)).toBe(true);
    });

    it('should return empty array for text without TOC', () => {
      const text = 'This is regular content without any table of contents.';

      const toc = extractTableOfContents(text);

      expect(toc).toEqual([]);
    });
  });

  describe('Metadata date parsing', () => {
    it('should parse PDF dates correctly', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Content',
        numpages: 1,
        info: {
          CreationDate: 'D:20240115143000',
          ModDate: 'D:20240120100000',
        },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await getPDFMetadata('/path/to/file.pdf');

      expect(result.metadata.creationDate).toBeInstanceOf(Date);
      expect(result.metadata.creationDate?.getFullYear()).toBe(2024);
      expect(result.metadata.creationDate?.getMonth()).toBe(0); // January (0-indexed)
      expect(result.metadata.creationDate?.getDate()).toBe(15);
    });

    it('should handle malformed dates gracefully', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: 'Content',
        numpages: 1,
        info: {
          CreationDate: 'invalid date',
        },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await getPDFMetadata('/path/to/file.pdf');

      expect(result.metadata.creationDate).toBeUndefined();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical safety manual PDF', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: `LOCKOUT/TAGOUT (LOTO) PROCEDURE

PURPOSE
This procedure establishes requirements for lockout/tagout of energy sources.

SCOPE
Applies to all maintenance and servicing activities.

PROCEDURE
1. Notify affected employees
2. Shut down equipment
3. Isolate energy sources
4. Apply lockout devices
5. Verify isolation

REFERENCES
OSHA 29 CFR 1910.147`,
        numpages: 8,
        info: {
          Title: 'Lockout/Tagout Procedure',
          Author: 'Safety Department',
          Subject: 'Electrical Safety',
          CreationDate: 'D:20240101000000',
        },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDF('/path/to/loto-procedure.pdf');

      expect(result.text).toContain('LOCKOUT/TAGOUT');
      expect(result.text).toContain('OSHA 29 CFR 1910.147');
      expect(result.pageCount).toBe(8);
      expect(result.metadata.title).toBe('Lockout/Tagout Procedure');
      expect(result.stats.wordCount).toBeGreaterThan(0);
    });

    it('should handle multi-page extraction with sections', async () => {
      const mockBuffer = Buffer.from('pdf');
      const mockPdfData = {
        text: `SAFETY MANUAL

SECTION 1: General Safety
General safety guidelines for all personnel.

SECTION 2: Equipment Safety
Specific safety procedures for equipment operation.

SECTION 3: Emergency Procedures
Emergency response and evacuation procedures.`,
        numpages: 25,
        info: {
          Title: 'Comprehensive Safety Manual',
        },
      };

      mockFs.readFileSync.mockReturnValue(mockBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      const result = await extractPDF('/path/to/safety-manual.pdf');
      const sections = splitIntoSections(result.text, [/^SECTION \d+:/]);

      expect(sections.size).toBeGreaterThan(1);
      expect(sections.has('SECTION 1: General Safety')).toBe(true);
      expect(sections.has('SECTION 2: Equipment Safety')).toBe(true);
      expect(sections.has('SECTION 3: Emergency Procedures')).toBe(true);
    });
  });
});
