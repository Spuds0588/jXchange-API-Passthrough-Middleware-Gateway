# Branch of Encompass API Middle | Google AI Studio

> Exported from https://aistudio.google.com/prompts/1N4_Ag0nKjQtuX456TTw56gbcUAWWZ64A on 2026-11-06 20:17 · AI Studio · 10 messages

## Assistant

Here is the mental model.

Think of **Encompass** like a high-security, fragile bank vault built in the 1990s:

**Your gateway is the high-tech, bulletproof reception lobby you built right outside the vault.** Vendors never step foot in the vault; they only talk to the reception desk.

Here are the 5 moving parts that make this work:

---

### 1. The Reception Desk & Guest Badges (API Gateway + Admin Portal)

### 2. The Disguise Closet (OAuth Token Impersonation + DynamoDB Cache)

### 3. The Express Lane: Reading Data (Synchronous GET)

### 4. The Shock Absorber: Writing Data (Asynchronous SQS FIFO Queue)

### 5. The "No-Server" Deployment (GitHub Pages + CloudShell)

---

### The TL;DR Summary

```
[Vendor]
   │
   ├── (GET Read) ──► Fast Passthrough ──► Grabs 3 fields ──────► Instant Response (150ms)
   │
   └── (PATCH Write) ─► SQS FIFO Queue ──► Retries on Locks ────► Returns 202 "We got it"
                            │
                      (Only 10 at a time)
                            ▼
                   [ Encompass Instance ] (Completely protected, never overwhelmed)
```

---

## Assistant

**Considering Integration Approaches**

I'm currently focused on how best to structure the information for external vendors. I'm exploring offering a key that links field IDs to names and explanations, as per the user's initial prompt. This aims to streamline integration by providing clear context around those numeric identifiers, and other methods of data identification, to the vendors. I'm thinking about the various ways to offer this key, and what level of detail it should have.

**Analyzing Field Identifiers**

I'm now diving into the specifics of Encompass field IDs. The numerical IDs are cryptic, so I'm thinking a dictionary or mapping endpoint might be essential. It could be a simple GET /v1/fields or friendly aliases. I'm also considering documentation on GitHub Pages. Logging is another key consideration. It seems Encompass's audit log can handle the vendor impersonation, which is good. CloudWatch already logs HTTP requests, so audit trails seem well covered.

**Clarifying Key Storage**

I've clarified the key storage mechanism. It's serverless, using AWS API Gateway's native key store and DynamoDB. There's no traditional server running. The API keys live in the managed AWS key store, with metadata linking API key IDs to Encompass user IDs stored in a DynamoDB table.

**Describing Request Flow**

I'm now detailing the precise API request handling. The process starts with API Gateway's rapid key verification. Then, Lambda fetches the api_title_vendor from DynamoDB using the API key ID. I've also readdressed logging: Encompass records audit events from the impersonated user. Alongside this, CloudWatch monitors everything, from API Gateway's perspective, providing complete technical logging.

---

## Assistant

Here are direct answers to all three questions: where the keys live, how logging actually works, and how vendors know what those cryptic Encompass field numbers mean.

---

### 1. "Where are we storing the middleware keys? Is there a server?"

**There is no server.** You are not paying for or managing an EC2 instance, Docker container, or Linux box running 24/7.

The keys live inside two managed, serverless AWS services:

---

### 2. "Do we need logging, or does that happen in Encompass?"

**Both, but for completely different reasons.** You get two distinct audit trails automatically:

#### A. The Legal & Compliance Log (Inside Encompass)

Because we use **Token Impersonation**, Encompass treats the request as if a human logged in under that user account.

#### B. The Technical Diagnostic Log (Inside AWS CloudWatch)

Every time a vendor makes a call, your Lambda handlers output structured JSON into AWS CloudWatch (AWS's built-in log viewer):

If a vendor says "Your API is broken," the lender IT admin opens CloudWatch, filters by tenantName: "First American Title", and immediately sees if Encompass rejected the payload or if the vendor passed bad data.

---

### 3. "Do we need to offer field IDs with names/explanations?"

**Yes, because native Encompass field IDs are complete gibberish to an external developer.**

To a vendor:

#### The Trap to Avoid:

Do **not** try to build a custom translator in the gateway that maps every Encompass field to friendly names (e.g., writing code that translates loanAmount ↔ 1109). Encompass has **over 15,000 fields**, plus unlimited custom fields (CX.*). If you hardcode a dictionary in the middleware, you will spend your entire life updating field mappings whenever a lender changes a custom field.

#### The Lean Solution (YAGNI):

We solve this in two simple ways:

This keeps the gateway code tiny, relies on Encompass as the source of truth, and gives external developers the exact documentation they need to build their payloads.

---

## Assistant

**Clarifying Question Scope**

I'm currently focused on dissecting the initial question, specifically the ambiguity around "admin." My goal is to determine if the reference pertains to the vendor/broker admin or the lender's Encompass admin, or both. This clarity is paramount for establishing a correct framework for subsequent considerations.

**Addressing Security Concerns**

I'm now grappling with the security implications. My previous model included the lender admin generating an API key. Now, it seems I need a method where vendors can't simply create keys mapped to high-level Encompass access without proper authorization. I'm exploring invite links or one-time registration tokens generated by the lender, which seems much more secure than unauthenticated key creation.

**Refining Registration Options**

I'm now comparing self-registration models. While self-registration with a default persona initially seems appealing, domain-based matching presents authorization challenges. The two-step approval flow, where an admin approves access, feels more robust. But wait...the original PRD! It seems the project's intent was always a 2-step setup where the admin has to be involved. Can we rethink that?

**Exploring Setup Flexibility**

I'm now focusing on streamlining the initial setup after the Encompass installation. I'm considering standard role templates that can be configured once, such as "Title Vendor," "Mortgage Broker," and "Appraisal AMC," each mapping to specific Encompass users. My current concern revolves around securely providing access to these roles. I'm exploring shareable vendor invite links or onboarding secrets, and evaluating if self-registration with a "Partner Code" or "Lender Onboarding Key" is feasible. The goal is to minimize Encompass admin involvement after the initial setup. I also need to evaluate if Encompass has documentation for those key-value pairs.

**Clarifying Key Generation**

I'm now zeroing in on the specifics of key generation. I need to pinpoint exactly who's creating the keys – is it the vendor, the broker, or the lender's Encompass admin? Understanding this is crucial to isolating and removing the problematic party from the process. This dissection has become the focal point of my mental exercise.

**Isolating the Key Origin**

I've made a breakthrough. It seems the Encompass admin is entirely out of the day-to-day key setup. That shifts the focus: how do we prevent unauthorized key generation? If an unauthenticated vendor could just get a key, how do we block an anonymous hacker or, for example, a rival title vendor, from using the system to impersonate a broker? The plan is for the Encompass admin to predefine three persona templates: title, broker, and AMC. Now, how does the system enable vendors to self-onboard without needing an admin? This brings me to considering the "single reusable onboarding secret" approach.

**Exploring Self-Onboarding Options**

I'm now contemplating streamlined vendor onboarding. The automated webhook approach seems promising: trigger key generation directly from the lender's system when a vendor is marked as active. This reduces admin involvement drastically. However, the question of whether Encompass provides a public source of key-value pairs remains unanswered. I am curious if Encompass has a public page with the key-value pairs documented. It is unclear if that is documented and accessible, given that documentation is massive and partially gated.

---

## Assistant

### 1. Who Generates the Key? (How to Actually Get the Encompass Admin Out of the Loop)

You caught a major workflow detail. If an unauthenticated vendor walks up to a public /portal link, types "I'm Acme Title", and selects api_title_vendor, you have a security problem: anyone who discovers that URL could generate an active API key into the lender's Encompass system.

However, **we can get the Encompass Admin completely out of the day-to-day onboarding loop** with a **1-Time Template + Role-Based Invite Link** model:

```
[Encompass Admin]
       │
   (Does this ONCE at deployment, then leaves forever)
       ▼
Sets up 3 Generic Service Accounts in Encompass:
  ├── api_title_template      (Persona: Title / Settlement only)
  ├── api_broker_template     (Persona: TPO External Originator)
  └── api_appraisal_template  (Persona: AMC / Appraisal only)
```

#### How the Vendor Self-Serves (Zero Admin Intervention):

**Result:** The Encompass Admin never logs in. The vendor's dev team gets their own credentials in 30 seconds.

---

### 2. "Does Encompass have a public page with those field IDs?"

The short answer: **Not in a format your vendors can easily use.**

Here is the unvarnished truth about ICE Mortgage Technology's documentation and how we solve it:

#### The Problem with ICE's Public Docs:

#### How We Solve It (Zero Manual Documenting for You):

Instead of you or the admin manually building a dictionary, we handle this in two automated ways:

#### A. A 1-Page "Top 40 Fields" Cheat Sheet on Your GitHub Pages Site

On your GitHub Pages repo, we publish a clean, copy-paste table of the **universal standard fields** that title and broker partners actually care about:

(This covers 90% of basic third-party integrations right out of the box).

#### B. The Dynamic Schema Passthrough Route: GET /v1/fields

For everything else—including the lender's custom CX.* fields—we point the gateway at Encompass’s native **Field Schema API** (/encompass/v3/schemas/loan/fields)[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQFkAO_mULowWyQK8aPc10Ujgmo9nFvQ992w2h5f0iS7Wo0c5WAh7_TrzpPb579HQuLw5XJLNqpABIB3DIU5yeQpYrMk2CPRwSVwh7xOkCPgHRFpTt5qbhEiN2CJBvN8cIgpKLvQobr2ViC86ZN4ceyGeXtE2ekjubtr4c-_psAUFLd79ektaLOwE0nDy-8Gmqy-xFvVaQ0zhDRHdyis)].

If a vendor wants to know what a field does, they hit your gateway:

```
GET /v1/fields?ids=11,646,CX.TITLE.STATUS
```

The gateway queries Encompass on the fly and returns:

```
{
  "11": { "description": "Subject Property Address", "type": "STRING" },
  "646": { "description": "Title - Lender Title Insurance", "type": "DECIMAL" },
  "CX.TITLE.STATUS": { "description": "Custom Title Milestone Status", "type": "STRING" }
}
```

No spreadsheets to maintain, no asking the Encompass admin to write documentation, and external developers get exact field definitions directly from the source of truth.

---

## Assistant

**Exploring Potential Integrations**

I'm currently focused on expanding the API gateway's applicability beyond the Encompass system. My thoughts are revolving around identifying other loan origination systems ripe for integration, particularly those known for causing significant headaches for lenders. Calyx Point is top-of-mind, but I'm also digging into the market for other potential targets that would benefit from streamlined API access.

**Considering API Key Implementation**

I'm now contemplating how to empower users directly. The goal is enabling loan origination system integration quickly, and I'm examining if user-managed API keys could accelerate that. Specifically, I'm thinking about the Calyx Point integration challenges. It's a Windows-based system that can't be readily integrated through a modern API gateway. My focus is on determining what integration methods would be useful, since Calyx Point is a desktop, legacy application.

**Analyzing Legacy LOS Systems**

I'm now diving deeper into the specific challenges of legacy Loan Origination Systems. The idea of implementing a Windows agent for systems lacking modern APIs, like Calyx Point, feels like a maintenance nightmare. I'm prioritizing identifying other systems with similar "pain in the ass" qualities: high market share, awful APIs, and a desperate need for integration with other vendors. My classification system starts with categorizing the mortgage ecosystem. Black Knight/ICE Empower is a target because its legacy nature creates integration headaches.

**Prioritizing Integration Targets**

I'm now zeroing in on specific LOS targets, expanding beyond origination. MeridianLink and OpenClose stand out due to their legacy interfaces and certification challenges. I'm also starting to look at servicing platforms. MSP's IBM Mainframe-based architecture presents a particularly intriguing challenge and potential opportunity for modernization. The focus now is on how to integrate the existing APIs or build new ones atop the servicing platform.

**Categorizing Ecosystem Elements**

I'm now expanding my target list and categorizing key players in the mortgage ecosystem. My analysis includes FICS, a significant player among mid-sized institutions and regional banks, notorious for its Windows-based, on-prem SQL Server. I'm also including Sagent (formerly Fiserv LoanServ), a heavy servicing platform with integration challenges. The focus now is on documenting and understanding the pain points for each.

**Refining Target Criteria**

I'm now assessing potential targets against a refined set of criteria. The Encompass model's success hinges on a cloud-accessible, though flawed, API, high third-party demand, and the value of a serverless wrapper. Calyx Point is off the table due to its desktop nature, and the focus is now on MeridianLink and its legacy APIs, vendor certification friction, and cost barriers. FIS is now on the radar.

**Evaluating Integration Needs**

I'm now focusing on specific pain points and potential solutions. Jack Henry's JXchange, a SOAP/XML relic, is a prime target for modernizing into a JSON REST API with self-serve keys. Servicing platforms like FICS and Sagent, with their reliance on batch jobs, are also high on the list. OpenClose and BytePro are of interest too, given their clunky REST APIs. Calyx Point is officially off the table. I'm prioritizing these candidates based on integration complexity and market impact.

---

## Assistant

**Analyzing the Gateway Scenario**

I'm now zeroing in on the specific Jack Henry context, with my focus laser-guided by the user's explicit references to JXchange, Banno, Core Director, Silverlake, and Symitar. This requires a targeted understanding of the gateway concept's implementation within their ecosystem. I am working through the variables the user expects me to be familiar with.

**Reviewing the Ecosystem Scope**

I'm now clarifying the roles within this project: my expertise as a software developer, and the Product Manager's collaborative role, is defined. I'm focusing on the YAGNI principle. I'm prioritizing concise, practical solutions, and I'm ensuring robust logging. I have a clearer picture of Jack Henry's core banking position, encompassing Silverlake, CIF 20/20, Core Director, and Symitar. I am now exploring the integration interfaces.

**Defining Jack Henry Gateways**

I'm now diving deep into the technical challenges of a Jack Henry gateway. The shift from Encompass's REST API to JXchange's SOAP/XML is a huge hurdle, involving XML envelope generation, parsing, and error translation. I'm focusing on the transport protocol differences, network architecture (IP whitelisting, VPNs), and how these impact integration. The JXchange SOAP/XML environment presents a significant contrast to REST/JSON.

**Addressing Connectivity Hurdles**

I'm now grappling with the infrastructure demands imposed by Jack Henry's gateway requirements. The potential for on-premise or private cloud hosting for Silverlake and Symitar complicates matters. mTLS and strict IP whitelisting, especially the VPN or AWS Direct Connect options, are significant factors to consider. This has substantial implications, particularly given the dynamic IP nature of Lambda functions. The need for a VPC with a NAT Gateway and an EIP to handle static IP whitelisting will increase the costs.

**Investigating Security Protocols**

I'm now zeroing in on Jack Henry's security measures. Specifically, I'm analyzing the need for WS-Security UsernameToken, digital signatures, or X.509 cert signing. I've discovered Jack Henry's Vendor Integration Program (VIP), which requires authorized consumer credentials. Further, I'm auditing for financial regulations such as GLBA. I'm focusing on the impact on DDA, real-time money movement, and audit trails.

**Prioritizing Operational Scope**

I'm now prioritizing the scope, especially focusing on idempotent money movements, which involve more liability and regulatory scrutiny. Read-only operations seem easier to handle, but the real-time money movement requires rigorous audit trails, which is crucial. I'm focusing on the network topology implications, especially the NAT Gateway cost, to maintain the lightweight serverless model. Understanding the differences between Silverlake and Symitar is also critical.

---

## Assistant

Jack Henry (JH) is a much larger market than Encompass, but the plumbing is substantially uglier. With Encompass, we were dealing with a modern REST API that just had bad rate limits and file locks.

With Jack Henry’s **jXchange**, you are stepping into enterprise banking infrastructure built in the mid-2000s.

Before we write a single line of CloudFormation for a Jack Henry gateway, here are the **5 architectural and business decisions** we have to resolve:

---

### 1. The Networking Trap: Static IPs and the "$35/Month Problem"

---

### 2. Jack Henry’s Vendor Integration Program (VIP) Gatekeeping

---

### 3. The Core Divide: Silverlake vs. Symitar (Banks vs. Credit Unions)

Jack Henry is not one system. It is several completely different core banking engines hidden behind the jXchange SOAP layer:

---

### 4. The SOAP/XML Translation Engine

Unlike Encompass (JSON in, JSON out), jXchange is **100% SOAP 1.1 / 1.2 with heavy XML envelopes**.

A request to look up an account balance (AcctInq) looks like this in jXchange:

```
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:jx="http://jackhenry.com/jxchange/TPG/2008">
  <soapenv:Header>
    <jx:Hdr>
      <jx:ValidConsmName>BANK_PARTNER_APP</jx:ValidConsmName>
      <jx:ValidConsmProd>GATEWAY</jx:ValidConsmProd>
      <jx:AuditUsrId>API_USER</jx:AuditUsrId>
    </jx:Hdr>
  </soapenv:Header>
  <soapenv:Body>
    <jx:AcctInq>
      <jx:AccountId>
        <jx:AcctId>123456789</jx:AcctId>
        <jx:AcctType>DDA</jx:AcctType>
      </jx:AccountId>
    </jx:AcctInq>
  </soapenv:Body>
</soapenv:Envelope>
```

---

### 5. Read-Only MVP vs. Money Movement Liability

With Encompass, writing data meant updating a title fee. With Jack Henry, writing data means **moving real money** or updating bank records.

---

### Suggested Action Plan

If you want to pull the trigger on a Jack Henry gateway:

Which target customer do you want to hit first: **Community Banks (Silverlake)** or **Credit Unions (Symitar)**?

---

## Assistant

**Analyzing Project Code**

I've begun examining the provided GitHub repositories, specifically focusing on MeridianLink-Mortgage-API-Passthrough-Middleware-Gateway. I'm starting to get a grasp on its architecture and functionality. Next, I plan to delve into the second repo to compare and contrast the different approaches.

**Confirming Design Choices**

I've just solidified the project approach, aligning it with the MeridianLink and BytePro models. The 'Option A' path is chosen, allowing bank-hosted credentials and avoiding external fees. We're targeting Silverlake and Symitar. The read-only inquiry MVP, Node.js XML handling, VPC setup, self-serve API keys, and CloudFormation deployment are all confirmed.

**Revisiting Previous Architectures**

I've reviewed the user's prior repositories, confirming the established architectural pattern. It's a solid, repeatable blueprint including CloudFormation deployment, serverless components, and structured logging. The design aligns perfectly, and I'm ready to move forward. The next logical step is to create the Master Dev Document.

**Defining Jack Henry Gateway**

I'm now fully focused on the Jack Henry (jXchange) API passthrough and middleware gateway, specifically for Silverlake and Symitar. It seems I have a green light to move forward. The next step is outlining the Master Dev Document. For the Jack Henry gateway, the core type is now a parameter and I've focused on identity and config variables like ValidConsmName and ValidConsmProd and now plan to use mTLS client certs.

**Constructing Network Layout**

I'm currently working on the network topology. I'm setting up a VPC with public and private subnets, including a NAT Gateway and Elastic IP. This will ensure that all outbound requests have a static IP for Jack Henry's firewall. Also, I am focusing on creating normalized endpoints for seamless integration, irrespective of the core system.

---

## Assistant

This aligns directly with the blueprint established in your MeridianLink and BytePro gateways.

Jack Henry's **jXchange** is the universal SOAP integration layer that sits in front of both **Silverlake (Commercial/Community Banks)** and **Symitar/Episys (Credit Unions)**. By having the institution supply their own existing ValidConsmName / ValidConsmProd credentials and mTLS certificates via AWS Secrets Manager (Option A), we sidestep Jack Henry's gatekeeping entirely.

Here is the complete **Master Dev Document** tailored specifically for the Jack Henry jXchange Gateway, ready to drop into your repo.

---

# Master Dev Document: Jack Henry (jXchange) API Passthrough & Middleware Gateway

---

## Part 1: Product Requirements Document (PRD)

### 1. Executive Summary

Community banks and credit unions running on Jack Henry cores (Silverlake and Symitar) face massive roadblocks when partnering with modern fintechs, loan originators, and verification vendors. Integrating with Jack Henry’s native integration bus (**jXchange**) requires navigating 20-year-old SOAP 1.1/1.2 XML schemas, WS-Security headers, Mutual TLS (mTLS) certificates, and static IP whitelisting.

This product is a **zero-vendor-footprint, serverless middleware gateway** deployed directly into the financial institution's AWS account via a 1-line script. It acts as a bidirectional translation and proxy layer: external partners send modern JSON REST requests with an x-api-key, and the gateway translates them into valid jXchange SOAP XML envelopes, attaches bank-licensed consumer credentials and client certificates, queries the core, parses response faults, and returns normalized JSON.

---

### 2. Architecture Principles & Scope Boundaries

---

### 3. Target Audience

---

### 4. System Requirements

---

### 5. API Specification (Vendor-Facing)

#### 1. Account Inquiry

```
{
  "accountId": "123456789",
  "accountType": "Checking",
  "coreType": "Silverlake",
  "status": "Active",
  "balances": {
    "current": 5420.50,
    "available": 5310.25
  },
  "currency": "USD"
}
```

#### 2. Account History / Transactions

```
{
  "accountId": "123456789",
  "transactions": [
    {
      "transactionId": "TX-998811",
      "postDate": "2026-10-28",
      "amount": -45.20,
      "description": "ACH DEBIT UTILITY CO",
      "type": "Debit"
    }
  ]
}
```

#### 3. Customer / Member Inquiry

```
{
  "customerId": "CUST-443322",
  "customerType": "Individual",
  "name": {
    "first": "Jane",
    "last": "Doe"
  },
  "address": {
    "street": "456 Oak Ave",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  }
}
```

---

## Part 2: Implementation Guide & Architecture

### 1. System Architecture Diagram

```
[EXTERNAL PARTNERS]
                                       │
                                ( x-api-key )
                                       ▼
                         [ AMAZON API GATEWAY REST API ]
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
   GET /portal (SSR Admin)                               GET /v1/accounts/{id}
   POST /portal (Provision)                              GET /v1/customers/{id}
            │                                                     │
            ▼                                                     ▼
   ┌─────────────────┐                                   ┌─────────────────┐
   │  Admin Portal   │                                   │ jXchange Proxy  │
   │  Lambda Handler │                                   │ Lambda Handler  │
   └────────┬────────┘                                   └────────┬────────┘
            │                                                     │
     [DynamoDB: Tenants]                                          ▼
                                                     [ AWS VPC (Private Subnet) ]
                                                                  │
                                                        ┌─────────┴─────────┐
                                                        ▼                   ▼
                                                 [NAT Gateway]       [Secrets Manager]
                                                  (Static EIP)       (mTLS Certs & WSS)
                                                        │
                                                        ▼
                                           (mTLS Encrypted HTTPS)
                                                        │
                                                        ▼
                                           [JACK HENRY jXchange BUS]
                                           (Silverlake or Symitar Core)
```

---

### 2. AWS Component Configuration

#### A. Networking (VPC & Egress)

#### B. Secrets Manager (JackHenryMasterSecret)

Stores bank-provided core credentials:

```
{
  "endpointUrl": "https://jxchange.bankdomain.com/jxchange/2008/ServiceGateway/ServiceGateway.svc",
  "coreType": "SILVERLAKE",
  "validConsmName": "BankName_PartnerApp",
  "validConsmProd": "Gateway_v1",
  "auditUsrId": "API_GATEWAY",
  "clientCertPem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "clientKeyPem": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
}
```

---

## Part 3: Developer Task List

### Phase 1: Infrastructure & VPC Egress Setup

### Phase 2: Secrets & mTLS Engine

### Phase 3: SOAP Envelope Builder & XML Parser

### Phase 4: Inquiry Route Handlers

### Phase 5: Self-Serve Admin Portal & Packaging

---

## Part 4: AGENTS.md (AI Agent & Developer Operating Manual)

### 1. Operating Rules

### 2. Standardized Logging Schema

```
const log = (level, action, details = {}) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, action, ...details }));
};
```

Mandatory Log Events: JXCHANGE_EGRESS_INIT, SOAP_REQUEST_DISPATCHED, SOAP_RESPONSE_RECEIVED, SOAP_FAULT_INTERCEPTED, MTLS_HANDSHAKE_ERROR.

---

### 3. Canonical Implementation: jXchange Proxy Handler (jxchange_proxy.js)

Below is the complete reference implementation demonstrating mTLS connection pooling, SOAP envelope construction, and XML response normalization.

```
/**
 * File: jxchange_proxy.js
 * Description: Core proxy translating JSON REST into Jack Henry jXchange SOAP with mTLS.
 * Runtime: Node.js 20.x (Zero external dependencies).
 */

const https = require("https");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const secretsManager = new SecretsManagerClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SECRET_ARN = process.env.JACK_HENRY_SECRET_ARN;
const TENANT_TABLE = process.env.TENANT_TABLE;

const log = (level, action, details = {}) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, action, ...details }));
};

let cachedConfig = null;
let cachedHttpsAgent = null;

// Initialize credentials and mTLS HTTPS Agent once per Lambda container
async function getConfigAndAgent() {
  if (cachedConfig && cachedHttpsAgent) {
    return { config: cachedConfig, agent: cachedHttpsAgent };
  }

  log("INFO", "INITIALIZING_MTLS_AGENT");
  const secretRes = await secretsManager.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  cachedConfig = JSON.parse(secretRes.SecretString);

  cachedHttpsAgent = new https.Agent({
    cert: cachedConfig.clientCertPem,
    key: cachedConfig.clientKeyPem,
    rejectUnauthorized: true,
    keepAlive: true,
    timeout: 15000
  });

  return { config: cachedConfig, agent: cachedHttpsAgent };
}

// Lightweight XML node value extractor (zero-dependency)
function extractXmlNode(xml, nodeName) {
  const match = xml.match(new RegExp(`<[^:]*:?${nodeName}[^>]*>([\\s\\S]*?)<\\/[^:]*:?${nodeName}>`, "i"));
  return match ? match[1].trim() : null;
}

// Build clean SOAP 1.1 Envelope with jXchange Header
function buildSoapEnvelope(config, bodyContent) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:jx="http://jackhenry.com/jxchange/TPG/2008">
  <soapenv:Header>
    <jx:Hdr>
      <jx:ValidConsmName>${config.validConsmName}</jx:ValidConsmName>
      <jx:ValidConsmProd>${config.validConsmProd}</jx:ValidConsmProd>
      <jx:AuditUsrId>${config.auditUsrId}</jx:AuditUsrId>
      <jx:AuditWsId>AWS_GATEWAY</jx:AuditWsId>
      <jx:Ver_1/>
    </jx:Hdr>
  </soapenv:Header>
  <soapenv:Body>
    ${bodyContent}
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Execute outbound mTLS HTTPS Request to Jack Henry
function postToJxchange(endpointUrl, agent, soapAction, soapBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpointUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      agent,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `"${soapAction}"`,
        "Content-Length": Buffer.byteLength(soapBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on("error", (err) => reject(err));
    req.write(soapBody);
    req.end();
  });
}

exports.handler = async (event) => {
  const accountId = event.pathParameters?.id;
  const apiKeyId = event.requestContext?.identity?.apiKeyId;
  const accountType = event.queryStringParameters?.type || "DDA";

  log("INFO", "ACCOUNT_INQUIRY_RECEIVED", { accountId, accountType, apiKeyId });

  try {
    // 1. Authorize Tenant Mapping
    const tenantRecord = await ddb.send(new GetCommand({
      TableName: TENANT_TABLE,
      Key: { apiKeyId }
    }));

    if (!tenantRecord.Item) {
      log("WARN", "UNAUTHORIZED_TENANT", { apiKeyId });
      return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized tenant" }) };
    }

    // 2. Load Config & mTLS Agent
    const { config, agent } = await getConfigAndAgent();

    // 3. Construct AcctInq SOAP Body
    const acctInqBody = `
      <jx:AcctInq xmlns="http://jackhenry.com/jxchange/TPG/2008">
        <jx:AccountId>
          <jx:AcctId>${accountId}</jx:AcctId>
          <jx:AcctType>${accountType}</jx:AcctType>
        </jx:AccountId>
      </jx:AcctInq>
    `;

    const soapEnvelope = buildSoapEnvelope(config, acctInqBody);
    const soapAction = "http://jackhenry.com/jxchange/TPG/2008/ServiceGateway/AcctInq";

    log("INFO", "DISPATCHING_JXCHANGE_SOAP", { accountId, endpoint: config.endpointUrl });

    // 4. Send Request via mTLS
    const startTime = Date.now();
    const response = await postToJxchange(config.endpointUrl, agent, soapAction, soapEnvelope);
    const durationMs = Date.now() - startTime;

    log("INFO", "JXCHANGE_RAW_RESPONSE", { statusCode: response.statusCode, durationMs });

    // 5. Handle SOAP Faults & Parsing
    const faultString = extractXmlNode(response.body, "faultstring") || extractXmlNode(response.body, "FaultDesc");
    if (faultString) {
      log("WARN", "SOAP_FAULT_DETECTED", { faultString, body: response.body });
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Core Error", message: faultString })
      };
    }

    // 6. Extract Normalized Account Details
    const balanceCurrent = extractXmlNode(response.body, "CurBal") || "0.00";
    const balanceAvail = extractXmlNode(response.body, "AvailBal") || balanceCurrent;
    const acctStatus = extractXmlNode(response.body, "AcctStat") || "Active";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        accountType,
        coreType: config.coreType,
        status: acctStatus,
        balances: {
          current: parseFloat(balanceCurrent),
          available: parseFloat(balanceAvail)
        },
        currency: "USD"
      })
    };

  } catch (error) {
    log("ERROR", "JXCHANGE_PROXY_EXCEPTION", { message: error.message, stack: error.stack });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Gateway Error", details: error.message })
    };
  }
};
```
