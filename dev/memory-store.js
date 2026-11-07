/** In-memory stand-in for DynamoDB, Secrets Manager and API Gateway keys. Never deploy. */
const { randomUUID } = require("node:crypto");

function createMemoryStore({ secret = null } = {}) {
  const tenants = new Map();
  const keyIdsByValue = new Map();
  return {
    keyIdsByValue,
    tenants,
    async getSecret() {
      return secret || { endpointUrl: "http://127.0.0.1:4010", instRtId: "011001276", instEnv: "TEST" };
    },
    async getTenant(apiKeyId) {
      return tenants.get(apiKeyId) || null;
    },
    async putTenant(tenant) {
      tenants.set(tenant.apiKeyId, tenant);
      return tenant;
    },
    async createApiKey({ tenantName }) {
      const id = `key_${randomUUID()}`;
      const value = `local_${randomUUID()}`;
      keyIdsByValue.set(value, id);
      return { id, value, tenantName };
    }
  };
}

module.exports = { createMemoryStore };
