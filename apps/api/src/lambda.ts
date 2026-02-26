/**
 * AWS Lambda entry point for the NexusAEC API.
 *
 * Wraps the existing Fastify app via @fastify/aws-lambda.
 * The standalone server (index.ts) remains for local development.
 */

import awsLambdaFastify from '@fastify/aws-lambda';

import { createApp } from './app';

import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

type LambdaProxy = (event: APIGatewayProxyEvent, context: Context) => Promise<unknown>;

let proxy: LambdaProxy;

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<unknown> => {
  if (!proxy) {
    const app = await createApp();
    proxy = awsLambdaFastify(app) as LambdaProxy;
  }
  return proxy(event, context);
};
