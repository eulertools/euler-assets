import { Duration, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudFront from "aws-cdk-lib/aws-cloudfront";
import * as IAM from "aws-cdk-lib/aws-iam";
import * as Codebuild from "aws-cdk-lib/aws-codebuild";
import { IBucket } from "aws-cdk-lib/aws-s3";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import {
  CodeBuildAction,
  GitHubSourceAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import { LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";

interface PipelineProps extends StackProps {
  githubRepo: string;
  branchName: string;
  bucket: IBucket;
  directoryName: string;
  hostedZone: string;
  certificate: ICertificate;
  artifactBucket: IBucket;
}

export class GithubS3Pipeline extends Construct {
  public readonly cloudfrontDist: cloudFront.Distribution;
  constructor(stack: Stack, id: string, props?: PipelineProps) {
    super(stack, id);

    const {
      githubRepo,
      branchName,
      bucket,
      directoryName,
      hostedZone,
      certificate,
      artifactBucket,
    } = props!;

    const cloudFrontOAI = new cloudFront.OriginAccessIdentity(this, "OAI", {
      comment: `OAI for ${directoryName} website.`,
    });

    const cloudFrontDistProps: cloudFront.DistributionProps = {
      defaultBehavior: { origin: new origins.S3Origin(bucket) },
      domainNames: [`${directoryName}.${hostedZone}`],
      certificate,
    };

    const cloudfrontDist = new cloudFront.Distribution(
      this,
      `${directoryName}-cfd`,
      cloudFrontDistProps
    );

    this.cloudfrontDist = cloudfrontDist;

    const cloudfrontS3Access = new IAM.PolicyStatement();
    cloudfrontS3Access.addActions("s3:GetBucket*");
    cloudfrontS3Access.addActions("s3:GetObject*");
    cloudfrontS3Access.addActions("s3:List*");
    cloudfrontS3Access.addResources(bucket.bucketArn);
    cloudfrontS3Access.addResources(`${bucket.bucketArn}/*`);
		cloudfrontS3Access.addPrincipals(cloudFrontOAI.grantPrincipal);

    bucket.addToResourcePolicy(cloudfrontS3Access);

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const githubSourceAction = new GitHubSourceAction({
      actionName: "Github-Commit-Source-Action",
      output: sourceOutput,
      owner: "eulertools",
      repo: githubRepo,
      branch: branchName,
      oauthToken: SecretValue.secretsManager("githubToken"),
    });

    const project = new PipelineProject(this, `${directoryName}-build`, {
      buildSpec: Codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              'echo Entering into Build Stage',
              'echo Build Started',
              'aws s3 sync email-templates/lib/${DIRECTORY_NAME}/assets s3://${S3_BUCKET} --exclude "*.js.map" --delete',
              'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DIST_ID} --paths "/index.html"',
              'echo Build completed',
            ],
          },
        },
      }),
      projectName: `${directoryName}-build`,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      environmentVariables: {
        S3_BUCKET: {
          value: bucket.bucketName,
        },
        CLOUDFRONT_DIST_ID: {
          value: cloudfrontDist.distributionId,
        },
        DIRECTORY_NAME: {
          value: directoryName,
        },
      },
      timeout: Duration.minutes(20),
    });

    const buildAction = new CodeBuildAction({
      actionName: "Code-Build-Action",
      input: sourceOutput,
      project: project,
      outputs: [buildOutput],
    });

    project.addToRolePolicy(
      new IAM.PolicyStatement({
        effect: IAM.Effect.ALLOW,
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        actions: [
          "s3:GetBucket*",
          "s3:List*",
          "s3:GetObject*",
          "s3:DeleteObject",
          "s3:PutObject",
        ],
      })
    );

    project.addToRolePolicy(
      new IAM.PolicyStatement({
        effect: IAM.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetDistribution*",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations",
          "cloudfront:ListDistributions",
        ],
      })
    );

    new codepipeline.Pipeline(this, `${stack.stackName}-CodePipeline`, {
      pipelineName: `${stack.stackName}-pipeline`,
      stages: [
        {
          stageName: "Source",
          actions: [githubSourceAction],
        },
        {
          stageName: "Build",
          actions: [buildAction],
        },
      ],
      artifactBucket: artifactBucket,
    });
  }
}
