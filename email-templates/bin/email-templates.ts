#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PrivateAssetsCdnStack } from "../lib/private-assets";
import { PublicAssetsCdnStack } from "../lib/public-assets";

const app = new cdk.App();

new PrivateAssetsCdnStack(app, "private-assets-cdn-stack", {
  hostedZone: "dev.euler.tools",
  description:
    "Private Assets stack including s3 and private cdn with pipeline",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new PublicAssetsCdnStack(app, "public-assets-cdn-stack", {
  hostedZone: "dev.euler.tools",
  description: "Public Assets stack including s3 and private cdn with pipeline",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
