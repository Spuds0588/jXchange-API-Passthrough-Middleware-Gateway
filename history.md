# history.md — Decision and work log

Append-only. Newest entries at the bottom. Never rewrite or delete an entry; supersede a decision with a
new dated entry.

## 2026-11-07 — Repository baseline

- Repository contained only `README.md`, `LICENSE` (MIT), and the planning export
  `Jack Henry API Gateway Planning Doc.md`. No source, tests, or infrastructure existed.
- Git remote: `https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway.git`, branch `main`.
  GitHub CLI authenticated as `Spuds0588` with `repo` scopes.
- Surveyed the sister repositories for conventions: Encompass, MeridianLink Mortgage, and BytePro Enterprise
  Cloud. Adopted their shape: one Lambda behind API Gateway, `createApp({ store, core, env, now })`,
  API-Gateway-shaped events, injected storage, local HTTP adapter, memory store, fake upstream, `node:test`,
  generated `template.yaml` with an inline bundle, one-line `deploy.sh`, and a GitHub Pages landing page.

## 2026-11-07 — MVP scope decisions

- **Read-only.** The planning doc's section 5 separates read-only inquiry from money-movement liability.
  The MVP implements reads only. `POST`/`PATCH`/`PUT`/`DELETE` return `501`; there is no SQS queue and no
  write pipeline. Adding writes requires a separate design covering idempotency, audit, and liability.
- **Real jXchange operation names.** Confirmed against the published Jack Henry developer reference rather
  than the planning doc's illustrative names: `AcctInq` (SoapAction `http://jackhenry.com/ws/AcctInq`),
  `AcctHistSrch` (account history search), and `CustInq`. The doc's `AcctHistInq` is not the published
  operation name, so it was not used.
- **Request envelope follows the published examples**: `MsgRqHdr` → `jXchangeHdr` with `JxVer`,
  `AuditUsrId`, `AuditWsId`, `InstRtId`, `InstEnv`, `ValidConsmName`, `ValidConsmProd`; `AcctHistSrch`
  uses `SrchMsgRqHdr` with `MaxRec`; inquiries use `InAcctId`/`AcctId`/`AcctType` and `CustId`.
- **Three personas replace the LOS title/broker/appraisal roles**: `ACCOUNT_VERIFICATION`,
  `LENDING_PARTNER`, `DATA_AGGREGATOR`, with invite roles `verification`, `lending`, `aggregation`.
- **No field dictionary.** The planning doc warns against a hand-maintained translation table. The gateway
  returns canonical core codes (`AcctStat`, `TrnType`, `AcctType`) and documents `SvcDictSrch` as the source
  of definitions. There is no `/v1/fields` proxy because jXchange has no equivalent schema endpoint.
- **No data at rest.** DynamoDB holds tenant mappings only. Secrets Manager holds the consumer credentials
  and optional client certificate/key (base64 inside the secret JSON so the JSON stays valid).
- **Static egress IP** is provisioned (VPC + NAT + EIP) because jXchange endpoints commonly allowlist source
  addresses; Lambda's own addresses are not stable.

## 2026-11-07 — Implementation

- Added `src/xml.js` (tolerant namespace-agnostic XML reader), `src/jxchange.js` (SOAP envelopes, SoapAction,
  mTLS transport, fault detection, normalizers), `src/mask.js` (deny-by-default persona allowlists),
  `src/roles.js` (timing-safe invite validation), `src/portal.js` (invite page), `src/app.js` (routes),
  `src/aws-store.js`, `src/server.js`, and `src/lambda.js`.
- Added `mock/jxchange.js` and `fixtures/` for a local fake core with a normal account, an empty-balance
  account, a SOAP-fault account, and an HTTP-500 account.
- Added `dev/server.js` and `dev/memory-store.js` for a dependency-free local stack.
- Added `infra/template.yaml` (VPC/NAT/EIP, private-subnet Lambda, DynamoDB, Secrets Manager, API Gateway
  REST + usage plan, CloudWatch retention), generated `template.yaml`, `scripts/build.js`,
  `scripts/verify-production.js`, and `deploy.sh`.
- Added `AGENTS.md`, `CONTRIBUTING.md`, `llms.txt`, `TODO`/`history` logs, issue forms, PR template, and CI.
- Added `index.html` with canonical metadata, Open Graph, Twitter card, and `SoftwareApplication` +
  `FAQPage` JSON-LD for search and answer engines, plus `robots.txt` and `sitemap.xml`.

## 2026-11-07 — Verification

- `npm run verify`: 58 tests, 58 pass, 0 fail. `template.yaml` is in sync at 45,859 bytes with 5,341 bytes
  of CloudFormation headroom. The suite covers XML parsing, envelope construction and escaping, documented
  SoapAction values, secret decoding, all three response normalizers, SOAP fault mapping, invite validation,
  persona masking and pre-call refusals, identifier/limit/date validation, transport-failure mapping, the
  read-only refusal, the inline deployable bundle, the template guards, and the static page.
- Environment probe: `aws` not installed, no `AWS_*` credentials, no `~/.aws`; no Jack Henry access. No
  CloudFormation deployment, live mTLS handshake, API Gateway key creation, or real SOAP exchange was
  performed. The template is logically tested and the embedded bundle is executed against the local fake,
  which is not the same as a deployed stack or a real core.
- `npm run verify:production` is run after the push and Pages enablement; it verifies the static site only.

## 2026-11-07 — Bundler constraint discovered during the first build

- The sister-project bundler minifies whitespace with a token scanner that does not understand a template
  literal nested inside another template literal's `${…}` expression. `src/portal.js` originally nested the
  error and invite blocks inside the page template, which desynced the scanner and swallowed the following
  module (`SyntaxError: Unexpected identifier 'AcctInq'`).
- Fixed in the source, not the guard: the portal now builds `errorBlock()` and `inviteBlock()` as separate
  top-level templates and interpolates their results. The build keeps its parse check, so the deployable
  artifact is proven to parse on every build.
- Two mismatches were also caught by the first run and fixed: the normalizers were searching a raw SOAP
  string instead of a parsed tree (all fields null, faults undetected), and `decodeSecret` expected
  `clientCertPemBase64` while `template.yaml` emits `clientCertBase64`.
- Persona capability checks for history and customer demographics moved ahead of the SOAP call, so a
  denied persona never causes core egress. The post-call mask check stays as defence in depth.

## 2026-11-07 — Local HTTP smoke test

- `node dev/server.js` on `PORT=3311` with the fake core on `UPSTREAM_PORT=3410` (port 3000 was already
  occupied by an unrelated local application; that process was left untouched).
- `GET /health` → `{"status":"ok","system":"JXchangeGateway","mode":"read-only"}`.
- `GET /portal?role=lending&code=…` → 200 and rendered the persona lock to `LENDING_PARTNER`; the invite
  code itself was not rendered.
- `POST /portal` → 200 with a one-time local key.
- `GET /v1/accounts/123456789?type=D` → 200 with `balances.current` 5420.5 and `available` 5310.25.
- `GET /v1/accounts/123456789/transactions?type=D&limit=2` → 200 with normalized transactions.
- `GET /v1/accounts/123456789` without a key → 403.
- The recorded server PID was killed and confirmed stopped; no dev server was left running.
