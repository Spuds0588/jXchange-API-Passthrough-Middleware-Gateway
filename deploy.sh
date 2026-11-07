#!/usr/bin/env bash
# One-line deployment for the Jack Henry jXchange API Passthrough Gateway.
#
# Run inside AWS CloudShell (no local tooling needed) or any shell with an
# authenticated AWS CLI v2:
#
#   bash <(curl -sSL https://raw.githubusercontent.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/main/deploy.sh)
#
# Optional environment overrides:
#   STACK_NAME, AWS_REGION, TEMPLATE_URL, JXCHANGE_ENDPOINT_URL, INST_RT_ID,
#   INST_ENV, CORE_TYPE, VALID_CONSM_NAME, VALID_CONSM_PROD, AUDIT_USR_ID,
#   AUDIT_WS_ID, CLIENT_CERT_FILE, CLIENT_KEY_FILE, INVITE_VERIFICATION,
#   INVITE_LENDING, INVITE_AGGREGATION

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STACK_NAME="${STACK_NAME:-JXchange-Gateway}"
TEMPLATE_URL="${TEMPLATE_URL:-https://raw.githubusercontent.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway/main/template.yaml}"

say() { printf '%b\n' "$1"; }

say "${BLUE}====================================================${NC}"
say "${BLUE}   Jack Henry jXchange API Gateway Setup            ${NC}"
say "${BLUE}====================================================${NC}"

command -v aws >/dev/null 2>&1 || { say "${RED}[ERROR] AWS CLI not found. Run this in AWS CloudShell.${NC}"; exit 1; }
command -v curl >/dev/null 2>&1 || { say "${RED}[ERROR] curl not found.${NC}"; exit 1; }
command -v openssl >/dev/null 2>&1 || { say "${RED}[ERROR] openssl not found; set invite codes manually.${NC}"; exit 1; }

say "\n${YELLOW}[1/5] Verifying AWS credentials...${NC}"
CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text 2>/dev/null || true)"
if [ -z "$CALLER_ARN" ]; then
  say "${RED}[ERROR] No active AWS session. Open AWS CloudShell or configure the CLI.${NC}"
  exit 1
fi
say "${GREEN}Deploying as ${CALLER_ARN}${NC}"

say "\n${YELLOW}[2/5] jXchange core configuration...${NC}"
JXCHANGE_ENDPOINT_URL="${JXCHANGE_ENDPOINT_URL:-}"
INST_RT_ID="${INST_RT_ID:-}"
INST_ENV="${INST_ENV:-}"
CORE_TYPE="${CORE_TYPE:-SILVERLAKE}"
VALID_CONSM_NAME="${VALID_CONSM_NAME:-}"
VALID_CONSM_PROD="${VALID_CONSM_PROD:-}"
AUDIT_USR_ID="${AUDIT_USR_ID:-API_GATEWAY}"
AUDIT_WS_ID="${AUDIT_WS_ID:-AWS_GATEWAY}"

[ -n "$JXCHANGE_ENDPOINT_URL" ] || read -rp "jXchange ServiceGateway URL: " JXCHANGE_ENDPOINT_URL
[ -n "$INST_RT_ID" ] || read -rp "Institution routing ID (InstRtId, 9 digits): " INST_RT_ID
[ -n "$INST_ENV" ] || read -rp "InstEnv [TEST/PROD] (default PROD): " INST_ENV
INST_ENV="${INST_ENV:-PROD}"

if [ "$CORE_TYPE" != "SILVERLAKE" ] && [ "$CORE_TYPE" != "SYMPITAR" ]; then
  say "${RED}[ERROR] CORE_TYPE must be SILVERLAKE or SYMPITAR.${NC}"
  exit 1
fi

[ -n "$VALID_CONSM_NAME" ] || read -rp "ValidConsmName (bank-licensed consumer): " VALID_CONSM_NAME
[ -n "$VALID_CONSM_PROD" ] || read -rp "ValidConsmProd (bank-licensed product): " VALID_CONSM_PROD

if [ -z "$JXCHANGE_ENDPOINT_URL" ] || [ -z "$INST_RT_ID" ] || [ -z "$VALID_CONSM_NAME" ] || [ -z "$VALID_CONSM_PROD" ]; then
  say "${RED}[ERROR] Endpoint URL, InstRtId, ValidConsmName, and ValidConsmProd are required.${NC}"
  exit 1
fi
if ! [[ "$INST_RT_ID" =~ ^[0-9]{9}$ ]]; then
  say "${RED}[ERROR] InstRtId must be exactly 9 digits.${NC}"
  exit 1
fi

# mTLS material is optional: some institutions rely on IP allowlisting instead.
CLIENT_CERT_FILE="${CLIENT_CERT_FILE:-}"
CLIENT_KEY_FILE="${CLIENT_KEY_FILE:-}"
CLIENT_CERT_BASE64=""
CLIENT_KEY_BASE64=""
if [ -n "$CLIENT_CERT_FILE" ] || [ -n "$CLIENT_KEY_FILE" ]; then
  if [ -z "$CLIENT_CERT_FILE" ] || [ -z "$CLIENT_KEY_FILE" ]; then
    say "${RED}[ERROR] Set both CLIENT_CERT_FILE and CLIENT_KEY_FILE, or neither.${NC}"
    exit 1
  fi
  CLIENT_CERT_BASE64="$(openssl base64 -A -in "$CLIENT_CERT_FILE")"
  CLIENT_KEY_BASE64="$(openssl base64 -A -in "$CLIENT_KEY_FILE")"
fi

# Role-scoped invite codes: one link cannot mint a key for another persona.
INVITE_VERIFICATION="${INVITE_VERIFICATION:-$(openssl rand -hex 24)}"
INVITE_LENDING="${INVITE_LENDING:-$(openssl rand -hex 24)}"
INVITE_AGGREGATION="${INVITE_AGGREGATION:-$(openssl rand -hex 24)}"

say "\n${YELLOW}[3/5] Fetching latest template...${NC}"
TMP_TEMPLATE="$(mktemp "${TMPDIR:-/tmp}/jxchange-gateway-XXXXXX.yaml")"
trap 'rm -f "$TMP_TEMPLATE"' EXIT

if ! curl -fsSL "$TEMPLATE_URL" -o "$TMP_TEMPLATE"; then
  say "${RED}[ERROR] Could not download ${TEMPLATE_URL}${NC}"
  exit 1
fi

TEMPLATE_BYTES="$(wc -c < "$TMP_TEMPLATE" | tr -d ' ')"
if [ "$TEMPLATE_BYTES" -gt 51200 ]; then
  say "${RED}[ERROR] Template is ${TEMPLATE_BYTES} bytes; CloudFormation's direct upload limit is 51200.${NC}"
  exit 1
fi
say "${GREEN}Template OK (${TEMPLATE_BYTES} bytes)${NC}"

say "\n${YELLOW}[4/5] Deploying stack ${STACK_NAME}...${NC}"
say "${BLUE}This provisions VPC + NAT + static EIP, API Gateway, Lambda, DynamoDB, and Secrets Manager.${NC}"
say "${BLUE}NAT gateway provisioning usually takes 2-3 minutes. This gateway is read-only.${NC}"

REGION_ARGS=()
if [ -n "${AWS_REGION:-}" ]; then
  REGION_ARGS=(--region "$AWS_REGION")
fi

aws cloudformation deploy \
  "${REGION_ARGS[@]}" \
  --template-file "$TMP_TEMPLATE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    JxchangeEndpointUrl="$JXCHANGE_ENDPOINT_URL" \
    InstRtId="$INST_RT_ID" \
    InstEnv="$INST_ENV" \
    CoreType="$CORE_TYPE" \
    ValidConsmName="$VALID_CONSM_NAME" \
    ValidConsmProd="$VALID_CONSM_PROD" \
    AuditUsrId="$AUDIT_USR_ID" \
    AuditWsId="$AUDIT_WS_ID" \
    ClientCertBase64="$CLIENT_CERT_BASE64" \
    ClientKeyBase64="$CLIENT_KEY_BASE64" \
    InviteVerification="$INVITE_VERIFICATION" \
    InviteLending="$INVITE_LENDING" \
    InviteAggregation="$INVITE_AGGREGATION"

say "\n${YELLOW}[5/5] Reading outputs...${NC}"
aws cloudformation describe-stacks "${REGION_ARGS[@]}" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" \
  --output table

output() {
  aws cloudformation describe-stacks "${REGION_ARGS[@]}" --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

PORTAL_URL="$(output AdminPortalUrl)"
EGRESS_IP="$(output StaticEgressIp)"

say "\n${GREEN}====================================================${NC}"
say "${GREEN}             DEPLOYMENT SUCCESSFUL                  ${NC}"
say "${GREEN}====================================================${NC}"
say "\n${YELLOW}Portal:${NC}              ${GREEN}${PORTAL_URL}${NC}"
say "${YELLOW}Verification invite:${NC} ${GREEN}${PORTAL_URL}?role=verification&code=${INVITE_VERIFICATION}${NC}"
say "${YELLOW}Lending invite:${NC}      ${GREEN}${PORTAL_URL}?role=lending&code=${INVITE_LENDING}${NC}"
say "${YELLOW}Aggregation invite:${NC}  ${GREEN}${PORTAL_URL}?role=aggregation&code=${INVITE_AGGREGATION}${NC}"
say ""
say "${RED}ACTION REQUIRED: ask Jack Henry (or the institution's jXchange admin) to whitelist static egress IP ${EGRESS_IP}.${NC}"
say "${RED}Invite links are bearer secrets. Share each role's link only with that role's partners, and reuse the same codes on stack updates.${NC}"
