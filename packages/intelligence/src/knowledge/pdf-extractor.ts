/**
 * PDF Extractor for Safety Manuals
 *
 * Extracts text content from PDF files containing safety documentation.
 * Supports both file paths and buffer inputs, with configurable extraction options.
 */

import fs from 'fs';

// pdf-parse's typings can be inconsistent under NodeNext; normalize to a callable function.
type PdfParseFn = (data: Buffer, options?: any) => Promise<any>;

// Lazy-load pdf-parse to avoid importing pdfjs-dist (which requires browser DOM APIs)
// at module initialization time. This allows the intelligence package to be imported
// in Node.js environments without triggering DOMMatrix/ImageData errors.
let pdfParse: PdfParseFn | null = null;

async function getPdfParse(): Promise<PdfParseFn> {
  if (!pdfParse) {
    // Use require() instead of dynamic import() to keep Jest/ts-jest compatible
    // in Node runtimes where vm-based module loading can break dynamic import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParseModule = require('pdf-parse') as unknown as {
      default?: PdfParseFn;
    } | PdfParseFn;

    if (typeof pdfParseModule === 'function') {
      pdfParse = pdfParseModule;
    } else if (pdfParseModule && typeof (pdfParseModule as { default?: unknown }).default === 'function') {
      pdfParse = (pdfParseModule as { default: PdfParseFn }).default;
    } else {
      throw new Error('Failed to load pdf-parse module');
    }
  }
  return pdfParse;
}

/**
 * Result of PDF extraction operation
 */
export interface PDFExtractionResult {
  /**
   * Extracted text content
   */
  text: string;

  /**
   * Number of pages in the PDF
   */
  pageCount: number;

  /**
   * PDF metadata
   */
  metadata: {
    /**
     * PDF title (from metadata)
     */
    title?: string;

    /**
     * PDF author (from metadata)
     */
    author?: string;

    /**
     * PDF subject (from metadata)
     */
    subject?: string;

    /**
     * PDF creator application (from metadata)
     */
    creator?: string;

    /**
     * PDF producer (from metadata)
     */
    producer?: string;

    /**
     * PDF creation date (from metadata)
     */
    creationDate?: Date;

    /**
     * PDF modification date (from metadata)
     */
    modificationDate?: Date;
  };

  /**
   * Extraction statistics
   */
  stats: {
    /**
     * Total characters extracted
     */
    characterCount: number;

    /**
     * Approximate word count
     */
    wordCount: number;

    /**
     * Average characters per page
     */
    avgCharsPerPage: number;
  };
}

/**
 * Options for PDF extraction
 */
export interface PDFExtractionOptions {
  /**
   * Maximum number of pages to extract
   * Default: unlimited
   */
  maxPages?: number;

  /**
   * Page range to extract (1-indexed)
   * Example: { start: 1, end: 10 }
   */
  pageRange?: {
    start: number;
    end: number;
  };

  /**
   * Normalize whitespace (remove extra spaces, newlines)
   * Default: true
   */
  normalizeWhitespace?: boolean;

  /**
   * Remove page numbers and headers/footers
   * Default: false
   */
  removePageNumbers?: boolean;

  /**
   * Custom password for encrypted PDFs
   */
  password?: string;
}

/**
 * Extract text content from PDF file
 *
 * @param filePath - Path to PDF file
 * @param options - Extraction options
 * @returns Extraction result with text and metadata
 *
 * @example
 * ```typescript
 * const result = await extractPDF('./safety-manual.pdf');
 * console.log(`Extracted ${result.pageCount} pages`);
 * console.log(`Content: ${result.text.substring(0, 100)}...`);
 * ```
 */
export async function extractPDF(
  filePath: string,
  options: PDFExtractionOptions = {}
): Promise<PDFExtractionResult> {
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(filePath);
    return await extractPDFFromBuffer(dataBuffer, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract PDF from file: ${errorMessage}`);
  }
}

/**
 * Extract text content from PDF buffer
 *
 * @param buffer - PDF file buffer
 * @param options - Extraction options
 * @returns Extraction result with text and metadata
 *
 * @example
 * ```typescript
 * const buffer = fs.readFileSync('./manual.pdf');
 * const result = await extractPDFFromBuffer(buffer);
 * ```
 */
export async function extractPDFFromBuffer(
  buffer: Buffer,
  options: PDFExtractionOptions = {}
): Promise<PDFExtractionResult> {
  const {
    maxPages,
    pageRange,
    normalizeWhitespace = true,
    removePageNumbers = false,
    password,
  } = options;

  try {
    // Parse PDF with pdf-parse (lazy-loaded)
    const pdfParseFn = await getPdfParse();
    const pdfOptions: any = {};

    if (password) {
      pdfOptions.password = password;
    }

    if (maxPages) {
      pdfOptions.max = maxPages;
    }

    if (pageRange) {
      // pdf-parse uses 0-indexed pages internally
      pdfOptions.pagerender = (pageData: any) => {
        const pageNum = pageData.pageIndex + 1;
        if (pageNum >= pageRange.start && pageNum <= pageRange.end) {
          return pageData.getTextContent();
        }
        return Promise.resolve({ items: [] });
      };
    }

    const data = await pdfParseFn(buffer, pdfOptions);

    // Extract text content
    let text: string = String(data?.text ?? '');
    const pageCount: number = Number(data?.numpages ?? 0);

    // Apply text processing
    if (normalizeWhitespace) {
      text = normalizeWhitespaceInText(text);
    }

    if (removePageNumbers) {
      text = removePageNumbersFromText(text);
    }

    // Extract metadata
    const metadata = extractMetadata(data.info);

    // Calculate statistics
    const characterCount = text.length;
    const wordCount = text.split(/\s+/).filter((word: string) => word.length > 0).length;
    const avgCharsPerPage = pageCount > 0 ? characterCount / pageCount : 0;

    return {
      text,
      pageCount,
      metadata,
      stats: {
        characterCount,
        wordCount,
        avgCharsPerPage: Math.round(avgCharsPerPage),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract PDF from buffer: ${errorMessage}`);
  }
}

/**
 * Extract text from specific pages
 *
 * @param filePath - Path to PDF file
 * @param pages - Array of page numbers (1-indexed)
 * @param options - Extraction options
 * @returns Extraction result
 *
 * @example
 * ```typescript
 * // Extract pages 1, 3, and 5
 * const result = await extractPages('./manual.pdf', [1, 3, 5]);
 * ```
 */
export async function extractPages(
  filePath: string,
  pages: number[],
  options: PDFExtractionOptions = {}
): Promise<PDFExtractionResult> {
  if (pages.length === 0) {
    throw new Error('Pages array cannot be empty');
  }

  const sortedPages = [...pages].sort((a, b) => a - b);
  const minPage = sortedPages[0];
  const maxPage = sortedPages[sortedPages.length - 1];
  if (minPage === undefined || maxPage === undefined) {
    throw new Error('Unable to determine page range from pages array');
  }

  return await extractPDF(filePath, {
    ...options,
    pageRange: {
      start: minPage,
      end: maxPage,
    },
  });
}

/**
 * Get PDF metadata without extracting full content
 *
 * @param filePath - Path to PDF file
 * @returns PDF metadata
 *
 * @example
 * ```typescript
 * const metadata = await getPDFMetadata('./manual.pdf');
 * console.log(`Title: ${metadata.title}`);
 * console.log(`Pages: ${metadata.pageCount}`);
 * ```
 */
export async function getPDFMetadata(filePath: string): Promise<{
  pageCount: number;
  metadata: PDFExtractionResult['metadata'];
}> {
  try {
    const dataBuffer = fs.readFileSync(filePath);

    // Extract metadata only (don't process text)
    const pdfParseFn = await getPdfParse();
    const data = await pdfParseFn(dataBuffer, { max: 0 });

    return {
      pageCount: data.numpages,
      metadata: extractMetadata(data.info),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get PDF metadata: ${errorMessage}`);
  }
}

/**
 * Check if a file is a valid PDF
 *
 * @param filePath - Path to file
 * @returns True if file is a valid PDF
 *
 * @example
 * ```typescript
 * if (await isValidPDF('./document.pdf')) {
 *   const result = await extractPDF('./document.pdf');
 * }
 * ```
 */
export async function isValidPDF(filePath: string): Promise<boolean> {
  try {
    const dataBuffer = fs.readFileSync(filePath);

    // Check PDF magic number
    const header = dataBuffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      return false;
    }

    // Try to parse it
    const pdfParseFn = await getPdfParse();
    await pdfParseFn(dataBuffer, { max: 0 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract metadata from PDF info object
 */
function extractMetadata(info: any): PDFExtractionResult['metadata'] {
  const metadata: PDFExtractionResult['metadata'] = {};

  if (info.Title) {
    metadata.title = String(info.Title);
  }

  if (info.Author) {
    metadata.author = String(info.Author);
  }

  if (info.Subject) {
    metadata.subject = String(info.Subject);
  }

  if (info.Creator) {
    metadata.creator = String(info.Creator);
  }

  if (info.Producer) {
    metadata.producer = String(info.Producer);
  }

  if (info.CreationDate) {
    const d = parsePDFDate(String(info.CreationDate));
    if (d) {
      metadata.creationDate = d;
    }
  }

  if (info.ModDate) {
    const d = parsePDFDate(String(info.ModDate));
    if (d) {
      metadata.modificationDate = d;
    }
  }

  return metadata;
}

/**
 * Parse PDF date string to Date object
 * PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
 */
function parsePDFDate(dateStr: string): Date | undefined {
  try {
    // Remove 'D:' prefix if present
    const str = dateStr.replace(/^D:/, '');

    // Extract date components
    const year = parseInt(str.substring(0, 4), 10);
    const month = parseInt(str.substring(4, 6), 10) - 1; // 0-indexed
    const day = parseInt(str.substring(6, 8), 10);
    const hour = parseInt(str.substring(8, 10), 10) || 0;
    const minute = parseInt(str.substring(10, 12), 10) || 0;
    const second = parseInt(str.substring(12, 14), 10) || 0;

    const date = new Date(year, month, day, hour, minute, second);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return undefined;
    }

    return date;
  } catch {
    return undefined;
  }
}

/**
 * Normalize whitespace in text
 * - Replace multiple spaces with single space
 * - Replace multiple newlines with double newline
 * - Trim leading/trailing whitespace
 */
function normalizeWhitespaceInText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n') // Multiple newlines to double newline
    .replace(/\n /g, '\n') // Remove spaces after newlines
    .trim();
}

/**
 * Remove common page number patterns from text
 * Removes patterns like:
 * - "Page 1", "Page 1 of 10"
 * - "- 1 -", "| 1 |"
 * - Numbers at start/end of lines
 */
function removePageNumbersFromText(text: string): string {
  return text
    .replace(/^Page \d+( of \d+)?$/gim, '') // "Page X" or "Page X of Y"
    .replace(/^-+ ?\d+ ?-+$/gim, '') // "- 1 -", "--- 1 ---"
    .replace(/^\| ?\d+ ?\|$/gim, '') // "| 1 |"
    .replace(/^\d+$/gm, '') // Standalone numbers on their own line
    .replace(/\n{3,}/g, '\n\n'); // Clean up extra newlines
}

/**
 * Split extracted text into logical sections
 *
 * @param text - Extracted PDF text
 * @param sectionHeaders - Array of section header patterns (regex)
 * @returns Map of section title to section content
 *
 * @example
 * ```typescript
 * const result = await extractPDF('./manual.pdf');
 * const sections = splitIntoSections(result.text, [
 *   /^SECTION \d+:/i,
 *   /^CHAPTER \d+:/i,
 * ]);
 * ```
 */
export function splitIntoSections(
  text: string,
  sectionHeaders: RegExp[]
): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = text.split('\n');

  let currentSection = 'Introduction';
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check if line matches any section header pattern
    const isHeader = sectionHeaders.some((pattern) => pattern.test(line));

    if (isHeader) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }

      // Start new section
      currentSection = line.trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }

  return sections;
}

/**
 * Extract table of contents from PDF text
 *
 * @param text - Extracted PDF text
 * @returns Array of TOC entries with title and page number
 *
 * @example
 * ```typescript
 * const result = await extractPDF('./manual.pdf');
 * const toc = extractTableOfContents(result.text);
 * toc.forEach(entry => {
 *   console.log(`${entry.title} - Page ${entry.page}`);
 * });
 * ```
 */
export function extractTableOfContents(text: string): Array<{
  title: string;
  page: number;
}> {
  const toc: Array<{ title: string; page: number }> = [];
  const lines = text.split('\n');

  // Common TOC patterns:
  // "Section 1: Introduction .................. 5"
  // "1. Introduction                          5"
  // "Chapter 1 - Safety Procedures .......... 10"
  const tocPattern = /^(.+?)[\s.]+(\d+)\s*$/;

  for (const line of lines) {
    const match = line.match(tocPattern);
    if (match) {
      const title = (match[1] ?? '').trim();
      const pageStr = match[2];
      if (!title || !pageStr) {
        continue;
      }
      const page = parseInt(pageStr, 10);

      // Filter out noise (too short, likely not a real TOC entry)
      if (title.length > 3 && page > 0 && page < 9999) {
        toc.push({ title, page });
      }
    }
  }

  return toc;
}
