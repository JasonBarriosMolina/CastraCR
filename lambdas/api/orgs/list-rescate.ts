/**
 * GET /orgs/rescate
 * Lista pública de organizaciones rescatistas que aceptan donaciones.
 * Sin autenticación — usada en la página pública /donar.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';

const MAX_DONACION_DEFAULT = 100_000; // ₡100,000 si la org no configura límite

export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    // Scan de todas las ORG_RESCATE — volumen pequeño (~decenas de orgs)
    // En el futuro se puede agregar GSI si crece mucho
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk AND (aceptaDonaciones = :t OR attribute_not_exists(aceptaDonaciones))',
      ExpressionAttributeValues: {
        ':prefix': 'ORG_RESCATE#',
        ':sk': 'PROFILE',
        ':t': true,
      },
      ProjectionExpression: 'orgId, nombre, descripcion, logoUrl, donacionMaximaCRC, telefono',
    }));

    const orgs = (result.Items ?? []).map((item) => ({
      orgId: item['orgId'] as string,
      nombre: item['nombre'] as string,
      descripcion: (item['descripcion'] as string | undefined) ?? '',
      logoUrl: (item['logoUrl'] as string | undefined) ?? null,
      donacionMaximaCRC: (item['donacionMaximaCRC'] as number | undefined) ?? MAX_DONACION_DEFAULT,
    }));

    // Ordenar alfabéticamente
    orgs.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    return ok({ orgs });
  } catch (error) {
    return errorResponse(error);
  }
};
