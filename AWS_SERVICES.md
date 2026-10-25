# Threatlock cloud services

The hosted presenter is the cloud UI, connected to the Mumbai (`ap-south-1`) stack. It does not read Android notifications or send messages through another chat app. Sending stays inside this page.

Open the app at [https://aws-integrations.d3mht847j0mfal.amplifyapp.com](https://aws-integrations.d3mht847j0mfal.amplifyapp.com).

The presenter username, password, and authenticator secret are in the untracked `.presenter.local` file on the machine that created the user. They are not stored in git.

## How to use it

1. Open the hosted page and choose **Sign in with Cognito**.
2. Sign in with the invited presenter. The pool requires a password and an authenticator code.
3. Pick a preset or type a fictional context and draft. Context is one message per line, up to 20 lines.
4. Choose **Check conversation**. The page calls the live API. It does not use the local walkthrough's recorded answers.
5. Read the result:
   - **Allowed** can be sent in the page.
   - **Warning** needs the explicit override checkbox before send.
   - **Blocked** cannot be sent. The built-in marker `THREATLOCK DEMO: RESTRICTED` is always blocked by server policy.
   - **Unscored** means contextual analysis did not return a usable score. Sending still requires the explicit override.
6. **Send in demonstration** appends the draft to the on-page thread only.
7. To change shared rules, edit the rules JSON, choose **Stage rules**, then **Publish staged rules**. A staged rule does nothing until it is published. Publishing is shared by every invited presenter.
8. **Cloud incidents** lists this presenter's latest metadata records. Acknowledge or escalate from that list. Message text is not stored there.
9. **End presenter session** signs out through Cognito and returns to this site.

An unchanged draft, context, attachment list, and published policy version reuse one assessment id, so a repeat check does not create a second incident. Editing the draft starts a new check. If the session expires, the page clears the token and shows **Sign in with Cognito** again.

PNG, JPEG, and single-page PDF files under 1 MB can be attached to the draft or to one context line. Use synthetic files only. Each upload is consumed by one check.

## What is connected

| Service | Role in the app |
| --- | --- |
| Amplify Hosting | Serves the cloud UI on the branch URL above. The Vite build has the API URL, Cognito domain, and client id baked in. |
| Amazon Cognito | Invitation-only presenter pool, required authenticator MFA, and the hosted sign-in page. The browser uses authorization-code PKCE. Callback and logout URLs are the Amplify origin. |
| API Gateway HTTP API | Authenticated routes for policy, uploads, assessments, and incidents. Browser preflight is answered without a JWT. Anonymous and invalid tokens receive 401. |
| Lambda | Runs `cloud/aws.ts`. It checks policy, reads uploads, calls OCR and the model, and writes metadata only. |
| DynamoDB | Stores published and staged policy, upload ownership, and metadata-only incidents. Conversation text, OCR text, and file bytes are not written here. |
| Amazon S3 | Holds temporary attachments behind a private bucket. The browser uploads with a presigned POST. Objects are deleted after assessment, and the bucket expires leftovers after one day. |
| Amazon Textract | The function is allowed to call `DetectDocumentText` for attachment OCR. |
| Amazon Bedrock | The function is allowed to call `mistral.ministral-3-8b-instruct` in Mumbai only. |
| CloudWatch Logs | Keeps the function logs for one week. The function does not log prompts or message bodies. |
| AWS Budgets | Monthly cost budget of USD 20 with an alert at 80 percent. Confirm the subscription email from AWS. The budget does not stop usage. |

`scripts/write-cloud-env.sh` can refresh a local `.env.local` from the stack outputs `ApiUrl`, `CognitoDomain`, and `ClientId` for `npm run dev:cloud`.

## What was checked

- The hosted page loads the cloud presenter and redirects sign-in to the Cognito domain with the matching client id, PKCE challenge, and Amplify callback.
- A request with no token or a bad token is rejected.
- A browser preflight from the Amplify origin returns 204 and the expected CORS headers.
- A signed-in call reads the empty published policy.
- A draft containing the restricted marker is blocked by server policy, a repeat of that same assessment id returns the same result, and a different draft with that id is rejected.
- A benign draft returns an unscored result. The model call is not replaced with a local fixture.
- Two metadata incidents were recorded for those checks.

## Account limits still in effect

Bedrock `Converse` for this account returns `Operation not allowed`, including for Ministral 3 8B. Contextual checks therefore come back unscored until the account is allowed to invoke that model. Do not accept third-party model terms on someone else's behalf.

Textract returns `SubscriptionRequiredException`. The function still has permission to call it, but this account cannot use the service yet. An outgoing attachment that cannot be inspected is blocked. Incoming evidence that cannot be read becomes unscored.

Lambda reserved concurrency is not set. This account's regional concurrency quota is 10, and AWS requires those 10 to stay unreserved. API Gateway remains limited to 2 requests per second with a burst of 4.

Deleting the CloudFormation stack does not delete the user pool, metadata table, or attachment bucket. Those have to be removed on purpose.
