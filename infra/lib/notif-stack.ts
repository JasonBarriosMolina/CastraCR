import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

export interface NotifStackProps extends cdk.StackProps {
  appEnv: string;
}

export class NotifStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NotifStackProps) {
    super(scope, id, props);

    // SES Email Identity — domain must be verified manually
    if (props.appEnv === 'prod') {
      new ses.EmailIdentity(this, 'DomainIdentity', {
        identity: ses.Identity.domain('castrar.cr'),
      });
    } else {
      // Use sandbox email for dev/staging
      new ses.EmailIdentity(this, 'EmailIdentity', {
        identity: ses.Identity.email(`noreply-${props.appEnv}@castrar.cr`),
      });
    }
  }
}
