/** Local stack: fake jXchange + memory store + the real handler. */
const { createMockJxchange } = require("../mock/jxchange");
const { createMemoryStore } = require("./memory-store");
const { createJxchange } = require("../src/jxchange");
const { createApp } = require("../src/app");
const { createServer } = require("../src/server");

const PORT = Number(process.env.PORT) || 3000;
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT) || 4010;
const INVITES = {
  verification: "local-verification-invite-0123456789",
  lending: "local-lending-invite-0123456789",
  aggregation: "local-aggregation-invite-0123456789"
};

const localEnv = (overrides = {}) => ({
  INVITE_VERIFICATION: INVITES.verification,
  INVITE_LENDING: INVITES.lending,
  INVITE_AGGREGATION: INVITES.aggregation,
  CORE_TYPE: "SILVERLAKE",
  DEFAULT_ACCT_TYPE: "D",
  ...overrides
});

async function main() {
  const mock = createMockJxchange();
  const { url } = await mock.listen(UPSTREAM_PORT);
  const store = createMemoryStore();
  const core = createJxchange({
    endpointUrl: url,
    instRtId: "011001276",
    instEnv: "TEST",
    validConsmName: "LOCAL_DEV",
    validConsmProd: "GATEWAY",
    auditUsrId: "API_GATEWAY",
    auditWsId: "AWS_GATEWAY",
    timeoutMs: 5000
  });
  const app = createApp({ store, core, env: localEnv() });
  const server = createServer({ handle: app.handle, resolveApiKey: (key) => store.keyIdsByValue.get(key) });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Gateway:     http://127.0.0.1:${PORT}`);
    console.log(`Portal:      http://127.0.0.1:${PORT}/portal?role=lending&code=${INVITES.lending}`);
    console.log(`Verification:http://127.0.0.1:${PORT}/portal?role=verification&code=${INVITES.verification}`);
    console.log(`Aggregation: http://127.0.0.1:${PORT}/portal?role=aggregation&code=${INVITES.aggregation}`);
    console.log(`Fake core:   ${url} (accounts 123456789, 0002235555550015, 987654321, 000000000; customer CUST-443322)`);
  });

  const shutdown = () => {
    server.close();
    mock.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) main();

module.exports = { localEnv, INVITES, PORT, UPSTREAM_PORT };
