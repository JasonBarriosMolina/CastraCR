import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { NotFoundError } from '@castrar-cr/utils';

/**
 * Returns impact stats for a campaign (public).
 * campaignId is optional — if omitted, returns platform-wide stats.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const campaignId = event.pathParameters?.['id'];

    if (campaignId) {
      // Per-campaign stats: query all registrations for this campaign
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1-organizadorId',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `CAMPAIGN#${campaignId}`,
          ':sk': 'REG#',
        },
      })).catch(() => ({ Items: [] }));

      // Count via direct query by campaign — registrations stored with campaignId
      const regResult = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'campaignId = :cid AND begins_with(PK, :reg)',
        KeyConditionExpression: 'GSI4PK = :dummy',
        ExpressionAttributeValues: {
          ':dummy': `CAMPAIGN#${campaignId}`,
          ':cid': campaignId,
          ':reg': 'REG#',
        },
      })).catch(() => ({ Items: [], Count: 0 }));

      const registrations = regResult.Items ?? [];
      const totalRegistrations = registrations.length;
      const checkedIn = registrations.filter((r) => r['checkedIn']).length;
      const canceladas = registrations.filter((r) => r['estado'] === 'cancelada').length;
      const listaEspera = registrations.filter((r) => r['estado'] === 'lista_espera').length;

      const allPets = registrations.flatMap((r) => (r['pets'] as Array<{ estadoCirugia: string }>) ?? []);
      const operados = allPets.filter((p) => p.estadoCirugia === 'operado').length;
      const complicaciones = allPets.filter((p) => p.estadoCirugia === 'complicacion').length;

      return ok({
        campaignId,
        stats: {
          totalRegistros: totalRegistrations,
          checkedIn,
          canceladas,
          listaEspera,
          mascotasOperadas: operados,
          complicaciones,
        },
      });
    }

    // Platform-wide: donations completadas (GSI4)
    const donationsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'DONATION_ESTADO#completada' },
    })).catch(() => ({ Items: [] }));

    const donations = donationsResult.Items ?? [];
    const totalDonations = donations.reduce((sum, d) => sum + ((d['monto'] as number) ?? 0), 0);

    // Donaciones del mes actual (filtrar por createdAt)
    const mesActual = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const totalDonacionesMes = donations
      .filter((d) => ((d['createdAt'] as string) ?? '').startsWith(mesActual))
      .reduce((sum, d) => sum + ((d['monto'] as number) ?? 0), 0);

    // Campañas activas (GSI4)
    const campanasActivasResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'CAMPAIGN_ESTADO#activa' },
      Select: 'COUNT',
    })).catch(() => ({ Count: 0 }));

    // Campañas borrador (GSI4)
    const campanasBorradorResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'CAMPAIGN_ESTADO#borrador' },
      Select: 'COUNT',
    })).catch(() => ({ Count: 0 }));

    // Registros totales y check-ins de hoy (via GSI4)
    const regResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI4-estado',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'REG_ESTADO#confirmada' },
    })).catch(() => ({ Items: [] }));

    const registros = regResult.Items ?? [];
    const hoy = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const checkinHoy = registros.filter((r) =>
      r['checkedIn'] && ((r['checkinAt'] as string) ?? '').startsWith(hoy)
    ).length;

    return ok({
      stats: {
        totalDonaciones: totalDonations,
        donacionesCount: donations.length,
        campanasActivas: campanasActivasResult.Count ?? 0,
        campanasBorrador: campanasBorradorResult.Count ?? 0,
        totalRegistros: registros.length,
        checkinHoy,
        totalDonacionesMes,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};
