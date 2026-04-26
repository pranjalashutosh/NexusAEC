/**
 * AWS Lambda entry point for the NexusAEC API.
 *
 * Wraps the existing Fastify app via @fastify/aws-lambda. The standalone
 * server (index.ts) remains for local development.
 *
 * On cold start, fetches the JSON blob from AWS Secrets Manager (named by
 * SECRET_NAME) and injects each key into process.env so the rest of the app
 * (which reads process.env.REDIS_URL, OPENAI_API_KEY, etc.) works unchanged.
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import awsLambdaFastify from '@fastify/aws-lambda';

import { createApp } from './app';

import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

type LambdaProxy = (event: APIGatewayProxyEvent, context: Context) => Promise<unknown>;

let proxy: LambdaProxy | null = null;
let initPromise: Promise<void> | null = null;

async function loadSecretsIntoEnv(): Promise<void> {
  const secretName = process.env['SECRET_NAME'];
  if (!secretName) {
    return;
  }

  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretName }));

  if (!result.SecretString) {
    return;
  }

  const secrets = JSON.parse(result.SecretString) as Record<string, string>;
  for (const [key, value] of Object.entries(secrets)) {
    // Only set if not already provided via Lambda env (lets you override
    // individual values without rotating the secret — useful for debugging).
    if (process.env[key] === undefined && typeof value === 'string') {
      process.env[key] = value;
    }
  }
}

async function initialize(): Promise<void> {
  await loadSecretsIntoEnv();
  const app = await createApp();
  proxy = awsLambdaFastify(app) as LambdaProxy;
}

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<unknown> => {
  if (!proxy) {
    // Memoize the init promise so concurrent invocations during cold start
    // don't trigger duplicate Secrets Manager fetches.
    initPromise ??= initialize();
    await initPromise;
  }

  if (!proxy) {
    throw new Error('Lambda initialization failed');
  }

  return proxy(event, context);
};
