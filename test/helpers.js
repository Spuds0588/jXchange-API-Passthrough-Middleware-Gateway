/** Shared test wiring: fake jXchange + memory store + real handler. */
const { createMockJxchange } = require("../mock/jxchange");
const { createMemoryStore } = require("../dev/memory-store");
const { createJxchange } = require("../src/jxchange");
const { createApp } = require("../src/app");
const { localEnv, INVITES } = require("../dev/server");

const CORE = {
  instRtId: "011001276",
  instEnv: "TEST",
  validConsmName: "LOCAL_DEV",
  validConsmProd: "GATEWAY",
  auditUsrId: "API_GATEWAY",
  auditWsId: "AWS_GATEWAY",
  timeoutMs: 2000
};

async function startStack(overrides = {}) {
  const mock = createMockJxchange();
  const { url } = await mock.listen(0);
  const store = createMemoryStore();
  const env = localEnv(overrides);
  const core = createJxchange({ ...CORE, endpointUrl: url });
  const app = createApp({ store, core, env });
  return { mock, store, app, env, handler: app.handle };
}

/** Provisions a key through the portal and returns the API Gateway-shaped identity. */
async function provision(handler, store, role = "lending") {
  const response = await handler({
    httpMethod: "POST",
    path: "/portal",
    body: JSON.stringify({ tenantName: "Acme", email: "dev@acme.test", role, code: INVITES[role] })
  });
  if (response.statusCode !== 200) throw new Error(`provision failed: ${response.statusCode} ${response.body}`);
  const apiKey = JSON.parse(response.body).apiKey;
  return { apiKey, identity: { apiKeyId: store.keyIdsByValue.get(apiKey) } };
}

const call = (handler, method, path, identity, queryStringParameters) =>
  handler({ httpMethod: method, path, queryStringParameters, requestContext: { identity: identity || {} } });

module.exports = { startStack, provision, call, CORE, INVITES };
