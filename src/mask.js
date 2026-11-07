/** Persona schema masking: deny by default, allow only the listed JSON paths. */
const ALLOWLISTS = {
  ACCOUNT_VERIFICATION: [
    "accountId", "accountType", "coreType", "status", "statusDescription", "balances", "currency",
    "customerId", "customerType", "name", "address"
  ],
  LENDING_PARTNER: [
    "accountId", "accountType", "coreType", "status", "statusDescription", "balances", "currency",
    "customerId", "customerType", "name", "address", "transactions"
  ],
  DATA_AGGREGATOR: [
    "accountId", "accountType", "coreType", "status", "statusDescription", "balances", "currency",
    "customerId", "transactions"
  ]
};

const get = (obj, path) => path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), obj);
const set = (obj, path, value) => {
  const keys = path.split(".");
  const leaf = keys.pop();
  const target = keys.reduce((node, key) => (node[key] ??= {}), obj);
  target[leaf] = value;
  return obj;
};

/** Returns the masked payload, or null when the persona has no allowlist (fail closed). */
const mask = (payload, persona) => {
  const allow = ALLOWLISTS[persona];
  if (!allow) return null;
  return allow
    .filter((path) => get(payload, path) != null)
    .reduce((out, path) => set(out, path, get(payload, path)), {});
};

module.exports = { mask, ALLOWLISTS };
