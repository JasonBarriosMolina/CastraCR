import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../../shared/db.js';
import { getAuthContext } from '../../shared/auth.js';
import { ok, err } from '../../shared/response.js';

/**
 * PATCH /pets/{petId}
 * Actualiza campos del perfil de mascota (screening médico + datos básicos).
 * El dueño solo puede editar sus propias mascotas; vet/admin pueden editar cualquiera.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const authCtx = getAuthContext(event);
  if (!authCtx) return err(401, 'No autorizado');

  const petId = event.pathParameters?.petId;
  if (!petId) return err(400, 'Falta petId');

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return err(400, 'JSON inválido');
  }

  // Verificar que la mascota existe y pertenece al usuario (a menos que sea vet/admin)
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `PET#${petId}`, SK: 'METADATA' },
  }));

  if (!existing.Item) return err(404, 'Mascota no encontrada');

  const isOwner = existing.Item['userId'] === authCtx.userId;
  const isPrivileged = ['SuperAdmin', 'Organizador', 'Veterinario'].includes(authCtx.role ?? '');

  if (!isOwner && !isPrivileged) return err(403, 'Sin permiso para editar esta mascota');

  // Campos permitidos por el dueño
  const ownerFields = [
    'nombre', 'raza', 'edadAnios', 'edadMeses', 'pesoKg', 'condicionSalud',
    // Screening médico
    'vacunasAlDia', 'tratamientosActivos', 'estadoReproductivo', 'criptorquidismo',
    'aptoCirugia', 'razonRechazo', 'alertasVet', 'screenedAt', 'provincia',
    'condicionSaludRaw',
  ];

  // Campos extra solo para vet/admin
  const adminFields = ['notasVet', 'alertaRiesgo'];

  const allowedFields = isPrivileged ? [...ownerFields, ...adminFields] : ownerFields;

  // Construir UpdateExpression dinámicamente
  const setExpressions: string[] = [];
  const attrNames: Record<string, string> = {};
  const attrValues: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      const alias = `#f_${field}`;
      const valAlias = `:v_${field}`;
      setExpressions.push(`${alias} = ${valAlias}`);
      attrNames[alias] = field;
      attrValues[valAlias] = body[field];
    }
  }

  if (setExpressions.length === 0) {
    return err(400, 'No hay campos válidos para actualizar');
  }

  // Siempre actualizar timestamp
  setExpressions.push('#updatedAt = :updatedAt');
  attrNames['#updatedAt'] = 'updatedAt';
  attrValues[':updatedAt'] = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `PET#${petId}`, SK: 'METADATA' },
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ExpressionAttributeNames: attrNames,
    ExpressionAttributeValues: attrValues,
  }));

  return ok({ petId, updated: setExpressions.length - 1 });
};
