#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { StorageStack } from '../lib/storage-stack.js';
import { SecretStack } from '../lib/secret-stack.js';
import { NotifStack } from '../lib/notif-stack.js';
import { ApiStack } from '../lib/api-stack.js';

const app = new cdk.App();
const env = app.node.tryGetContext('env') as string ?? 'dev';

const awsEnv = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
};

const stackProps = { env: awsEnv };
const appEnv = env;

const authStack   = new AuthStack(app,   `CastraCr-Auth-${appEnv}`,    { ...stackProps, appEnv });
const dataStack   = new DataStack(app,   `CastraCr-Data-${appEnv}`,    { ...stackProps, appEnv });
const secretStack = new SecretStack(app, `CastraCr-Secrets-${appEnv}`, { ...stackProps, appEnv });

const storageStack = new StorageStack(app, `CastraCr-Storage-${appEnv}`, { ...stackProps, appEnv });
new NotifStack(app,   `CastraCr-Notif-${appEnv}`,   { ...stackProps, appEnv });

new ApiStack(app, `CastraCr-Api-${appEnv}`, {
  ...stackProps,
  appEnv,
  table:            dataStack.table,
  userPool:         authStack.userPool,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  secretArn:        secretStack.secretArn,
  photosBucket:     storageStack.photosBucket,
  cdnDomain:        storageStack.distribution.distributionDomainName,
});

app.synth();
