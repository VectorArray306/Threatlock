# Threatlock product feature overview

**Audience:** product, design, demo, and engineering teammates

**Status as of 24 October 2026:** the local web demonstration is usable; the AWS-backed presenter experience is implemented in code but has not been deployed or connected to an account.

## Product in one paragraph

Threatlock demonstrates a conversation-security assistant at the moment a person is about to share information. In an Android-inspired web interface, a presenter can follow fictional conversations, inspect a draft or attachment, see an allow/warn/block/unscored decision, and review the resulting security event. The demonstration shows how explicit policy, contextual analysis, and human judgment can work together. It is a **web simulation**, not an Android app or protection layer for real messaging apps.

## What teammates can demonstrate today

The local walkthrough runs without an account, cloud services, or external AI. Its scenarios and history are clearly fictional. It is suitable for showing the product concept and discussing user flows; it does not establish detection accuracy on real-world content.

| Feature                                 | Presenter experience                                                                                                                                                                                          | Status                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Android-inspired conversation screen    | View a chat-style thread in a responsive web layout, including desktop and mobile sizes.                                                                                                                      | Available locally                      |
| Guided scenario library                 | Choose from eight scenarios: ordinary collaboration, social engineering, credential solicitation, a restricted handoff, screenshot context, a likely false positive, manual escalation, and a service outage. | Available locally                      |
| Step-by-step incoming messages          | Reveal each scenario's incoming messages with **Next message**, making the threat context visible as it develops.                                                                                             | Available locally                      |
| Editable outgoing draft                 | Change the proposed reply or write a fictional draft of up to 2,000 characters.                                                                                                                               | Available locally                      |
| Synthetic attachment picker and preview | Add or preview one of six bundled PNG, JPEG, or PDF samples, including public and restricted examples. Incoming screenshot context is also shown in its scenario.                                             | Available locally; no upload or OCR    |
| Check before send                       | Run a visible assessment and show the decision, severity, risk, reason, explanation, and source.                                                                                                              | Available locally                      |
| Deterministic protection                | Enabled literal rules and restricted attachment classification warn or block. Built-in synthetic restricted markers always block.                                                                             | Available locally                      |
| Contextual examples                     | Exact curated inputs show recorded contextual warnings or a recorded safe result. Changed inputs explicitly report that live AI is unavailable.                                                               | Available locally as labelled fixtures |
| Human decision on warnings              | A presenter may deliberately override a warning or send an unscored draft after acknowledging the limitation. A block cannot be overridden.                                                                   | Available locally                      |
| Simulated sending                       | An allowed or consciously overridden draft appears in the on-page conversation. It is never sent to another app or person.                                                                                    | Available locally                      |
| Manual escalation                       | Flag a conversation for local review even without a policy or contextual warning.                                                                                                                             | Available locally                      |
| Rule management                         | Add a warn/block phrase, enable or disable rules, preview draft rules, discard changes, publish a numbered revision, inspect the previous revision, and restore it as a new revision.                         | Available locally                      |
| Security dashboard                      | Review live-session incident counts, policy blocks, hourly activity, severity distribution, and metadata-only event rows; acknowledge or escalate live events.                                                | Available locally                      |
| Clearly separated sample history        | Switch to 12 read-only synthetic events across three fictional personas and filter by persona, without mixing sample data into live-session counts.                                                           | Available locally                      |
| Session continuity and reset            | Keep fictional drafts, messages, rules, and incident metadata in the browser tab's session storage, including across reloads; reset the walkthrough from **How it works**.                                    | Available locally                      |
| In-product explanation                  | The **How it works** view explains policy-first checks, the limits of recorded contextual results, human review, and the local-data boundary.                                                                 | Available locally                      |

### What the decisions mean

| Result                 | Meaning in the demo                                                                                  | Can the presenter send?                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Allowed                | The exact curated case has a recorded safe result after local policy passes.                         | Yes                                             |
| Warning                | A rule or recorded contextual example flags risk.                                                    | Yes, after an explicit override                 |
| Blocked                | Deterministic policy detects a restricted phrase or attachment.                                      | No                                              |
| Unscored / unavailable | No live contextual analysis is connected for the changed input, or the scenario simulates an outage. | Yes, after explicitly accepting that limitation |

This distinction is intentional: the product never presents a recorded response for an altered conversation as though it were a fresh AI assessment.

## Cloud presenter features built in code

These flows are available in a separate cloud-mode UI and backend implementation. They are **not yet live features** because the AWS account integration and service validation are still pending.

| Feature                           | Intended presenter experience                                                                                                          | Current state                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Presenter sign-in                 | Invited demonstrators sign in through Cognito with required TOTP MFA.                                                                  | Implemented in code; not deployed                        |
| Free-form conversation assessment | Enter up to 20 context messages and an outgoing draft, then request a fresh server-side assessment.                                    | Implemented in code; real model behavior unverified      |
| Uploaded evidence                 | Upload up to four PNG/JPEG/single-page PDF files under 1 MB and label each as belonging to a context message or the draft.             | Implemented in code; real upload/OCR unverified          |
| Server-enforced policy            | Apply published literal restrictions to drafts and extracted outgoing attachment text before contextual inference.                     | Implemented in code; real-service validation pending     |
| Contextual AI                     | Use Amazon Bedrock in Mumbai for a structured conversation-risk judgment, with explicit unscored behavior if inference is unavailable. | Implemented in code; model access and quality unverified |
| Shared policy publication         | Stage and publish rules with version-conflict protection for authenticated presenters. The current cloud editor accepts rules as JSON. | Implemented in code; multi-presenter behavior unverified |
| Persistent incident review        | List the signed-in presenter's latest 100 metadata records and mark them acknowledged or escalated.                                    | Implemented in code; persistence unverified in AWS       |
| Temporary evidence handling       | Use short-lived upload forms and references, attempt cleanup after assessment, and rely on an S3 lifecycle rule for abandoned files.   | Implemented in code; lifecycle timing unverified         |

The cloud presenter does not use recorded scenario answers or import the local sample history. Its on-page **Send in demonstration** action still does not send a message to an external app.

## Suggested five-minute walkthrough

1. Open **Simulator** and start with **Everyday collaboration** to show an ordinary allowed check.
2. Switch to **The urgent IT request**, reveal the next incoming message, and check the draft to show a contextual warning and explicit override.
3. Use **The confidential handoff** or a restricted phrase to show an unoverrideable policy block.
4. Change a curated draft to demonstrate that the product clearly says live AI is unavailable for a new input.
5. Open **Rules & policies** to preview an unpublished rule, publish it, and restore the previous policy. Finish in **Security dashboard** to show live event review versus labelled synthetic history.

## Product boundaries and release gate

The current local experience is an internal concept demonstration. It does not intercept notifications, read Android messages, connect to a chat provider, perform local OCR, or run live AI. The cloud code adds the intended authenticated assessment path but has not been deployed or evaluated for detection quality, false positives, latency, accessibility, or real operating costs. All cloud presenters currently share policy-publishing ability, so invitation must be limited to trusted demonstrators.

Before calling the cloud presenter live, the team must confirm AWS account and promotional-credit eligibility, model access in `ap-south-1`, the real hosting/authentication configuration, data-retention decisions, and a complete end-to-end test against deployed services. The proposed AWS Budget alert is not a hard spending cap. See the [engineering overview](ENGINEERING_OVERVIEW.md) and [integration checklist](README.md) for implementation details and remaining verification.
