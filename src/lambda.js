/** Deployed Lambda: builds the app from Secrets Manager config on first invocation. */
const { createApp } = require("./app");
const { createJxchange, decodeSecret } = require("./jxchange");

function createHandler({ store, env = process.env, core, now = () => Date.now() }) {
  let client = core || null;
  const getCore = async () => {
    if (!client) {
      const secret = decodeSecret(await store.getSecret());
      client = createJxchange({ ...secret, coreType: env.CORE_TYPE || secret.coreType, timeoutMs: env.UPSTREAM_TIMEOUT_MS });
    }
    return client;
  };
  const lazyCore = {
    accountInquiry: async (params) => (await getCore()).accountInquiry(params),
    accountHistory: async (params) => (await getCore()).accountHistory(params),
    customerInquiry: async (params) => (await getCore()).customerInquiry(params)
  };
  const app = createApp({ store, core: lazyCore, env, now });
  return async function handler(event = {}, context) {
    return app.handle(event, context);
  };
}

let defaultHandler = null;

exports.handler = async (event, context) => {
  if (!defaultHandler) {
    const { createAwsStore } = require("./aws-store");
    defaultHandler = createHandler({ store: createAwsStore(process.env) });
  }
  return defaultHandler(event, context);
};

exports.createHandler = createHandler;
