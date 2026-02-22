/**
 * Knowledge Upload Routes
 *
 * Accepts file uploads (CSV, JSON, PDF) and ingests them into the
 * Supabase vector store via the existing AssetIngestion pipeline.
 *
 * Route: POST /knowledge/upload
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';

import multipart from '@fastify/multipart';
import { AssetIngestion, SupabaseVectorStore } from '@nexus-aec/intelligence';
import { createLogger } from '@nexus-aec/logger';
import OpenAI from 'openai';

import type { FastifyInstance } from 'fastify';

const logger = createLogger({ baseContext: { component: 'knowledge-upload' } });

const ALLOWED_EXTENSIONS = ['.csv', '.json', '.pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Create an embedding generator using OpenAI
 */
function createEmbeddingGenerator(apiKey: string) {
  const openai = new OpenAI({ apiKey });
  return async (text: string): Promise<number[]> => {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0]?.embedding ?? [];
  };
}

export function registerKnowledgeUploadRoutes(app: FastifyInstance): void {
  // Register multipart plugin scoped to this route prefix
  void app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
    },
  });

  app.post('/knowledge/upload', async (request, reply) => {
    // Validate environment
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    const openaiKey = process.env['OPENAI_API_KEY'];

    if (!supabaseUrl || !supabaseKey) {
      return reply.status(503).send({
        success: false,
        message: 'Vector store is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      });
    }

    if (!openaiKey) {
      return reply.status(503).send({
        success: false,
        message: 'Embedding service is not configured. Set OPENAI_API_KEY.',
      });
    }

    // Parse multipart data
    let data;
    try {
      data = await request.file();
    } catch (err) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid multipart request. Send a file field.',
      });
    }

    if (!data) {
      return reply.status(400).send({
        success: false,
        message: 'No file uploaded.',
      });
    }

    // Validate file extension
    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return reply.status(400).send({
        success: false,
        message: `Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
    }

    // Save to temp file
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `nexus-upload-${Date.now()}${ext}`);

    try {
      const writeStream = fs.createWriteStream(tempPath);
      await pipeline(data.file, writeStream);

      logger.info('File uploaded to temp', {
        filename: data.filename,
        ext,
        tempPath,
        size: fs.statSync(tempPath).size,
      });

      // Create vector store and ingestion pipeline
      const vectorStore = new SupabaseVectorStore({ supabaseUrl, supabaseKey });
      const embeddingGenerator = createEmbeddingGenerator(openaiKey);
      const ingestion = new AssetIngestion(vectorStore, embeddingGenerator, {
        continueOnError: true,
      });

      // Route to the right ingestion method based on file type
      let result;

      if (ext === '.csv') {
        result = await ingestion.ingestAssetsFromCSV(tempPath);
      } else if (ext === '.json') {
        result = await ingestion.ingestAssetsFromJSON(tempPath);
      } else if (ext === '.pdf') {
        const docId = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        result = await ingestion.ingestSafetyDocumentFromPDF(tempPath, {
          id: docId,
          title: data.filename.replace(ext, ''),
          type: 'PROCEDURE',
        });
      } else {
        return reply.status(400).send({
          success: false,
          message: `Unsupported file type: ${ext}`,
        });
      }

      logger.info('Ingestion completed', {
        filename: data.filename,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        durationMs: result.durationMs,
      });

      return reply.send({
        success: true,
        filename: data.filename,
        documentsIngested: result.succeeded,
        documentsFailed: result.failed,
        totalDocuments: result.total,
        durationMs: result.durationMs,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      logger.error(
        'Knowledge upload failed',
        error instanceof Error ? error : new Error(String(error))
      );
      return reply.status(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
}
