# AGENTS.md — Operating Manual

For AI agents and developers working in this repository. Read this before touching code.

## 0. Community maintenance is part of the job

This is **shared infrastructure, not a supported vendor product**. The maintainer has **no Jack Henry access and no AWS account for this project**, so real-world validation only happens when a deployment reports back. Improving the product from real usage is a deliverable, not an optional nicety.

- **Every bug you find, file it.** Open a GitHub issue with a minimal reproduction, the commit you tested, and sanitized evidence. Do not silently work around a gateway defect in an institution's fork.
- **Every fix you make, upstream it.** Open a pull request with a regression test and updated docs. A fix that exists only in a private deployment is a fix nobody else gets.
- **When you cannot contribute, say so.** If a change is blocked (no write access, customer constraints), open the issue with what you learned and state explicitly that the patch is not contributed.
- **When you deploy, report it.** A sanitized note that a real jXchange core or AWS stack worked — or failed — is more valuable than a speculative patch. Add it to the relevant issue or a new one.
- **Actively recruit.** Developers and coding agents who validate a SOAP shape, correct a fixture, or open a good review are maintainers-in-waiting. Say so in the issue or PR, and add contributors who want to keep going.
- **Never claim verification that did not happen.** Local fakes, CI, and template guards are not a live core or a deployed stack. State exactly what ran.
- **Never leak.** No API keys, invite codes, client certificates, account numbers, customer data, or full upstream payloads in issues, PRs, tests, fixtures, screenshots, logs, or generated pages. Redact and rotate.
- **Keep the surfaces in sync.** Behavior, API, deployment, or security changes update `README.md`, `CONTRIBUTING.md`, `llms.txt`, `index.html`, `todo.md`, and this file in the same change.

When you finish a task, ask: *did this produce a test, an issue, or a PR that another deployment can use?* If not, why not.

## 1. Operating Philosophy

- **YAGNI first.** Build only what the task or the planning doc requires. No speculative endpoints, flags, config knobs, or "just in case" abstractions. If a feature is not in `todo.md`, do not write it.
- **Prefer the one-line solution.** If a helper, ternary, or `Array` method does the job, use it instead of a multi-function module. Reach for structure only when a second caller appears.
- **Delete, don't accumulate.** When a shim is replaced, remove the old code in the same change. No dead branches behind `if (false)`.
- **Fix the cause, not the test.** Never weaken an assertion or skip a test to get green. A failing check is information.
- **Measure before claiming.** Performance or reliability claims need a number from a command you actually ran.

## 2. Scope Discipline

This gateway is a **stateless, read-only passthrough**. It must never become a system of record, and it must never move money.

- Do **not** add write operations, SQS write pipelines, or money-movement routes. Adding writes needs a separate design review covering idempotency, audit, and liability, not a small patch.
- Do **not** store account, customer, or transaction data at rest. Only tenant mappings exist in DynamoDB. Responses are not cached server-side.
- Do **not** build a field or code translation dictionary. Status and transaction codes come from the core and are returned as canonical values; definitions come from jXchange `SvcDictSrch`.
- Do **not** add runtime dependencies. `node:http`/`node:https` and the AWS SDK v3 that ships with the Lambda runtime are enough. Local development installs nothing.
- Deny by default: any JSON path not in a persona allowlist is pruned before the response leaves the gateway.

## 3. Standardized Logging

All handlers emit structured JSON via `src/log.js`:

```json
{ "timestamp": "2026-11-07T15:00:00.000Z", "system": "JXchangeGateway", "level": "INFO", "action": "SOAP_REQUEST_DISPATCHED" }
```

- Levels: `INFO` | `WARN` | `ERROR`. Action names are stable `SCREAMING_SNAKE_CASE` log-filter keys.
- Mandatory egress events: `JXCHANGE_EGRESS_INIT`, `SOAP_REQUEST_DISPATCHED`, `SOAP_RESPONSE_RECEIVED`, `SOAP_FAULT_INTERCEPTED`, `MTLS_HANDSHAKE_ERROR`.
- **Never log** API keys, invite codes, consumer credentials, certificates, full account or customer numbers, or full request/upstream bodies. Identifiers are masked to the last four characters via `ref()`.
- Responses are `Cache-Control: no-store`: they are tenant-scoped and financially sensitive.

## 4. Handler Contract

`src/app.js` exports `createApp({ store, core, env, now })` returning `{ handle }`, a pure `async (event) => { statusCode, headers, body }` function shaped like an API Gateway REST proxy event. The same handler runs behind API Gateway (`src/lambda.js`), the local HTTP adapter (`src/server.js`), and tests.

- Storage is an injected async interface: `getSecret`, `getTenant`, `putTenant`, `createApiKey`.
  - `src/aws-store.js` implements it with DynamoDB, Secrets Manager, and API Gateway keys.
  - `dev/memory-store.js` implements it in memory for local runs and tests. Never deploy it.
- Core access is the injected `core` interface: `accountInquiry`, `accountHistory`, `customerInquiry`, each returning `{ statusCode, body }` with the raw SOAP body.
- Tenant identity comes only from `requestContext.identity.apiKeyId`; never from a header, path, or body.
- Persona comes only from the stored tenant record; never from the request.
- `src/jxchange.js` owns SOAP envelope construction, transport, fault detection, and response normalization. `src/xml.js` is the only XML reader.

## 5. Repo Map

| Path | Purpose |
| --- | --- |
| `src/lambda.js` | Deployed handler: lazy config from Secrets Manager. |
| `src/app.js` | Routing, invites, reads, masking, operations catalog. |
| `src/jxchange.js` | SOAP envelopes, mTLS transport, faults, normalizers. |
| `src/xml.js` | Zero-dependency XML reader and escaper. |
| `src/mask.js` | Persona allowlists (deny by default). |
| `src/roles.js` | `verification`/`lending`/`aggregation` → persona and invite env var; timing-safe compare. |
| `src/portal.js` | Invite portal HTML and the response-field cheat sheet. |
| `src/aws-store.js` | AWS adapter (DynamoDB, Secrets Manager, API Gateway). |
| `src/server.js` | Local HTTP adapter (API-Gateway-shaped events, key-id injection). |
| `dev/server.js` | Local stack: fake jXchange + memory store + handler. |
| `dev/memory-store.js` | In-memory AWS stand-in. Never deployed. |
| `mock/jxchange.js`, `fixtures/` | Fake SOAP core and response fixtures. |
| `infra/template.yaml` | CloudFormation source with a `//__GATEWAY_CODE__` placeholder. |
| `template.yaml` | Generated, committed deployable template. Never edit by hand. |
| `scripts/build.js` | Bundles `src/` into readable `dist/gateway.js`, minifies and inlines it, enforces the 51,200-byte limit, supports `--check`. |
| `scripts/verify-production.js` | Opt-in GitHub Pages production check (byte-match + crawler files). |
| `deploy.sh` | One-line AWS CloudShell deployment. |
| `test/*.test.js` | Unit, HTTP e2e, inline-bundle, template, static-page and CI guards (`node:test`). |

## 6. Commands

```bash
npm run dev       # local gateway at :3000 with a fake jxchange core
npm test          # node:test suite (in-memory; no state left behind)
npm run build     # regenerate dist/gateway.js and template.yaml
npm run verify    # build --check + tests (run before committing)
```

## 7. Security Invariants

- Provisioning requires a role's invite code (`INVITE_VERIFICATION`, `INVITE_LENDING`, `INVITE_AGGREGATION`) and fails closed if the role or code is unset. Comparisons are timing-safe. Invite codes are bearer secrets and are never logged or rendered.
- The persona is chosen server-side from the role table; a client-supplied persona or role name cannot widen access.
- API key plaintext is returned once by the portal and never stored. Only `apiKeyId` is persisted.
- Responses are masked per persona; a persona without a field never receives it, even as `null`.
- Core faults are logged in full but returned generically, because they can carry internal host detail. Only the `ErrCode` is passed back.
- The jXchange consumer credentials and optional client certificate/key live in Secrets Manager and are read once per Lambda container.
- The portal sends a strict CSP plus `frame-ancestors 'none'`/`X-Frame-Options: DENY`; `/{proxy+}` requires an API key while `/portal` and `/health` stay open.
- No CORS headers: this is a server-to-server integration.

## 8. Deployment Reality

- Target: API Gateway REST + usage plan, Lambda (Node 20, arm64) in a private subnet, NAT gateway with a static Elastic IP (Jack Henry's firewall allowlist), DynamoDB, Secrets Manager, CloudFormation.
- This machine has no AWS account, AWS CLI, or Jack Henry access. The template is logically tested (resources, wiring, size, embedded code, executed bundle) but **never deployed here**. `history.md` records the exact probe output.
- `scripts/build.js` minifies whitespace from the inlined deploy copy only (`dist` stays readable) to stay under CloudFormation's 51,200-byte direct-upload limit. Keep source formatted; never hand-edit `template.yaml`.
- Local fakes prove routing, auth, masking, validation, and fault mapping — not AWS resource behavior, real mTLS, or real SOAP shapes. Do not describe them as live verification.

## 9. Development Environment Hygiene (limited memory)

1. **No dependencies.** `npm install` installs nothing; keep it that way.
2. **No daemons left running.** `npm run dev` is started explicitly and stopped when the task ends: kill the recorded PID (or `pkill -P <pid>`), never a name pattern. Then verify no `node dev/server.js` process survives.
3. **Clean generated state.** Tests write nothing. After a local run or build, remove `dist/` and any temp files; `dist/` is gitignored build output.
4. **One test run, then stop.** `npm test` uses the built-in runner. No watchers, no reporters, no Docker/emulators.
5. **Verify before finishing:** `npm run verify`, `git status`, and a check for leftover processes and `dist/`/`data/`/`*.log`.

## 10. Working Agreement

- `todo.md` is the single source of truth for current work; `history.md` is append-only. Tick items; never delete them. Supersede a decision with a new dated entry rather than rewriting the old one.
- `npm run verify` must pass before every commit.
- Behavior or API changes update `README.md`, `CONTRIBUTING.md`, `llms.txt`, `index.html`, `todo.md`, and this file in the same change.
- Every non-trivial fix ships with a regression test; every uncertainty becomes a GitHub issue rather than a silent assumption.
- Prefer a small upstream-to-`main` change over a larger local fork. Keep commit messages specific about what was and was not verified.
