import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

export interface ApiStackProps extends cdk.StackProps {
  appEnv: string;
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  userPoolClientId: string;
  secretArn: string;
  photosBucket: s3.Bucket;
  cdnDomain: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // __dirname en runtime = infra/dist/lib/ → ../../../ = monorepo root
    const LAMBDAS_DIR = path.join(__dirname, '../../../lambdas');

    // ─── Shared config ─────────────────────────────────────────────────────────
    const allowedOrigin = props.appEnv === 'prod'
      ? 'https://castrar.cr'
      : '*';

    const commonEnv: Record<string, string> = {
      DYNAMODB_TABLE_NAME: props.table.tableName,
      SECRET_ARN: props.secretArn,
      COGNITO_USER_POOL_ID: props.userPool.userPoolId,
      SES_FROM_EMAIL: props.appEnv === 'prod' ? 'noreply@castrar.cr' : `noreply-${props.appEnv}@castrar.cr`,
      APP_ENV: props.appEnv,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      PHOTOS_BUCKET_NAME: props.photosBucket.bucketName,
      CDN_DOMAIN: props.cdnDomain,
      // Usado por lambdas/shared/response.ts para el header Access-Control-Allow-Origin
      ALLOWED_ORIGIN: allowedOrigin,
    };

    const bundling: nodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      target: 'node20',
      format: nodejs.OutputFormat.CJS,
    };

    // ─── Lambda factory ────────────────────────────────────────────────────────
    const fn = (
      id: string,
      entry: string,
      extraEnv?: Record<string, string>,
      timeout = cdk.Duration.seconds(15),
      memorySize = 256,
    ): nodejs.NodejsFunction => {
      const f = new nodejs.NodejsFunction(this, id, {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.X86_64,
        timeout,
        memorySize,
        entry: path.join(LAMBDAS_DIR, entry),
        environment: { ...commonEnv, ...extraEnv },
        bundling,
      });

      props.table.grantReadWriteData(f);
      f.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.secretArn],
      }));

      return f;
    };

    // ─── API Lambdas ───────────────────────────────────────────────────────────

    // Campaigns
    const campaignCreate = fn('CampaignCreate', 'api/campaigns/create.ts');
    const campaignGet    = fn('CampaignGet',    'api/campaigns/get.ts');
    const campaignNearby = fn('CampaignNearby', 'api/campaigns/list-nearby.ts');

    // Pets
    const petCreate      = fn('PetCreate',      'api/pets/create.ts');
    const petGet         = fn('PetGet',         'api/pets/get.ts');
    const petList        = fn('PetList',        'api/pets/list.ts');
    const petUploadUrl      = fn('PetUploadUrl',      'api/pets/upload-url.ts');
    const petUpdatePhoto    = fn('PetUpdatePhoto',    'api/pets/update-photo.ts');
    const petUpdate         = fn('PetUpdate',         'api/pets/update.ts');
    const petScreeningAudio = fn('PetScreeningAudio', 'api/pets/screening-audio.ts', {}, cdk.Duration.seconds(30), 512);
    // S3 pre-signed URL: Lambda must have putObject permission
    props.photosBucket.grantPut(petUploadUrl);

    // Registrations
    const regCreate         = fn('RegCreate',         'api/registrations/create.ts');
    const regGet            = fn('RegGet',            'api/registrations/get.ts');
    const regList           = fn('RegList',           'api/registrations/list.ts');
    const regCancel         = fn('RegCancel',         'api/registrations/cancel.ts');
    const regGetExpediente  = fn('RegGetExpediente',  'api/registrations/get-expediente.ts');
    const regUpdExpediente  = fn('RegUpdExpediente',  'api/registrations/update-expediente.ts');

    // Check-in
    const checkinScan = fn('CheckinScan', 'api/checkin/scan.ts');

    // Donations
    const donationIntent = fn('DonationIntent', 'api/donations/create-intent.ts');
    const donationList   = fn('DonationList',   'api/donations/list.ts');

    // Orgs rescatistas — lista pública para donaciones
    const orgListRescate = fn('OrgListRescate', 'api/orgs/list-rescate.ts');

    // Pago de citas (público — sin JWT, acceso por UUID del appointment)
    const appointmentPayIntent = fn('AppointmentPayIntent', 'api/appointments/pay-intent.ts');

    // Admin reembolsos
    const adminRefundNote = fn('AdminRefundNote', 'api/admin/appointments/refund-note.ts');

    // Impact
    const impactGet = fn('ImpactGet', 'api/impact/get.ts');

    // Vets
    const vetRegister = fn('VetRegister', 'api/vets/register.ts');
    const vetApprove  = fn('VetApprove',  'api/vets/approve.ts');
    const vetList     = fn('VetList',     'api/vets/list.ts');

    // Campaign costs tracker
    const campaignCosts    = fn('CampaignCosts',    'api/campaigns/costs.ts');
    const campaignWaitlist = fn('CampaignWaitlist', 'api/campaigns/waitlist.ts');

    // ── Bot external API ──────────────────────────────────────────────────────
    const campaignSlots          = fn('CampaignSlots',         'api/campaigns/slots.ts');
    const campaignCancelCampaign = fn('CampaignCancelCampaign','api/campaigns/cancel-campaign.ts');
    const campaignUpdateCapacity = fn('CampaignUpdateCapacity','api/campaigns/update-capacity.ts');
    const campaignExtend         = fn('CampaignExtend',        'api/campaigns/extend.ts');

    const appointmentCreate      = fn('AppointmentCreate',     'api/appointments/create.ts');
    const appointmentCancel      = fn('AppointmentCancel',     'api/appointments/cancel.ts');
    const appointmentReschedule  = fn('AppointmentReschedule', 'api/appointments/reschedule.ts');
    const appointmentUpdatePet   = fn('AppointmentUpdatePet',  'api/appointments/update-pet.ts');
    const appointmentNoShow      = fn('AppointmentNoShow',     'api/appointments/no-show.ts');
    const appointmentFollowup    = fn('AppointmentFollowup',   'api/appointments/followup.ts');
    const appointmentClose       = fn('AppointmentClose',      'api/appointments/close.ts');

    const ownerLookup            = fn('OwnerLookup',           'api/owners/lookup.ts');
    const petHistory             = fn('PetHistory',            'api/pets/history.ts');

    // Admin campaigns
    const adminCampaignList    = fn('AdminCampaignList',    'api/admin/campaigns/list.ts');
    const adminCampaignUpdate  = fn('AdminCampaignUpdate',  'api/admin/campaigns/update.ts');
    const adminCampaignPublish = fn('AdminCampaignPublish', 'api/admin/campaigns/publish.ts');

    // Admin users — extra Cognito permissions
    const adminUserCreate = fn('AdminUserCreate', 'api/admin/users/create.ts');
    const adminUserList   = fn('AdminUserList',   'api/admin/users/list.ts');

    // Admin orgs rescatistas
    const adminOrgList   = fn('AdminOrgList',   'api/admin/orgs/list.ts');
    const adminOrgCreate = fn('AdminOrgCreate', 'api/admin/orgs/create.ts');
    const adminOrgUpdate = fn('AdminOrgUpdate', 'api/admin/orgs/update.ts');

    adminUserCreate.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminAddUserToGroup'],
      resources: [props.userPool.userPoolArn],
    }));
    adminUserList.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsersInGroup'],
      resources: [props.userPool.userPoolArn],
    }));

    // Webhooks (longer timeout, no JWT auth)
    const onvoPayWebhook  = fn('OnvoPayWebhook',  'webhooks/onvopay/handler.ts',  {}, cdk.Duration.seconds(30));
    const whatsappWebhook = fn('WhatsappWebhook', 'webhooks/whatsapp/handler.ts', {}, cdk.Duration.seconds(30), 512);

    // ─── Scheduled Event Lambdas ───────────────────────────────────────────────
    const releasePendingPayments = fn('ReleasePendingPayments', 'events/release-pending-payments/handler.ts', {}, cdk.Duration.seconds(30));
    const monthlyClose   = fn('MonthlyClose',   'events/monthly-close/handler.ts',  {}, cdk.Duration.minutes(5), 512);
    const notifyWaitlist = fn('NotifyWaitlist', 'events/notify-waitlist/handler.ts',{}, cdk.Duration.seconds(30));
    const releaseSlots   = fn('ReleaseSlots',   'events/release-slots/handler.ts');
    const reminder24h       = fn('Reminder24h',       'events/reminder-24h/handler.ts',         {}, cdk.Duration.seconds(30));
    const reminder2h        = fn('Reminder2h',        'events/reminder-2h/handler.ts',          {}, cdk.Duration.seconds(30));
    const postopInit        = fn('PostopInit',        'events/reminder-postop-init/handler.ts',     {}, cdk.Duration.seconds(60), 512);
    const postopFollowup    = fn('PostopFollowup',    'events/reminder-postop-followup/handler.ts', {}, cdk.Duration.seconds(60), 512);

    // SES permissions for email senders
    const sesPerm = new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });
    [notifyWaitlist, reminder24h, reminder2h].forEach((f) => f.addToRolePolicy(sesPerm));

    // DynamoDB Streams → notify-waitlist (cancelada transitions)
    notifyWaitlist.addEventSource(
      new lambdaEventSources.DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        filters: [
          lambda.FilterCriteria.filter({
            dynamodb: {
              NewImage: { estado: { S: ['cancelada'] } },
              OldImage: { estado: { S: ['confirmada'] } },
            },
          }),
        ],
      }),
    );

    // EventBridge schedules
    new events.Rule(this, 'MonthlyCloseRule', {
      ruleName: `castrar-cr-${props.appEnv}-monthly-close`,
      description: 'Distribución mensual de donaciones a organizaciones rescatistas',
      schedule: events.Schedule.cron({ minute: '0', hour: '23', day: 'L', month: '*', year: '*' }),
      targets: [new targets.LambdaFunction(monthlyClose)],
    });

    new events.Rule(this, 'ReleaseSlotsRule', {
      ruleName: `castrar-cr-${props.appEnv}-release-slots`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(releaseSlots)],
    });

    new events.Rule(this, 'ReleasePendingPaymentsRule', {
      ruleName: `castrar-cr-${props.appEnv}-release-pending-payments`,
      description: 'Libera cupos de citas pendiente_pago cuyo TTL de 20 min venció',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(releasePendingPayments)],
    });

    new events.Rule(this, 'Reminder24hRule', {
      ruleName: `castrar-cr-${props.appEnv}-reminder-24h`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(reminder24h)],
    });

    new events.Rule(this, 'Reminder2hRule', {
      ruleName: `castrar-cr-${props.appEnv}-reminder-2h`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(reminder2h)],
    });

    new events.Rule(this, 'PostopInitRule', {
      ruleName: `castrar-cr-${props.appEnv}-postop-init`,
      description: 'Detecta campañas finalizadas y envía WhatsApp de instrucciones nocturnas + agenda follow-ups',
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(postopInit)],
    });

    new events.Rule(this, 'PostopFollowupRule', {
      ruleName: `castrar-cr-${props.appEnv}-postop-followup`,
      description: 'Envía mensajes de seguimiento post-op en días 1, 3, 7 y 15',
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(postopFollowup)],
    });

    // ─── HTTP API Gateway ──────────────────────────────────────────────────────
    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `castrar-cr-${props.appEnv}`,
      corsPreflight: {
        allowOrigins: props.appEnv === 'prod'
          ? ['https://castrar.cr', 'https://admin.castrar.cr']
          : ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Throttling en el default stage vía escape hatch L1.
    // 500 burst · 200 req/s sostenido — protege contra picos y scrapers.
    // Los endpoints de pago tienen rate limit adicional por IP en DDB (más granular).
    const defaultStage = api.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.addPropertyOverride('DefaultRouteSettings', {
        ThrottlingBurstLimit: 500,
        ThrottlingRateLimit: 200,
      });
    }

    // API Key Authorizer — para endpoints del bot externo
    const apiKeyAuthorizerFn = fn('ApiKeyAuthorizer', 'authorizers/api-key.ts', {}, cdk.Duration.seconds(10), 128);
    const apiKeyAuthorizer = new authorizers.HttpLambdaAuthorizer(
      'ApiKeyAuthorizer',
      apiKeyAuthorizerFn,
      {
        authorizerName: `castrar-cr-${props.appEnv}-api-key-authorizer`,
        responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
        resultsCacheTtl: cdk.Duration.minutes(5),
        identitySource: ['$request.header.X-Api-Key'],
      },
    );

    // JWT Authorizer — Cognito User Pool
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.us-east-1.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      },
    );

    const withAuth    = { authorizer: jwtAuthorizer };
    const withApiKey  = { authorizer: apiKeyAuthorizer };

    const int = (f: lambda.IFunction) =>
      new integrations.HttpLambdaIntegration(`${f.node.id}Int`, f);

    // ─── Public routes (no JWT) ────────────────────────────────────────────────
    api.addRoutes({ path: '/campaigns',                      methods: [apigwv2.HttpMethod.GET],  integration: int(campaignNearby) });
    api.addRoutes({ path: '/campaigns/{id}',                 methods: [apigwv2.HttpMethod.GET],  integration: int(campaignGet) });
    api.addRoutes({ path: '/vets',                           methods: [apigwv2.HttpMethod.GET],  integration: int(vetList) });
    api.addRoutes({ path: '/impact',                         methods: [apigwv2.HttpMethod.GET],  integration: int(impactGet) });
    api.addRoutes({ path: '/orgs/rescate',                   methods: [apigwv2.HttpMethod.GET],  integration: int(orgListRescate) });
    api.addRoutes({ path: '/appointments/{id}/pay-intent',   methods: [apigwv2.HttpMethod.POST], integration: int(appointmentPayIntent) });
    api.addRoutes({ path: '/webhooks/onvopay',               methods: [apigwv2.HttpMethod.POST], integration: int(onvoPayWebhook) });
    api.addRoutes({ path: '/webhooks/whatsapp',              methods: [apigwv2.HttpMethod.POST], integration: int(whatsappWebhook) });

    // ─── Auth routes (JWT required) ────────────────────────────────────────────

    // Campaigns
    api.addRoutes({ path: '/campaigns', methods: [apigwv2.HttpMethod.POST], integration: int(campaignCreate), ...withAuth });

    // Pets
    api.addRoutes({ path: '/pets',                     methods: [apigwv2.HttpMethod.POST],  integration: int(petCreate),      ...withAuth });
    api.addRoutes({ path: '/pets',                     methods: [apigwv2.HttpMethod.GET],   integration: int(petList),        ...withAuth });
    api.addRoutes({ path: '/pets/{id}',                methods: [apigwv2.HttpMethod.GET],   integration: int(petGet),         ...withAuth });
    api.addRoutes({ path: '/pets/{petId}',                   methods: [apigwv2.HttpMethod.PATCH], integration: int(petUpdate),          ...withAuth });
    api.addRoutes({ path: '/pets/{petId}/upload-url',        methods: [apigwv2.HttpMethod.POST],  integration: int(petUploadUrl),       ...withAuth });
    api.addRoutes({ path: '/pets/{petId}/photo',             methods: [apigwv2.HttpMethod.PUT],   integration: int(petUpdatePhoto),     ...withAuth });
    api.addRoutes({ path: '/pets/{petId}/screening-audio',   methods: [apigwv2.HttpMethod.POST],  integration: int(petScreeningAudio),  ...withAuth });

    // Registrations
    api.addRoutes({ path: '/registrations',              methods: [apigwv2.HttpMethod.POST], integration: int(regCreate), ...withAuth });
    api.addRoutes({ path: '/registrations',              methods: [apigwv2.HttpMethod.GET],  integration: int(regList),   ...withAuth });
    api.addRoutes({ path: '/registrations/{id}',         methods: [apigwv2.HttpMethod.GET],  integration: int(regGet),    ...withAuth });
    api.addRoutes({ path: '/registrations/{id}/cancel',          methods: [apigwv2.HttpMethod.POST],  integration: int(regCancel),        ...withAuth });
    api.addRoutes({ path: '/registrations/{regId}/expediente',   methods: [apigwv2.HttpMethod.GET],   integration: int(regGetExpediente), ...withAuth });
    api.addRoutes({ path: '/registrations/{regId}/expediente',   methods: [apigwv2.HttpMethod.PATCH], integration: int(regUpdExpediente), ...withAuth });

    // Check-in
    api.addRoutes({ path: '/checkin/scan', methods: [apigwv2.HttpMethod.POST], integration: int(checkinScan), ...withAuth });

    // Campaign costs
    api.addRoutes({ path: '/campaigns/{id}/costs',    methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: int(campaignCosts),    ...withAuth });
    // Waitlist — protegida con API Key (el bot la llama)
    api.addRoutes({ path: '/campaigns/{id}/waitlist', methods: [apigwv2.HttpMethod.POST], integration: int(campaignWaitlist), ...withApiKey });

    // ── Bot external API routes (X-API-Key) ──────────────────────────────────
    api.addRoutes({ path: '/campaigns/{id}/slots',        methods: [apigwv2.HttpMethod.GET],    integration: int(campaignSlots),          ...withApiKey });
    api.addRoutes({ path: '/campaigns/{id}/appointments', methods: [apigwv2.HttpMethod.POST],   integration: int(appointmentCreate),      ...withApiKey });
    api.addRoutes({ path: '/campaigns/{id}/cancel',       methods: [apigwv2.HttpMethod.POST],   integration: int(campaignCancelCampaign), ...withApiKey });
    api.addRoutes({ path: '/campaigns/{id}/capacity',     methods: [apigwv2.HttpMethod.PATCH],  integration: int(campaignUpdateCapacity), ...withApiKey });
    api.addRoutes({ path: '/campaigns/{id}/extend',       methods: [apigwv2.HttpMethod.POST],   integration: int(campaignExtend),         ...withApiKey });

    api.addRoutes({ path: '/appointments/{id}/cancel',    methods: [apigwv2.HttpMethod.DELETE], integration: int(appointmentCancel),      ...withApiKey });
    api.addRoutes({ path: '/appointments/{id}/reschedule',methods: [apigwv2.HttpMethod.PATCH],  integration: int(appointmentReschedule),  ...withApiKey });
    api.addRoutes({ path: '/appointments/{id}/pet',       methods: [apigwv2.HttpMethod.PATCH],  integration: int(appointmentUpdatePet),   ...withApiKey });
    api.addRoutes({ path: '/appointments/{id}/no-show',   methods: [apigwv2.HttpMethod.POST],   integration: int(appointmentNoShow),      ...withApiKey });
    api.addRoutes({ path: '/appointments/{id}/followup',  methods: [apigwv2.HttpMethod.POST],   integration: int(appointmentFollowup),    ...withApiKey });
    api.addRoutes({ path: '/appointments/{id}/close',     methods: [apigwv2.HttpMethod.PATCH],  integration: int(appointmentClose),       ...withApiKey });

    api.addRoutes({ path: '/owners/lookup',               methods: [apigwv2.HttpMethod.GET],    integration: int(ownerLookup),            ...withApiKey });
    api.addRoutes({ path: '/pets/history',                methods: [apigwv2.HttpMethod.GET],    integration: int(petHistory),             ...withApiKey });

    // Donations
    api.addRoutes({ path: '/donations', methods: [apigwv2.HttpMethod.POST], integration: int(donationIntent), ...withAuth });
    api.addRoutes({ path: '/donations', methods: [apigwv2.HttpMethod.GET],  integration: int(donationList),   ...withAuth });

    // Vets
    api.addRoutes({ path: '/vets',              methods: [apigwv2.HttpMethod.POST], integration: int(vetRegister), ...withAuth });
    api.addRoutes({ path: '/vets/{id}/approve', methods: [apigwv2.HttpMethod.POST], integration: int(vetApprove),  ...withAuth });

    // Admin campaigns
    api.addRoutes({ path: '/admin/campaigns',                methods: [apigwv2.HttpMethod.GET],   integration: int(adminCampaignList),    ...withAuth });
    api.addRoutes({ path: '/admin/campaigns',                methods: [apigwv2.HttpMethod.POST],  integration: int(campaignCreate),       ...withAuth });
    api.addRoutes({ path: '/admin/campaigns/{id}',           methods: [apigwv2.HttpMethod.PATCH], integration: int(adminCampaignUpdate),  ...withAuth });
    api.addRoutes({ path: '/admin/campaigns/{id}/publish',   methods: [apigwv2.HttpMethod.POST],  integration: int(adminCampaignPublish), ...withAuth });

    // Admin users (SuperAdmin only — enforced in Lambda handler)
    api.addRoutes({ path: '/admin/users', methods: [apigwv2.HttpMethod.POST], integration: int(adminUserCreate), ...withAuth });
    api.addRoutes({ path: '/admin/users', methods: [apigwv2.HttpMethod.GET],  integration: int(adminUserList),   ...withAuth });

    // Admin orgs rescatistas
    api.addRoutes({ path: '/admin/orgs',        methods: [apigwv2.HttpMethod.GET],   integration: int(adminOrgList),   ...withAuth });
    api.addRoutes({ path: '/admin/orgs',        methods: [apigwv2.HttpMethod.POST],  integration: int(adminOrgCreate), ...withAuth });
    api.addRoutes({ path: '/admin/orgs/{orgId}',methods: [apigwv2.HttpMethod.PATCH], integration: int(adminOrgUpdate), ...withAuth });

    // Admin reembolsos
    api.addRoutes({ path: '/admin/appointments/{id}/refund-note', methods: [apigwv2.HttpMethod.POST], integration: int(adminRefundNote), ...withAuth });

    // ─── Outputs ───────────────────────────────────────────────────────────────
    this.apiUrl = api.apiEndpoint;
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      exportName: `CastraCr-Api-${props.appEnv}-Url`,
    });
  }
}
