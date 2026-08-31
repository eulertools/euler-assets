import { CfnOutput, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as S3 from "aws-cdk-lib/aws-s3";
import { GithubS3Pipeline } from "../construct/github-s3-pipeline-construct";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import * as s3 from 'aws-cdk-lib/aws-s3';

interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class PublicAssetsCdnStack extends Stack {
  constructor(scope: Construct, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const bucketName = Fn.importValue("artifact-bucket");

    const bucket = s3.Bucket.fromBucketName(this, "s3-bucket", bucketName);

    const publicAssetsBucket = new S3.Bucket(this, "public-assets", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const certificateArn = Fn.importValue("platform-directory-certificate-public");

    const certificate = Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn
    );

    const publicZone = route53.HostedZone.fromLookup(
      this,
      "public-hosted-zone",
      {
        privateZone: false,
        domainName: hostedZone,
      }
    );

    const { cloudfrontDist } = new GithubS3Pipeline(this, "public-assets-cdn", {
      branchName: "main",
      bucket: publicAssetsBucket,
      directoryName: "public-assets",
      githubRepo: "euler-assets",
      certificate: certificate,
      hostedZone: hostedZone,
      artifactBucket: bucket
    });

    new route53.ARecord(this, "cdn-arecord", {
      zone: publicZone,
      recordName: `*.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    new route53.AaaaRecord(this, "alias-record", {
      zone: publicZone,
      recordName: `*.${hostedZone}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(cloudfrontDist)
      ),
    });

    new CfnOutput(this, "pubic-cloudfront-url", {
      value: cloudfrontDist.distributionDomainName,
    });

    new CfnOutput(this, "public-assets-bucket-output", {
      description: "S3 Bucket for public assests",
      value: publicAssetsBucket.bucketName,
      exportName: "public-assets-bucket",
    });
  }
}
