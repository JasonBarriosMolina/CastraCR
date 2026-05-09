import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID as uuidv4 } from 'crypto';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { ok, errorResponse } from '../../shared/response.js';
import { getAuthContext, requireRole } from '../../shared/auth.js';
import type { PetProfile } from '@castrar-cr/types';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const authCtx = getAuthContext(event);
    requireRole(authCtx, 'Dueno', 'SuperAdmin');

    const body = JSON.parse(event.body ?? '{}') as Omit<PetProfile, 'petId' | 'userId' | 'createdAt' | 'updatedAt'>;
    const { nombre, especie, sexo } = body;

    if (!nombre || !especie || !sexo) {
      return { statusCode: 400, body: JSON.stringify({ error: 'nombre, especie y sexo son requeridos', code: 'INVALID_BODY' }) };
    }

    const petId = uuidv4();
    const now = new Date().toISOString();

    const item: Record<string, unknown> = {
      PK: `PET#${petId}`,
      SK: 'METADATA',
      petId,
      userId: authCtx.userId,
      nombre,
      especie,
      sexo,
      raza: body.raza,
      edadAnios: body.edadAnios,
      edadMeses: body.edadMeses,
      pesoKg: body.pesoKg,
      condicionSalud: body.condicionSalud,
      vacunas: body.vacunas ?? [],
      fotosS3Keys: body.fotosS3Keys ?? [],
      // Campos de screening médico (opcionales — se rellenan desde el bot)
      vacunasAlDia: body.vacunasAlDia,
      tratamientosActivos: body.tratamientosActivos,
      criptorquidismo: body.criptorquidismo,
      estadoReproductivo: body.estadoReproductivo,
      aptoCirugia: body.aptoCirugia,
      razonRechazo: body.razonRechazo,
      alertasVet: body.alertasVet,
      screenedAt: body.screenedAt,
      provincia: body.provincia,
      // GSI3: per-user index
      GSI3PK: `USER#${authCtx.userId}`,
      GSI3SK: `PET#${petId}`,
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    return ok({ petId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
