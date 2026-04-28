import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  appEnv: string;
}

export class StorageStack extends cdk.Stack {
  public readonly photosBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Private S3 bucket — no public access ever
    this.photosBucket = new s3.Bucket(this, 'PhotosBucket', {
      bucketName: `castrar-cr-photos-${props.appEnv}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: props.appEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.appEnv !== 'prod',
      // 6-month retention for pet photos — GDPR compliance
      lifecycleRules: [
        {
          id: 'delete-pet-photos-6-months',
          prefix: 'pets/',
          expiration: cdk.Duration.days(180),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            props.appEnv === 'prod' ? 'https://castrar.cr' : 'https://castrar-*.vercel.app',
            'http://localhost:3000',
          ],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // CloudFront OAC for secure access
    const oac = new cloudfront.S3OriginAccessControl(this, 'PhotosOAC', {
      description: 'OAC for castrar.cr photos',
    });

    this.distribution = new cloudfront.Distribution(this, 'PhotosCDN', {
      comment: `castrar.cr photos CDN - ${props.appEnv}`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.photosBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    new cdk.CfnOutput(this, 'PhotosBucketName', { value: this.photosBucket.bucketName });
    new cdk.CfnOutput(this, 'PhotosCDNUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
    });
  }
}
