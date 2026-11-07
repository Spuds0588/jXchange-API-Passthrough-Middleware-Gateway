const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const { startStack, provision, call } = require("./helpers");

let stack;
before(async () => {
  stack = await startStack();
});
after(() => stack.mock.close());

const body = (response) => JSON.parse(response.body);

test("health is open and reports read-only mode", async () => {
  const response = await call(stack.handler, "GET", "/health");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { status: "ok", system: "JXchangeGateway", mode: "read-only" });
});

test("the portal refuses an invalid invite and accepts a valid one", async () => {
  const denied = await call(stack.handler, "GET", "/portal", null, { role: "lending", code: "wrong" });
  assert.equal(denied.statusCode, 403);
  assert.match(denied.body, /invalid or has expired/i);

  const open = await call(stack.handler, "GET", "/portal");
  assert.equal(open.statusCode, 200);
  assert.match(open.body, /Invite link required/);
});

test("provisioning requires a valid role invite and a valid email", async () => {
  const badRole = await stack.handler({ httpMethod: "POST", path: "/portal", body: JSON.stringify({ role: "admin", code: "x", tenantName: "A", email: "a@b.co" }) });
  assert.equal(badRole.statusCode, 403);

  const badEmail = await stack.handler({ httpMethod: "POST", path: "/portal", body: JSON.stringify({ role: "lending", code: require("../dev/server").INVITES.lending, tenantName: "A", email: "nope" }) });
  assert.equal(badEmail.statusCode, 400);

  const malformed = await stack.handler({ httpMethod: "POST", path: "/portal", body: "{" });
  assert.equal(malformed.statusCode, 400);
});

test("requests without a tenant mapping are rejected", async () => {
  for (const path of ["/v1/accounts/123456789", "/v1/accounts/123456789/transactions", "/v1/customers/CUST-443322", "/v1/operations"]) {
    const response = await call(stack.handler, "GET", path);
    assert.equal(response.statusCode, 403, path);
  }
});

test("a lending key reads a normalized account and masks nothing it is allowed to see", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await call(stack.handler, "GET", "/v1/accounts/123456789", identity, { type: "D" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(body(response), {
    accountId: "123456789",
    accountType: "D",
    coreType: "SILVERLAKE",
    status: "1",
    statusDescription: "Active",
    balances: { current: 5420.5, available: 5310.25 },
    currency: "USD"
  });
});

test("the account inquiry envelope carries the configured consumer credentials", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const before = stack.mock.requests.length;
  await call(stack.handler, "GET", "/v1/accounts/123456789", identity, { type: "D" });
  const request = stack.mock.requests[before];
  assert.equal(request.operation, "AcctInq");
  assert.match(request.body, /<ValidConsmName>LOCAL_DEV<\/ValidConsmName>/);
  assert.match(request.body, /<InstRtId>011001276<\/InstRtId>/);
  assert.match(request.body, /<AcctType>D<\/AcctType>/);
});

test("a verification persona can read balances but not transaction history", async () => {
  const { identity } = await provision(stack.handler, stack.store, "verification");
  const account = await call(stack.handler, "GET", "/v1/accounts/123456789", identity, { type: "D" });
  assert.equal(account.statusCode, 200);
  assert.equal(body(account).balances.current, 5420.5);

  const history = await call(stack.handler, "GET", "/v1/accounts/123456789/transactions", identity, { type: "D" });
  assert.equal(history.statusCode, 403);
  assert.match(body(history).error, /cannot read transactions/);
});

test("a lending key reads transaction history", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await call(stack.handler, "GET", "/v1/accounts/123456789/transactions", identity, { type: "D", limit: "2" });
  assert.equal(response.statusCode, 200, response.body);
  const history = body(response);
  assert.equal(history.accountId, "123456789");
  assert.equal(history.transactions.length, 3);
  assert.equal(history.transactions[1].amount, 2500);
  const request = stack.mock.requests.at(-1);
  assert.equal(request.operation, "AcctHistSrch");
  assert.match(request.body, /<MaxRec>2<\/MaxRec>/);
  assert.match(request.body, /<SrchMsgRqHdr>/);
});

test("history validates limit and date ranges before calling the core", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  for (const query of [{ limit: "0" }, { limit: "101" }, { limit: "abc" }, { startDate: "10/01/2026" }, { endDate: "yesterday" }]) {
    const response = await call(stack.handler, "GET", "/v1/accounts/123456789/transactions", identity, { type: "D", ...query });
    assert.equal(response.statusCode, 400, JSON.stringify(query));
  }
});

test("account reads validate the AcctType code", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await call(stack.handler, "GET", "/v1/accounts/123456789", identity, { type: "DDA-TOO-LONG" });
  assert.equal(response.statusCode, 400);
});

test("customers are masked per persona", async () => {
  const lending = await provision(stack.handler, stack.store, "lending");
  const read = await call(stack.handler, "GET", "/v1/customers/CUST-443322", lending.identity);
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(body(read).name.first, "Jane");
  assert.equal(body(read).address.city, "Austin");

  const aggregator = await provision(stack.handler, stack.store, "aggregation");
  const denied = await call(stack.handler, "GET", "/v1/customers/CUST-443322", aggregator.identity);
  assert.equal(denied.statusCode, 403);
  assert.match(body(denied).error, /cannot read customer demographics/);
});

test("aggregation keys see history and balances but no customer demographics", async () => {
  const { identity } = await provision(stack.handler, stack.store, "aggregation");
  const history = await call(stack.handler, "GET", "/v1/accounts/0002235555550015/transactions", identity, { type: "D" });
  assert.equal(history.statusCode, 200);
  assert.equal(body(history).transactions.length, 3);
  const missing = await call(stack.handler, "GET", "/v1/customers/NONE-1", identity);
  assert.equal(missing.statusCode, 403);
});

test("core faults become 404s and core failures become 502s", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const missing = await call(stack.handler, "GET", "/v1/accounts/000000000", identity, { type: "D" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(body(missing), { error: "Record not found" });

  const upstreamError = await call(stack.handler, "GET", "/v1/accounts/ERROR500", identity, { type: "D" });
  assert.equal(upstreamError.statusCode, 502);
});

test("a transport failure is reported as 502, not a crash", async () => {
  const { createJxchange } = require("../src/jxchange");
  const { createApp } = require("../src/app");
  const { createMemoryStore } = require("../dev/memory-store");
  const { localEnv } = require("../dev/server");
  const store = createMemoryStore();
  const app = createApp({ store, core: createJxchange({ endpointUrl: "http://127.0.0.1:1", timeoutMs: 500 }), env: localEnv() });
  const { identity } = await provision(app.handle, store, "lending");
  const response = await call(app.handle, "GET", "/v1/accounts/123456789", identity, { type: "D" });
  assert.equal(response.statusCode, 502);
});

test("unsupported writes are refused instead of silently accepted", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await stack.handler({ httpMethod: "POST", path: "/v1/accounts/123456789", requestContext: { identity } });
  assert.equal(response.statusCode, 501);
  assert.match(body(response).error, /read-only/);
});

test("the operations catalog lists only supported reads", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await call(stack.handler, "GET", "/v1/operations", identity);
  assert.equal(response.statusCode, 200);
  const catalog = body(response);
  assert.deepEqual(catalog.operations.map((operation) => operation.jxchange), ["AcctInq", "AcctHistSrch", "CustInq"]);
  assert.match(catalog.writes, /read-only/);
});

test("unknown routes return 404", async () => {
  const { identity } = await provision(stack.handler, stack.store, "lending");
  const response = await call(stack.handler, "GET", "/v1/loans/1", identity);
  assert.equal(response.statusCode, 404);
});
