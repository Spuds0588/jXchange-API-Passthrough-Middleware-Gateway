# Contributing

This project is community-supported. It is an independent open-source template, not a vendor-hosted
service, and not affiliated with Jack Henry & Associates. The maintainer does not have a Jack Henry
tenant or an institution AWS account, so real-world validation is a shared responsibility. Please
contribute what you learn back to the project.

Bugs, SOAP shape corrections, and fixes are a shared responsibility: file them as GitHub
[issues](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/issues) or
[pull requests](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/pulls)
with sanitized evidence (redacted element shapes, deployment or log excerpts), never secrets or
customer data. Privately patched forks are discouraged. Do not claim live Jack Henry or AWS
verification that did not happen.

**Want to become a contributor?** Say so on your issue or pull request. The maintainer is happy to add
contributors who want to keep improving this project; validating a real deployment, correcting a SOAP
shape, or reviewing a PR are all strong ways to start.

## Ways to help

- Report reproducible bugs with a minimal case.
- Submit fixes with regression tests.
- Share sanitized `AcctInq`, `AcctHistSrch`, or `CustInq` response shapes from a real core.
- Run the stack in an AWS sandbox and report what worked or failed, including the static egress IP setup
  and the mTLS handshake.
- Improve the docs, agent directions, landing page, local fake, or persona allowlists.
- Review other pull requests.

If you find a bug while deploying the template for an institution, do not leave the fix only in a private
fork. Upstream the smallest fix so the next deployment benefits.

## Before opening an issue

1. Search [existing issues](https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/issues) first.
2. Run `npm run verify` and include the result.
3. Try to reproduce with the local fake in `mock/jxchange.js` and `npm run dev`.
4. Reduce the report to one endpoint and one unexpected behavior where possible.

A useful bug report includes:

- The commit SHA you tested.
- Node.js version, and whether you used the local fake, AWS, a real jXchange core, or a combination.
- Expected behavior and actual behavior.
- Steps to reproduce.
- Sanitized request/response examples and logs.
- Whether `npm run verify` passes.
- The smallest test or fake change that reproduces the issue.

Never include API keys, invite codes, consumer credentials, client certificates, account numbers,
customer data, or full upstream payloads. Rotate any credential that was exposed before posting.
Redact identifiers to the last four characters, as the gateway's own logs do.

## Pull requests

- One defect, one fix, one regression test. Keep the diff small.
- Run `npm run verify`. If you changed `src/` or `infra/template.yaml`, run `npm run build` so the
  committed `template.yaml` stays in sync.
- Fill in the PR template's verification section honestly. "Not validated against a real jXchange core"
  is an expected answer; an unstated gap is not.
- Update `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `llms.txt`, and `index.html` when behavior, the API,
  deployment, or security changes, and tick `todo.md` while appending to `history.md`.
- Do not add runtime dependencies, write endpoints, or speculative configuration knobs. Read `AGENTS.md`
  first: YAGNI and one-line solutions are the house style.

## What will not be merged

- Money movement, account modification, or any write path without a separate design review.
- Storage of account, customer, or transaction data at rest.
- A field or code translation dictionary maintained inside the gateway.
- Vendor-hosted multi-tenant credentials. Each institution deploys into its own account.
- Claims of production verification that the author did not perform.
