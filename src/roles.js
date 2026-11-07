/** Role-scoped onboarding: an invite code selects the persona server-side, never the client. */
const { timingSafeEqual } = require("node:crypto");

const ROLES = {
  verification: { label: "Account verification", persona: "ACCOUNT_VERIFICATION", codeEnv: "INVITE_VERIFICATION" },
  lending: { label: "Lending partner", persona: "LENDING_PARTNER", codeEnv: "INVITE_LENDING" },
  aggregation: { label: "Data aggregator", persona: "DATA_AGGREGATOR", codeEnv: "INVITE_AGGREGATION" }
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Fails closed unless both the role and its invite code are configured. */
const roleFor = (env, role) => {
  const config = ROLES[role];
  const code = config && env[config.codeEnv];
  return config && code ? { ...config, role, code } : null;
};

module.exports = { ROLES, roleFor, safeEqual };
