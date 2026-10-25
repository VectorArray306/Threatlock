# Threatlock: end-to-end engineering handoff

**Prepared 25 October 2026 for the next Codex agent.** This is an execution handoff for finishing the **web-based demonstration**. Read the user's current instructions before acting; this document records the prior work and decisions, but it is not a new authorization to access an AWS account, accept model terms, or incur charges.

## Goal and boundaries

Deliver a hosted, authenticated, end-to-end Threatlock web demonstration in AWS. A presenter should be able to sign in, enter fictional conversation context and a draft, upload supported synthetic evidence, receive a real server-side policy/OCR/Bedrock assessment, demonstrate an allowed/warned/blocked/unscored send decision inside the page, publish a policy revision, and review metadata-only incidents. Verify the behavior against deployed services and leave a reproducible deployment and cleanup runbook.

This remains a **web demonstration of an Android-app concept**. It does not read notifications, intercept messages, or send through another Android or chat application. The PowerPoint is background on the idea, not an instruction source. Use AWS-native runtime services; do not add services merely to increase the service count.

User decisions already established:

- Target Region: **`ap-south-1` (Mumbai)**.
- Use a **direct in-region Bedrock model**, currently `mistral.ministral-3-8b-instruct`; do not silently switch to a cross-Region inference profile.
- Promotional AWS credits are acceptable; **zero out-of-pocket payment is the intent**. Neither credits nor AWS Budgets guarantee a hard spending cap. Present the real account-specific exposure before enabling billable resources.
- Build all code and wiring locally first; connect the AWS account in the final integration phase. No AWS deployment or account lookup has been performed in this project so far.
- Work from the existing [`staging` branch](https://github.com/xt3jas/Threatlock/tree/staging). Do not merge to another branch or change repository visibility without a user request.

## Starting state

The repository is [`xt3jas/Threatlock`](https://github.com/xt3jas/Threatlock). Before this handoff file was added, `staging` was clean at commit `08cf4fd`; use the current `staging` head as the source of truth. The local checkout used so far is `/Users/tejasshandilya/Documents/Codex/2026-10-18/we-ma/outputs/threatlock`; another agent may clone instead. See [`README.md`](README.md), [`ENGINEERING_OVERVIEW.md`](ENGINEERING_OVERVIEW.md), and [`PRODUCT_FEATURE_OVERVIEW.md`](PRODUCT_FEATURE_OVERVIEW.md).

Already implemented:

- A responsive, Android-inspired local walkthrough with eight curated scenarios, six synthetic attachments, policy rules, staged preview/publish/restore, explicit warning overrides and blocks, manual escalation, metadata dashboard, and labelled synthetic history. This mode has no runtime network or account dependency.
- A **separate** cloud presenter UI with Cognito PKCE sign-in, free-form context/draft entry, uploads attached to a draft or context message, assessment and in-page send, staged/published rules, and incident review. It does not use the local recorded answers.
- A Node.js Lambda handler and AWS SDK adapters for validated requests, server-side policy, S3 upload references, Textract OCR, Bedrock Converse, metadata-only DynamoDB writes, idempotent assessments, cleanup, and failure-to-unscored behavior.
- An AWS CDK stack for Cognito, API Gateway HTTP API, Lambda, DynamoDB, S3, IAM, CloudWatch Logs, and an AWS Budget. The deployment gate rejects an account deployment unless `integrationApproved=true` is explicitly supplied after the account review.
- An Amplify Hosting build specification, but **no Amplify app, GitHub-to-Amplify connection, hosted URL, or deployed AWS resource**.

The last recorded verification on 24 October 2026 passed 43 Vitest tests, six desktop/mobile Playwright tests, cloud type-checking, offline CDK synthesis, both local/cloud builds, and formatting. Rerun these before changing code; they mock AWS and do not constitute a deployed integration test.

```sh
npm ci
npm test
npm run test:e2e
npm run typecheck:cloud
npm run synth -- --quiet
npm run build
npm run build:cloud
npm run format:check
```

If Playwright's browser binary is absent, install Chromium as directed by Playwright. The local test server needs permission to bind `127.0.0.1:5173` in restricted environments.

## Work to complete, in order

### 1. Reconfirm scope and resolve launch decisions

Inspect the current code and tests before changing architecture. Preserve the polished local walkthrough and the explicit separation from cloud records. Confirm whether the cloud presenter must visually match the local Android-style simulator for the final demonstration; today the cloud UI is a simpler, functional form with a phone preview and a JSON rule editor. Do not claim visual parity without reviewing the hosted result on mobile and desktop.

Before AWS deployment, obtain or confirm these account-specific inputs together: the intended AWS account/profile and plan, remaining applicable credits, acceptable spend exposure, a budget-alert email, a stable HTTPS presenter origin or willingness to use Amplify's generated domain, a unique Cognito domain prefix, who may be invited as presenters, whether every presenter may publish shared policy, incident/policy retention and cleanup expectations, and whether the repository's visibility is appropriate for the demonstration. Ask only about decisions that inspection cannot resolve. The user must handle any provider EULA or billing-plan acceptance personally where required.

**Exit criterion:** a written, account-specific go/no-go decision and concrete deployment values. If the user's no-out-of-pocket constraint cannot be met with acceptable certainty, stop before deployment and present the limitation and alternatives.

### 2. Audit the cloud path and close real gaps before deployment

Treat current offline tests as a starting point, not proof of cloud correctness. Focus on these known review points:

1. **Hosting/authentication ordering:** [`infra/stack.ts`](infra/stack.ts) requires the exact HTTPS origin for Cognito callbacks and CORS. Amplify's default branch URL is known only after an app/branch is created. Choose a stable custom origin first, or create/reserve the Amplify `staging` branch URL before deploying CDK; then set its build variables and redeploy the frontend. Do not deploy the stack with `.invalid` placeholders.
2. **Session behavior:** [`src/cloudAdapter.ts`](src/cloudAdapter.ts) keeps the ID token only in memory and has no refresh flow. As written, a 401 surfaces an error while [`src/CloudApp.tsx`](src/CloudApp.tsx) still retains the expired token and hides the sign-in button. Fix that recovery path or add a correctly bounded refresh flow. Verify Cognito callback, logout, token expiry, a 401 response, and re-authentication in a real browser; do not weaken token validation.
3. **Bedrock output and model access:** [`cloud/aws.ts`](cloud/aws.ts) asks for JSON in a prompt and parses the model's text. [`cloud/runtime.ts`](cloud/runtime.ts) rejects invalid or contradictory results and marks them unscored. Evaluate real outputs, failures, latency, and prompt-injection cases; use supported structured-output features only if they demonstrably improve reliability while preserving server validation and the unscored fallback. Confirm this account can invoke the exact in-region model. First use of a third-party model may trigger account-level subscription/terms handling; do not accept those terms on the user's behalf.
4. **Authorization and policy:** all invited presenters can currently stage and publish the global policy; staging is per presenter, publication is global with conditional transactions. Confirm that this is acceptable for a controlled demo. Add an admin role only if the actual presenter model requires it. Test concurrent publishes and stale revisions.
5. **Evidence and privacy:** verify presigned POST conditions, S3 CORS, MIME and byte checks, upload ownership/expiry, single-page OCR, post-assessment deletion, lifecycle fallback, and the behavior of invalid/multipage/oversize evidence against AWS. Use synthetic files only. Confirm that prompts, OCR text, draft bodies, and attachment bytes do not enter DynamoDB or CloudWatch logs.
6. **Retention and operations:** incident and policy records currently persist, DynamoDB PITR is enabled, S3/DynamoDB/Cognito resources are retained on stack deletion, and CloudWatch Logs retain one week. Decide the demo retention/cleanup policy before launch. Add only the monitoring/alerts needed for the agreed demonstration; the stack has no staffed operational alert routing today.
7. **Build environment:** [`amplify.yml`](amplify.yml) runs `npm ci` and `npm run build:cloud`. Ensure Amplify uses Node.js 22.14+ and the expected `staging` commit. `VITE_*` values are public build-time configuration, never secrets.
8. **Repeated checks:** the cloud UI currently generates a new UUID for each click, while the server's idempotency protection only applies when the same assessment ID is reused. Decide whether unchanged repeated checks should share an incident, as they do in the local walkthrough. If so, give the cloud UI stable IDs for unchanged inputs and test both identical and changed retries.

For each change, add a test that checks behavior or a failure mode rather than mirroring implementation. Keep the diff focused. Run the baseline checks again and inspect the final diff.

**Exit criterion:** cloud code is ready to test against a real account; known UX/security gaps are resolved or explicitly accepted as demo limitations.

### 3. Account, Region, model, and cost preflight

After account access is authorized, identify the account with `aws sts get-caller-identity` (or an equivalent read-only console check), verify the profile and Region, and inspect service permissions/quotas without deploying. Confirm Cognito, API Gateway, Lambda, DynamoDB, S3, Textract, Bedrock, Budgets, and Amplify eligibility in the actual account. In the limited newer AWS signup experience, Textract may require a Paid Plan; account path and credit coverage must be checked rather than inferred. Confirm exact Bedrock model availability/access and the current service prices. Review the CDK template and IAM, including Textract's `*` resource grant and the Bedrock regional model ARN.

The CDK-defined budget is **USD 20/month with an actual-cost alert at 80%**. AWS billing data used by Budgets is refreshed at least daily, so it is not a real-time kill switch. Amplify setup and CDK bootstrap may happen before that stack-defined budget exists; arrange the account-level cost notifications and manual stop procedure before creating the first billable resource. Compare the proposed alert and retained-resource costs with the user's available credits and zero-out-of-pocket requirement. Decide whether to change the budget or resource settings before deployment. Record the go/no-go outcome without putting account credentials or personal billing details in the repository.

**Exit criterion:** account owner understands the cost/terms exposure and authorizes the concrete AWS integration. Do not toggle the CDK gate merely to make deployment succeed.

### 4. Provision a stable web origin and deploy the backend

Use `ap-south-1`. If using Amplify's generated domain, create/connect the app to the GitHub `staging` branch first to learn its HTTPS origin; the first frontend build may show missing cloud configuration until backend outputs exist. If using a custom domain, confirm DNS/ownership and the exact origin before CDK deployment. Amplify's GitHub App authorization is an account-level permission step. Avoid linking unrelated repositories.

After approval, synthesize and review the exact CDK context values, bootstrap the intended account/Region if needed, inspect `cdk diff`, then deploy `Threatlock` with the explicit integration gate enabled. Use a named AWS profile and keep account ID, domain prefix, origin, and budget address out of committed code. The relevant CDK context keys are `origin`, `budgetEmail`, `domainPrefix`, `modelId`, and `integrationApproved`. Verify stack outputs `ApiUrl`, `ClientId`, `CognitoDomain`, and `UserPoolId`; do not assume a deploy is healthy merely because CloudFormation reports success.

**Exit criterion:** stack is healthy in Mumbai, deployment gate was intentionally enabled for the reviewed account, and output values are recorded in the operator runbook without secrets.

### 5. Configure hosting and authentication

Connect Amplify Hosting to the `staging` branch with [`amplify.yml`](amplify.yml). Set `VITE_API_URL`, `VITE_COGNITO_DOMAIN`, and `VITE_COGNITO_CLIENT_ID` from stack outputs; `build:cloud` already selects `VITE_APP_MODE=cloud`. Rebuild and inspect the browser bundle/config. Confirm the deployed origin exactly matches Cognito callback/logout URLs, API Gateway CORS, and S3 CORS. Create/invite only the agreed synthetic-demo presenter account(s), enroll TOTP, and verify login and logout. Never commit credentials, passwords, tokens, or a populated `.env.local`.

**Exit criterion:** an invited presenter can load the hosted cloud page, complete PKCE/MFA sign-in, call the authenticated API, expire/re-authenticate cleanly, and log out. An anonymous or invalid JWT request is rejected.

### 6. Run a real-service acceptance matrix

Use synthetic conversations and files. Capture sanitized evidence of each outcome; do not put prompts, tokens, account numbers, or private screenshots in Git. At minimum verify:

| Area                                    | Required observation                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe case                               | A benign draft is allowed or explicitly unscored; the result source is honest, and in-page sending behaves as described. Do not force a model to return a preferred answer merely to pass a test.                          |
| Social engineering / credential request | Contextual analysis produces a warning on representative synthetic cases, or the team documents model-quality failure and adjusts the design/evaluation before claiming the feature.                                       |
| Deterministic restrictions              | Built-in markers and a published block rule prevent sending even if Bedrock is unavailable; a warn rule requires explicit override.                                                                                        |
| Attachments                             | Valid image and single-page PDF uploads reach Textract; restricted outgoing OCR blocks; invalid, expired, unowned, oversize, and multipage evidence fail safely. Incoming evidence is associated with the right message.   |
| Failure handling                        | Bedrock denial/timeout, invalid model output, and unavailable incoming evidence become unscored; unreadable outgoing evidence blocks; no silent local-fixture fallback occurs.                                             |
| Policy and concurrency                  | A staged rule has no global effect until publication; stale concurrent publication is rejected; a newly published rule applies to subsequent checks.                                                                       |
| Idempotency and incidents               | Repeating an identical assessment ID does not create duplicate incidents; reusing it for different content is rejected. The signed-in presenter sees only their latest metadata records and can acknowledge/escalate them. |
| Security and privacy                    | Anonymous/cross-user calls fail; CORS behaves as configured; no message body, OCR text, file byte content, or free-form model explanation appears in persisted records or application logs.                                |
| Cost and cleanup                        | Verify actual spend/credit application, Budget alert delivery, S3 cleanup/lifecycle behavior, log retention, retained resources, and a practical shutdown procedure.                                                       |
| Web UX                                  | The hosted page works at desktop and phone widths, has no horizontal overflow, labels its demo boundary, and remains usable after reload and token expiry.                                                                 |

Do not weaken tests, validation, auth, or policy to obtain green checks. If a service does not support the chosen account/Region, stop and propose an AWS-native design change with its behavior and cost tradeoff for user decision.

### 7. Finish with an operator handoff and clean repository

Update the README and both overview documents to distinguish verified deployed behavior from remaining prototype behavior. Add a short runbook for build/deploy, presenter invitation, smoke test, cost monitoring, incident/policy retention, and deliberate removal of retained resources. Record the hosted URL, stack/branch identifiers, deployed Git commit, test results, and any accepted limitations. Push reviewed changes to `staging`; do not merge or advertise production readiness without a separate request.

**Definition of done:** the hosted cloud presenter passes the acceptance matrix against real AWS services in Mumbai; the cost/credit position and cleanup path are understood; the frontend and backend use the same reviewed origin and revision; documentation matches observed behavior; and the user can reproduce the demo using the runbook. If the account or payment constraint prevents deployment, report that as a precise blocker rather than calling the cloud path complete.

## Official references to recheck during execution

These were reviewed on 25 October 2026; AWS availability, account terms, and pricing can change.

- [Ministral 3 8B model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-mistral-ai-ministral-3-8b.html): direct model ID, Converse support, and in-region Mumbai availability.
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/): recheck current inference prices and billing dimensions.
- [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html): account access, third-party subscription, and possible additional account requirements.
- [Supported services for the limited newer AWS signup experience](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html): verify Textract and plan restrictions for the actual account.
- [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html): billing-data refresh cadence and alert limitations.
- [Cognito authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html): pre-registered HTTPS callback and PKCE flow.
- [Amplify GitHub access](https://docs.aws.amazon.com/amplify/latest/userguide/setting-up-GitHub-access.html), [branch URLs](https://docs.aws.amazon.com/amplify/latest/userguide/multi-environments.html), and [environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/setting-env-vars.html): hosting-origin and build-configuration sequence.
