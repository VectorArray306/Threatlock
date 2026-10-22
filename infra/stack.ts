import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamo from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as api from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as iam from "aws-cdk-lib/aws-iam";
import * as budgets from "aws-cdk-lib/aws-budgets";
export class ThreatlockStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & {
      origin: string;
      budgetEmail: string;
      domainPrefix: string;
      modelId: string;
      integrationApproved?: boolean;
    },
  ) {
    super(scope, id, props);
    new cdk.CfnRule(this, "AccountIntegrationGate", {
      assertions: [
        {
          assert: cdk.Fn.conditionEquals(
            props.integrationApproved === true ? "YES" : "NO",
            "YES",
          ),
          assertDescription:
            "Final account-plan, credit, routing and cost review must be explicitly approved before deployment.",
        },
        {
          assert: cdk.Fn.conditionNot(
            cdk.Fn.conditionEquals(props.modelId, "MODEL_SELECTION_PENDING"),
          ),
          assertDescription:
            "Verify the direct in-region foundation model is available in ap-south-1 before deployment.",
        },
      ],
    });
    if (
      /^(global|us|eu|apac)\./.test(props.modelId) ||
      props.modelId.includes("/") ||
      props.modelId.startsWith("arn:")
    ) {
      throw Error(
        "Configure a direct in-region foundation model ID; cross-region inference profiles are not permitted.",
      );
    }
    const origin = new URL(props.origin);
    if (origin.protocol !== "https:" || origin.origin !== props.origin)
      throw Error("A single HTTPS origin is required");
    const userPool = new cognito.UserPool(this, "Presenters", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 14,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const client = userPool.addClient("Browser", {
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID],
        callbackUrls: [props.origin],
        logoutUrls: [props.origin],
      },
      preventUserExistenceErrors: true,
    });
    const domain = userPool.addDomain("Login", {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });
    const table = new dynamo.Table(this, "Metadata", {
      partitionKey: { name: "pk", type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      encryption: dynamo.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: "expires",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "incidents",
      partitionKey: { name: "partition", type: dynamo.AttributeType.STRING },
      sortKey: { name: "time", type: dynamo.AttributeType.STRING },
      projectionType: dynamo.ProjectionType.ALL,
    });
    const bucket = new s3.Bucket(this, "TemporaryAttachments", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedOrigins: [props.origin],
          allowedMethods: [s3.HttpMethods.POST],
          allowedHeaders: ["*"],
          maxAge: 300,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const logGroup = new logs.LogGroup(this, "RuntimeLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const fn = new nodejs.NodejsFunction(this, "Runtime", {
      entry: "cloud/aws.ts",
      handler: "main",
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      reservedConcurrentExecutions: 2,
      logGroup,
      environment: {
        TABLE: table.tableName,
        BUCKET: bucket.bucketName,
        ORIGIN: props.origin,
        MODEL_ID: props.modelId,
      },
      bundling: { externalModules: [], minify: true, sourceMap: false },
    });
    table.grantReadWriteData(fn);
    bucket.grantReadWrite(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:DetectDocumentText"],
        resources: ["*"],
      }),
    );
    // Invocation is limited to the selected foundation model in the stack Region.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:${this.partition}:bedrock:${this.region}::foundation-model/${props.modelId}`,
        ],
      }),
    );
    const http = new api.HttpApi(this, "Api", {
      corsPreflight: {
        allowOrigins: [props.origin],
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: [
          api.CorsHttpMethod.GET,
          api.CorsHttpMethod.POST,
          api.CorsHttpMethod.PUT,
          api.CorsHttpMethod.PATCH,
        ],
        maxAge: cdk.Duration.minutes(5),
      },
    });
    const auth = new authorizers.HttpUserPoolAuthorizer(
      "PresenterAuth",
      userPool,
      { userPoolClients: [client] },
    );
    http.addRoutes({
      path: "/{proxy+}",
      methods: [api.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration(
        "RuntimeIntegration",
        fn,
      ),
      authorizer: auth,
    });
    const stage = http.defaultStage!.node.defaultChild as api.CfnStage;
    stage.defaultRouteSettings = {
      throttlingBurstLimit: 4,
      throttlingRateLimit: 2,
    };
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: `${id}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 20, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            { subscriptionType: "EMAIL", address: props.budgetEmail },
          ],
        },
      ],
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: http.apiEndpoint });
    new cdk.CfnOutput(this, "ClientId", { value: client.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", { value: domain.baseUrl() });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
  }
}
