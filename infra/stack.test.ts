import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { describe, it, expect } from "vitest";
import { ThreatlockStack } from "./stack";
describe("offline stack", () => {
  it("enforces private storage, JWT auth, retention and cost bounds", () => {
    const stack = new ThreatlockStack(new App(), "Test", {
      origin: "https://demo.test",
      budgetEmail: "owner@example.test",
      domainPrefix: "offline-test-domain",
      env: { region: "ap-south-1" },
      modelId: "mistral.ministral-3-8b-instruct",
    });
    const template = Template.fromStack(stack);
    expect(stack.region).toBe("ap-south-1");
    const rules = template.toJSON().Rules;
    expect(JSON.stringify(rules)).toContain("Final account-plan");
    expect(JSON.stringify(rules)).toContain("NO");
    expect(JSON.stringify(template.toJSON())).toContain(
      ":bedrock:ap-south-1::foundation-model/mistral.ministral-3-8b-instruct",
    );
    expect(JSON.stringify(template.toJSON())).not.toContain(
      "inference-profile/",
    );
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          MODEL_ID: "mistral.ministral-3-8b-instruct",
        }),
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain("us.amazon.nova");
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([Match.objectLike({ ExpirationInDays: 1 })]),
      },
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      AuthorizationType: "JWT",
      RouteKey: "GET /{proxy+}",
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: {
        AllowOrigins: ["https://demo.test"],
        AllowHeaders: ["Authorization", "Content-Type"],
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain("ANY /{proxy+}");
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 29,
    });
    expect(JSON.stringify(template.toJSON())).not.toContain(
      "ReservedConcurrentExecutions",
    );
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      MfaConfiguration: "ON",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
    template.resourceCountIs("AWS::Budgets::Budget", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TimeToLiveSpecification: { AttributeName: "expires", Enabled: true },
    });
  });
  it("rejects cross-region inference profile configuration", () => {
    expect(
      () =>
        new ThreatlockStack(new App(), "Rejected", {
          env: { region: "ap-south-1" },
          origin: "https://demo.test",
          budgetEmail: "owner@example.test",
          domainPrefix: "offline-test-domain",
          modelId: "global.amazon.nova-2-lite-v1:0",
        }),
    ).toThrow("direct in-region foundation model");
  });
});
