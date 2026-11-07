/** AWS adapters: DynamoDB tenant map, Secrets Manager config, API Gateway key store. */
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { APIGatewayClient, CreateApiKeyCommand, CreateUsagePlanKeyCommand } = require("@aws-sdk/client-api-gateway");

function createAwsStore(env = process.env) {
  const secrets = new SecretsManagerClient({});
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const apigw = new APIGatewayClient({});
  let cachedSecret = null;

  return {
    async getSecret() {
      if (!cachedSecret) {
        const result = await secrets.send(new GetSecretValueCommand({ SecretId: env.JXCHANGE_SECRET_ARN }));
        cachedSecret = JSON.parse(result.SecretString);
      }
      return cachedSecret;
    },
    async getTenant(apiKeyId) {
      const result = await ddb.send(new GetCommand({ TableName: env.TENANT_TABLE, Key: { apiKeyId } }));
      return result.Item || null;
    },
    async putTenant(tenant) {
      await ddb.send(new PutCommand({ TableName: env.TENANT_TABLE, Item: tenant }));
      return tenant;
    },
    async createApiKey({ tenantName }) {
      const key = await apigw.send(new CreateApiKeyCommand({ name: `${tenantName}-${Date.now()}`.slice(0, 100), enabled: true }));
      if (env.USAGE_PLAN_ID) {
        await apigw.send(new CreateUsagePlanKeyCommand({ usagePlanId: env.USAGE_PLAN_ID, keyId: key.id, keyType: "API_KEY" }));
      }
      return { id: key.id, value: key.value };
    }
  };
}

module.exports = { createAwsStore };
