const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createMockJxchange } = require("../mock/jxchange");
const { createMemoryStore } = require("../dev/memory-store");
const { createJxchange } = require("../src/jxchange");
const { localEnv, INVITES } = require("../dev/server");
const { CORE } = require("./helpers");

const root = path.resolve(__dirname, "..");

/** Pulls the inline Lambda bundle out of the committed template exactly as CloudFormation sees it. */
function extractInlineCode(template) {
  const marker = "        ZipFile: |\n";
  const start = template.indexOf(marker);
  assert.ok(start > 0, "template must contain an inline ZipFile block");
  const lines = template.slice(start + marker.length).split("\n");
  const code = [];
  for (const line of lines) {
    if (!line.startsWith(" ".repeat(9))) break;
    code.push(line.slice(9));
  }
  return code.join("\n");
}

test("the template's inline Lambda bundle serves the full read flow", async (t) => {
  const code = extractInlineCode(fs.readFileSync(path.join(root, "template.yaml"), "utf8"));
  assert.match(code, /const __defs=\s*\{/, "bundle must inline its modules");
  assert.match(code, /function __require\(id\)/, "bundle must resolve inlined modules");
  assert.ok(!code.includes("__GATEWAY_CODE__"));

  const bundlePath = path.join(os.tmpdir(), `jxchange-bundle-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(bundlePath, code);
  t.after(() => fs.rmSync(bundlePath, { force: true }));

  const { createHandler } = require(bundlePath);
  assert.equal(typeof createHandler, "function");

  const mock = createMockJxchange();
  const { url } = await mock.listen(0);
  t.after(() => mock.close());

  const store = createMemoryStore();
  const handler = createHandler({ store, core: createJxchange({ ...CORE, endpointUrl: url }), env: localEnv() });

  const health = await handler({ httpMethod: "GET", path: "/health" });
  assert.equal(health.statusCode, 200);

  const provisioned = await handler({
    httpMethod: "POST",
    path: "/portal",
    body: JSON.stringify({ tenantName: "Acme Verification", email: "dev@acme.test", role: "verification", code: INVITES.verification })
  });
  assert.equal(provisioned.statusCode, 200, provisioned.body);
  const identity = { apiKeyId: store.keyIdsByValue.get(JSON.parse(provisioned.body).apiKey) };

  const account = await handler({ httpMethod: "GET", path: "/v1/accounts/123456789", queryStringParameters: { type: "D" }, requestContext: { identity } });
  assert.equal(account.statusCode, 200, account.body);
  assert.equal(JSON.parse(account.body).balances.available, 5310.25);

  const denied = await handler({ httpMethod: "GET", path: "/v1/accounts/123456789/transactions", queryStringParameters: { type: "D" }, requestContext: { identity } });
  assert.equal(denied.statusCode, 403);
});
