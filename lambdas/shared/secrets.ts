import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

let cachedSecrets: Record<string, string> | null = null;

/**
 * Retrieves all app secrets from AWS Secrets Manager.
 * Caches in Lambda memory for the duration of the container.
 */
export async function getSecrets(): Promise<Record<string, string>> {
  if (cachedSecrets) return cachedSecrets;

  const secretArn = process.env['SECRET_ARN'] ?? '';
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error('No secret string found');
  }

  cachedSecrets = JSON.parse(response.SecretString) as Record<string, string>;
  return cachedSecrets;
}
