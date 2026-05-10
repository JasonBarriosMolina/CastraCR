/**
 * GET  /campaigns/{id}/costs → returns AI + messaging cost summary for a campaign
 * POST /campaigns/{id}/costs → records a cost event (called internally by other lambdas)
 *
 * DDB item: PK=CAMPAIGN#${id}  SK=COSTS
 * Structure:
 *   { campaignId, haikuCalls, haikuInputTokens, haikuOutputTokens,
 *     twilioMessages, totalUsd, actualizadoEn }
 */

import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';

// Haiku pricing (per 1M tokens, USD) — April 2025
const HAIKU_INPUT_PER_MTK  = 0.80;  // $0.80 / 1M input tokens
const HAIKU_OUTPUT_PER_MTK = 4.00;  // $4.00 / 1M output tokens
const TWILIO_WA_PER_MSG    = 0.005; // $0.005 per WhatsApp message (approx)

interface CostEvent {
  type: 'haiku' | 'twilio_wa';
  inputTokens?: number;
  outputTokens?: number;
  messageCount?: number;
}

interface CostSummary {
  campaignId: string;
  haikuCalls: number;
  haikuInputTokens: number;
  haikuOutputTokens: number;
  twilioMessages: number;
  totalUsd: number;
  actualizadoEn: string;
}

function calcTotal(
  inputTokens: number,
  outputTokens: number,
  twilioMessages: number,
): number {
  const haikuCost =
    (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTK;
  const twilioCost = twilioMessages * TWILIO_WA_PER_MSG;
  return Math.round((haikuCost + twilioCost) * 10000) / 10000; // 4 decimal places
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Organizador', 'SuperAdmin');

    const campaignId = event.pathParameters?.['id'];
    if (!campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'campaignId es requerido' }) };
    }

    const method = event.requestContext.http.method;

    // ── GET: return current cost summary ─────────────────────────────────────
    if (method === 'GET') {
      const result = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'COSTS' },
      }));

      if (!result.Item) {
        // Return zero-state if no costs recorded yet
        const empty: CostSummary = {
          campaignId,
          haikuCalls: 0,
          haikuInputTokens: 0,
          haikuOutputTokens: 0,
          twilioMessages: 0,
          totalUsd: 0,
          actualizadoEn: new Date().toISOString(),
        };
        return ok({ costs: empty });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { PK, SK, ...costs } = result.Item as Record<string, unknown>;
      return ok({ costs });
    }

    // ── POST: record a cost event ─────────────────────────────────────────────
    if (method === 'POST') {
      const body = JSON.parse(event.body ?? '{}') as CostEvent;
      const now = new Date().toISOString();

      let updateExpr = 'SET actualizadoEn = :now, campaignId = :cid ADD ';
      const exprVals: Record<string, unknown> = {
        ':now': now,
        ':cid': campaignId,
        ':zero': 0,
      };
      const addParts: string[] = [];

      if (body.type === 'haiku') {
        const inp = body.inputTokens ?? 0;
        const out = body.outputTokens ?? 0;
        exprVals[':inp'] = inp;
        exprVals[':out'] = out;
        exprVals[':one'] = 1;
        addParts.push('haikuCalls :one', 'haikuInputTokens :inp', 'haikuOutputTokens :out');
      } else if (body.type === 'twilio_wa') {
        const count = body.messageCount ?? 1;
        exprVals[':count'] = count;
        addParts.push('twilioMessages :count');
      }

      if (addParts.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'type must be haiku or twilio_wa' }) };
      }

      updateExpr += addParts.join(', ');

      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'COSTS' },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
      }));

      // Re-fetch to compute totalUsd
      const updated = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'COSTS' },
      }));

      const item = updated.Item ?? {};
      const total = calcTotal(
        (item['haikuInputTokens'] as number) ?? 0,
        (item['haikuOutputTokens'] as number) ?? 0,
        (item['twilioMessages'] as number) ?? 0,
      );

      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'COSTS' },
        UpdateExpression: 'SET totalUsd = :total',
        ExpressionAttributeValues: { ':total': total },
      }));

      return ok({ ok: true, totalUsd: total });
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    return errorResponse(error);
  }
};
