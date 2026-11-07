# jXchange API Passthrough & Middleware Gateway

An open-source, read-only middleware gateway for Jack Henry **jXchange**. It turns SOAP/XML core
inquiries into JSON REST endpoints for external partners, masks every response to a persona, and issues
API keys through role-scoped invite links. The whole stack deploys into the financial institution's own
AWS account from a single CloudFormation file — no vendor-hosted service, no loan data at rest, and no
partner ever touches the core credentials.

Sister projects:
[Encompass](https://github.com/Spuds0588/Encompass-API-Passhrough-Middleware-Gateway-) ·
[MeridianLink Mortgage](https://github.com/Spuds0588/MeridianLink-Mortgage-API-Passthrough-Middleware-Gateway) ·
[BytePro Enterprise Cloud](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway).
This repository follows their runtime and deployment conventions where they fit a core banking bus.

## Community-supported — contribute aggressively

This is an independent, community-supported template, not a vendor product, and it is not affiliated with
Jack Henry & Associates. The maintainer has **no Jack Henry access and no AWS account for this project**, so
every deployment is also a test. Issues and pull requests are the roadmap, not a support channel:

- **Found a bug?** [Open the bug report form](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/issues/new?template=bug_report.yml)
  with a minimal reproduction, the commit you tested, and sanitized logs. Feature ideas use the
  [improvement form](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/issues/new?template=feature_improvement.yml).
- **Opening a pull request?** Read the [PR template](.github/pull_request_template.md). It requires what you
  actually verified, what you could not validate, and a regression test for bug fixes.
- **Fixed something?** [Open a pull request](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/pulls)
  with a regression test and the docs updated.
- **Validated a SOAP shape or a real deployment?** Report the sanitized result on the relevant issue. That
  evidence is more valuable than a speculative patch.
- **Want to help long term?** The maintainer is happy to add contributors: say so on your issue or PR.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), the agent operating manual in [AGENTS.md](AGENTS.md), and
[llms.txt](llms.txt) for machine-readable context. The public overview lives at [index.html](index.html)
(GitHub Pages, served from `main`). Privately patched forks are discouraged: upstream the smallest fix so
the next institution benefits. Never include API keys, invite codes, certificates, account numbers, or
customer data in an issue, PR, screenshot, or log.

## Deploy (AWS CloudShell, ~3 minutes)

```shell
bash <(curl -sSL https://raw.githubusercontent.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/main/deploy.sh)
```

The script verifies your AWS session, asks for the jXchange `ServiceGateway` URL, institution routing ID,
`InstEnv`, and the bank-licensed `ValidConsmName`/`ValidConsmProd`, optionally base64-encodes an mTLS
client certificate and key, generates three role invite codes, fetches the committed template, and deploys
`JXchange-Gateway` with `CAPABILITY_IAM`. It prints:

- `GatewayUrl` — base URL for vendor calls
- `AdminPortalUrl` — the invite portal
- `HealthUrl`, `OperationsUrl`
- `StaticEgressIp` — whitelist this with Jack Henry for the jXchange endpoint
- three ready-to-share role links, e.g. `...?role=lending&code=...`

Environment overrides: `STACK_NAME`, `AWS_REGION`, `TEMPLATE_URL`, `JXCHANGE_ENDPOINT_URL`, `INST_RT_ID`,
`INST_ENV`, `CORE_TYPE`, `VALID_CONSM_NAME`, `VALID_CONSM_PROD`, `AUDIT_USR_ID`, `AUDIT_WS_ID`,
`CLIENT_CERT_FILE`, `CLIENT_KEY_FILE`, `INVITE_VERIFICATION`, `INVITE_LENDING`, `INVITE_AGGREGATION`.

Prefer the console? Upload `template.yaml` directly in CloudFormation and fill in the same parameters.
It stays under the 51,200-byte direct-upload limit.

### Smoke test after deploy

```shell
curl -s "$HEALTH_URL"
curl -s "$PORTAL_URL?role=lending&code=$INVITE_LENDING"
curl -s -X POST "$PORTAL_URL" -H "content-type: application/json" \
  -d "{\"role\":\"lending\",\"code\":\"$INVITE_LENDING\",\"tenantName\":\"Acme Lending\",\"email\":\"dev@acme.test\"}"
# use the returned apiKey:
curl -s "$GATEWAY_URL/v1/accounts/123456789?type=D" -H "x-api-key: $KEY"
curl -s "$GATEWAY_URL/v1/accounts/123456789/transactions?type=D&limit=25" -H "x-api-key: $KEY"
curl -s "$GATEWAY_URL/v1/customers/CUST-443322" -H "x-api-key: $KEY"
curl -s "$GATEWAY_URL/v1/operations" -H "x-api-key: $KEY"
```

`type` is the core's `AcctType` code (`D` for demand deposit, `S` savings, `L` loan, `T` time deposit in the
published examples). The gateway does not guess it and does not translate codes; confirm the codes your core
uses before you publish a vendor guide.

## Features

- **SOAP/XML → JSON reads** — `AcctInq`, `AcctHistSrch`, and `CustInq` are wrapped in valid jXchange
  envelopes with `MsgRqHdr`/`SrchMsgRqHdr`, `InstRtId`, `InstEnv`, `ValidConsmName`, `ValidConsmProd`, and
  audit identifiers, then normalized into a small, documented JSON contract.
- **mTLS and static egress** — optional client certificate and key from Secrets Manager, a private-subnet
  Lambda, and a NAT gateway with an Elastic IP so the core can allowlist one address.
- **Persona schema masking** — deny-by-default allowlists per persona; a field that is not allowed is absent,
  not null. Unknown personas fail closed.
- **Role-scoped self-serve onboarding** — the institution shares a verification, lending, or aggregation
  invite link; the vendor enters a company name and developer email; the gateway locks the key to that
  role's persona server-side. No admin token and no per-vendor admin work.
- **Read-only by design** — `POST`, `PATCH`, `PUT`, and `DELETE` return `501`. There is no queue, no write
  pipeline, and no money movement in this MVP.
- **One-file deployment** — one CloudFormation template under the direct-upload limit with the Lambda bundle
  inlined; no S3 bucket, no zip, no build step in AWS.

## API

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | none | `{ "status": "ok", "system": "JXchangeGateway", "mode": "read-only" }` |
| `GET` | `/portal` | none | invite landing page + response-field cheat sheet |
| `GET` | `/portal?role=lending&code=…` | invite code | persona-locked form |
| `POST` | `/portal` body `{ role, code, tenantName, email }` | invite code | `{ apiKey, tenantName, email, role, persona }` |
| `GET` | `/v1/accounts/{accountId}?type=D` | `x-api-key` | account status and balances |
| `GET` | `/v1/accounts/{accountId}/transactions?type=D&limit=25` | `x-api-key` | posted transactions |
| `GET` | `/v1/customers/{customerId}` | `x-api-key` | customer name and address on file |
| `GET` | `/v1/operations` | `x-api-key` | catalog of supported reads |

### Response shapes

```json
{
  "accountId": "123456789",
  "accountType": "D",
  "coreType": "SILVERLAKE",
  "status": "1",
  "statusDescription": "Active",
  "balances": { "current": 5420.5, "available": 5310.25 },
  "currency": "USD"
}
```

```json
{
  "accountId": "123456789",
  "transactions": [
    { "transactionId": "TX-998811", "postDate": "2026-10-28", "amount": -45.2, "description": "ACH DEBIT UTILITY CO", "type": "D" }
  ]
}
```

```json
{
  "customerId": "CUST-443322",
  "customerType": "Individual",
  "name": { "first": "Jane", "last": "Doe", "full": null },
  "address": { "street": "456 Oak Ave", "city": "Austin", "state": "TX", "zip": "78701" }
}
```

`acctId`/`customerId` values are echoed from the validated request path. Requests are capped at 100 history
records; `limit` defaults to 25. Dates use `YYYY-MM-DD` and map to `StartDt`/`EndDt`.

### Roles and personas

| Role | Persona | Invite parameter | Sees |
| --- | --- | --- | --- |
| `verification` | `ACCOUNT_VERIFICATION` | `InviteVerification` | balances, status, customer name/address |
| `lending` | `LENDING_PARTNER` | `InviteLending` | the above plus transaction history |
| `aggregation` | `DATA_AGGREGATOR` | `InviteAggregation` | balances, status, transactions, customer ID |

Persona checks happen before and after the core call: a persona that cannot read transactions receives
`403` without a SOAP request, and a persona that cannot see demographics receives `403` instead of an
empty object.

## Architecture

```
Partner ──invite link──► GET  /portal?role=lending&code=… → persona-locked form
Partner ──x-api-key────► API Gateway (usage plan)
                          ├── POST /portal                      → invite → API key + tenant mapping
                          ├── GET  /health                      → open liveness
                          ├── GET  /v1/accounts/{id}            → AcctInq → masked JSON
                          ├── GET  /v1/accounts/{id}/transactions → AcctHistSrch → masked JSON
                          ├── GET  /v1/customers/{id}           → CustInq → masked JSON
                          └── GET  /v1/operations               → read catalog
                                                        │
                              NAT gateway + Elastic IP ─┘─► Lambda (private subnet, mTLS)
                                                              │
                                                              ▼
                                                    jXchange SOAP ServiceGateway
                                                              │
                                                              ▼
                                                     Silverlake / Symitar core
```

Storage: DynamoDB tenant mappings only · Secrets Manager (consumer credentials + optional client cert/key) ·
API Gateway key store · no account, customer, or transaction data at rest.

## Local development

Requires Node.js 20+. There are no dependencies to install.

```shell
npm run dev
# Gateway:      http://127.0.0.1:3000
# Portal:       http://127.0.0.1:3000/portal?role=lending&code=local-lending-invite-0123456789
# Verification: …?role=verification&code=local-verification-invite-0123456789
# Aggregation:  …?role=aggregation&code=local-aggregation-invite-0123456789
npm test            # node:test suite (in-memory, no state)
npm run build       # regenerate dist/gateway.js + template.yaml
npm run verify      # build --check + tests
```

The local stack runs the real handler against `mock/jxchange.js` and an in-memory AWS stand-in. Fake
accounts: `123456789` and `0002235555550015` (normal), `987654321` (empty balances), `000000000`
(SOAP fault), `ERROR500` (HTTP 500). Fake customer: `CUST-443322`; `NONE-*` returns a fault.

### Production check (opt-in)

`npm run verify:production` fetches the live GitHub Pages URL, retries through Pages deploy lag, and requires
the served HTML to byte-match `index.html` (SHA-256), plus reachable `robots.txt`, `sitemap.xml`, and
`llms.txt`. It stays out of `npm run verify` so the offline suite never depends on the network. It verifies
the static site only; the AWS API is not deployed from this environment.

## Repository layout

```
src/lambda.js         deployed Lambda entrypoint
src/app.js            routes, invites, reads, masking, operations catalog
src/jxchange.js       SOAP envelopes, mTLS transport, faults, normalizers
src/xml.js            zero-dependency XML reader and escaper
src/mask.js           persona allowlists
src/roles.js          role → persona + invite env var
src/portal.js         invite portal + cheat sheet
src/aws-store.js      DynamoDB / Secrets Manager / API Gateway adapters
src/server.js         local HTTP adapter
dev/                  local stack and memory store
mock/, fixtures/      fake jXchange core and response fixtures
infra/template.yaml   CloudFormation source (//__GATEWAY_CODE__ placeholder)
template.yaml         generated deployable template (committed)
scripts/build.js      bundle + minified inline + size guard + --check
scripts/verify-production.js  GitHub Pages byte-match check
deploy.sh             one-line CloudShell installer
test/                 node:test unit, e2e, bundle, template and static guards
```

## Status and limitations

Implemented and tested locally: XML parsing, SOAP envelope construction and escaping, documented SoapAction
values, secret decoding, response normalization, invite onboarding with persona locking, persona masking and
refusals, input validation, SOAP fault mapping, transport-failure mapping, the read-only refusal, the HTTP
runtime, the single-file template, and the exact inline bundle the template deploys.

**Not deployed to AWS from this environment** (no AWS account or Jack Henry access). Real resource behavior,
the mTLS handshake, jXchange authentication, and real response shapes remain unverified. The SOAP element
names come from the published jXchange reference (`AcctInq`, `AcctHistSrch`, `CustInq`,
`http://jackhenry.com/ws/{operation}`) and are exercised only against `mock/jxchange.js`. A deployment must
confirm them against its own core and report sanitized shapes back.

Other known limits:

- **Read-only.** No writes, no money movement, no statement documents.
- **No per-account organization scoping.** A key is limited by persona, not by which accounts it may touch:
  any valid key can request any account ID the shared consumer credential can reach. Do not hand one
  institution's key to a competing partner without adding an account-to-organization check.
- **Global per-role invite codes**, not single-use vendor invites; no revocation UI. Rotate by updating the
  stack parameters.
- **Untranslated core codes.** `AcctStat`, `TrnType`, and `AcctType` are canonical core values; the gateway
  keeps no dictionary. Use jXchange `SvcDictSrch` for definitions.
- **One shared usage plan**, no CORS (server-to-server expected), no admin dashboard, USD assumed.
- **Wire security is limited to mTLS plus header credentials.** If the institution's jXchange endpoint
  requires WS-Security username tokens, add them in `src/jxchange.js` and report the shape; that path is not
  implemented today.

## Docs

- `AGENTS.md` — operating manual (YAGNI, one-line preference, security invariants, dev-env hygiene,
  community-maintenance duties).
- `CONTRIBUTING.md` — issue and pull-request workflow, sanitization rules, contributor invitations.
- `llms.txt` — compact machine-readable guide for LLMs and coding agents.
- `index.html` — static project page served from GitHub Pages (`main` / root).
- `robots.txt` and `sitemap.xml` — crawler permissions and the canonical page URL.
- `todo.md` — task tracker. `history.md` — append-only decision log.
