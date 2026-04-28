import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretStackProps extends cdk.StackProps {
  appEnv: string;
}

export class SecretStack extends cdk.Stack {
  public readonly secretArn: string;

  constructor(scope: Construct, id: string, props: SecretStackProps) {
    super(scope, id, props);

    // Single secret with all credentials — read in Lambda runtime
    const secret = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: `castrar-cr-${props.appEnv}-secrets`,
      description: 'All castrar.cr credentials and API keys',
      // Template to document required keys (values set manually)
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          ONVOPAY_SECRET_KEY: 'REPLACE_ME',
          ONVOPAY_WEBHOOK_SECRET: 'REPLACE_ME',
          TWILIO_ACCOUNT_SID: 'REPLACE_ME',
          TWILIO_AUTH_TOKEN: 'REPLACE_ME',
          TWILIO_WHATSAPP_NUMBER: 'REPLACE_ME',
          ANTHROPIC_API_KEY: 'REPLACE_ME',
          FIREBASE_SERVER_KEY: 'REPLACE_ME',
          GOOGLE_CLIENT_ID: 'REPLACE_ME',
          GOOGLE_CLIENT_SECRET: 'REPLACE_ME',
        }),
        generateStringKey: '_placeholder',
      },
      removalPolicy: props.appEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.secretArn = secret.secretArn;

    new cdk.CfnOutput(this, 'SecretArn', { value: secret.secretArn });
  }
}
