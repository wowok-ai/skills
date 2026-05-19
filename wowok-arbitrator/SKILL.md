---
name: wowok-arbitrator
description: |
  WoWok Arbitrator — the canonical skill for arbitration service providers
  to create Arbitration objects, handle dispute resolution, manage voting processes,
  and earn arbitration fees.
  
  Covers: creating Arbitration objects, receiving Messenger communications,
  selecting and organizing voters, processing arbitration cases (Arb objects),
  distributing arbitration fees, and managing compensation funds.
  
  For customers placing orders, see wowok-order. For service providers, see wowok-provider.
when_to_use:
  - User wants to create an Arbitration service on WoWok
  - User wants to handle dispute resolution between customers and merchants
  - User wants to organize voting processes for arbitration cases
  - User wants to manage arbitration fees and compensation funds
  - User mentions "arbitration", "dispute resolution", "voting", "arbiter", "judge"
---

# WoWok Arbitrator Guide

Create and operate arbitration services on WoWok as a trusted third-party dispute resolver.

> **Role**: Arbitrator (Dispute Resolution Service)  
> **Customer Perspective**: See [wowok-order](../wowok-order/SKILL.md) — Section 3: Arbitration Operations  
> **Service Provider Perspective**: See [wowok-provider](../wowok-provider/SKILL.md)  
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Principle: Trusted Third-Party

Arbitration services provide **neutral dispute resolution** between customers and service providers. Trust is earned through:

- **Transparent processes**: Clear rules published in Arbitration object
- **Fair voting**: Multi-party voting prevents unilateral decisions
- **Timely resolution**: Defined deadlines prevent indefinite delays
- **Enforceable outcomes**: Integration with Service's compensation fund

---

## The Arbitration Lifecycle

```
ARBITRATION CREATION (one-time setup)
├── Create Arbitration object
├── Configure: fee structure, voting rules, compensation fund
├── Set up Contact (um) for Messenger communication
└── Publish to make available for Services

ARBITRATION CASE (Arb object) — per dispute
├── Customer initiates via arbitration.dispute (pays fee)
├── Customer submits evidence via Messenger (WTS files)
├── Arbitrator reviews evidence and organizes voting
├── Voters cast votes
├── Result determined and published
├── Customer claims compensation via order.arb_claim_compensation
└── Arbitrator receives fee from Arbitration.balance
```

---

## Creating an Arbitration Service

### Step 1: Create Arbitration Object

```typescript
onchain_operations({
  operation_type: "arbitration",
  data: {
    name: "my-arbitration-service",
    description: "Fair dispute resolution for e-commerce",
    fee: "1000000",  // Arbitration fee per case (1 token, 6 decimals)
    // Other configuration
  }
})
```

### Step 2: Set Up Contact for Messenger

Arbitration's `um` field references a Contact object with Messenger addresses:

```typescript
// Create Contact object with IM addresses
onchain_operations({
  operation_type: "contact",
  data: {
    name: "arbitration-contact",
    description: "Contact for arbitration submissions",
    ims: [
      { name: "customer-service", at: "<messenger_address_1>" },
      { name: "evidence-review", at: "<messenger_address_2>" }
    ]
  }
})

// Link Contact to Arbitration
onchain_operations({
  operation_type: "arbitration",
  data: {
    object: "my-arbitration-service",
    um: "arbitration-contact"  // Link Contact object
  }
})
```

### Step 3: Configure Compensation Fund (Optional)

Services can link to your Arbitration and contribute to compensation fund:

```
Service.compensation_fund → Holds tokens for arbitration payouts
When customer wins arbitration → Funds transferred to customer's Order
```

---

## Handling Arbitration Cases

### Receiving Evidence via Messenger

Customers submit evidence through encrypted Messenger communication:

**Process**:
1. Customer queries Arbitration's Contact object (`arbitration.um`)
2. Customer extracts IMS addresses from `contact.ims[]`
3. Customer sends WTS files via `messenger_operation({ operation: "send_message" })`
4. Arbitrator receives and verifies WTS authenticity

**WTS Verification**:
```typescript
// Verify WTS file authenticity
messenger_operation({
  operation: "verify_wts",
  wtsFilePath: "<path_to_received_wts_file>"
})
// Returns: { valid: true/false, error?: string }
```

### Arb Object Lifecycle

Arb objects progress through states as the arbitration proceeds:

| State | Description | Next Action |
|-------|-------------|-------------|
| `Principal_confirming` | Initial state, principal (customer) confirming claim | Customer submits evidence |
| `Arbitrator_confirming` | Arbitrator reviewing evidence | Arbitrator organizes voting |
| `Voting` | Voting in progress | Voters cast votes |
| `Arbitrated` | Voting complete, result determined | Either party can object |
| `Objectionable` | Objection period open | Opposing party can file objection |
| `Finished` | Arbitration complete, result final | Customer can claim compensation |
| `Withdrawn` | Arbitration withdrawn | No further action |

### Organizing Voting

**Selecting Voters**:
- Define voter eligibility criteria (reputation, stake, expertise)
- Invite qualified voters to participate
- Set voting deadline (`arb.voting_deadline`)

**Voting Process**:
```
Arb.proposition[] → List of claims/proposals
Arb.voted[] → Voting records
Voters evaluate evidence and vote on propositions
```

**Determining Outcome**:
- Count votes per proposition
- Apply voting rules (simple majority, supermajority, etc.)
- Set `arb.indemnity` with compensation amount if customer wins
- Transition to `Arbitrated` state

---

## Arbitration Fees & Revenue

### Fee Structure

**Arbitration Fee** (`arbitration.fee`):
- Paid by customer when initiating dispute (`arbitration.dispute`)
- Stored in `arbitration.balance`
- Covers arbitrator's operational costs

**Fee Distribution**:
```
Customer pays fee ──→ Arbitration.balance
                          │
                          ├──→ Arbitrator (platform/revenue)
                          └──→ Voters (if voter incentives configured)
```

### Extracting Fees

Arbitrators can extract accumulated fees:

```typescript
// Query Arbitration balance
query_toolkit({ query_type: "onchain_objects", objects: ["my-arbitration-service"] })
// Extract: arbitration.balance

// Extract fees (via receive operation or arbitration-specific withdrawal)
// Schema: schema_query({ action: "get", name: "onchain_operations_arbitration" })
```

---

## Integration with Services

### Services Linking to Arbitration

Services configure which Arbitrations they support:

```
Service.arbitrations: ["<arbitration_id_1>", "<arbitration_id_2>"]
Service.compensation_fund: "<token_balance>"
```

When customer creates Arb object on linked Arbitration:
- Arb automatically associated with Order
- Service's compensation fund available for payouts
- Arbitration fee paid to Arbitration.balance

### Compensation Flow

```
Customer wins arbitration
        │
        ├──→ Arb.indemnity set with compensation amount
        │
        ├──→ Customer calls order.arb_claim_compensation
        │
        ├──→ Funds transferred from Service.compensation_fund to Order
        │
        └──→ Customer extracts via Order.receive()
```

---

## Best Practices

### Building Trust

1. **Clear Rules**: Publish detailed arbitration rules and fee structure
2. **Fair Process**: Ensure transparent evidence review and voting
3. **Timely Resolution**: Set and enforce reasonable deadlines
4. **Professional Communication**: Respond promptly via Messenger
5. **Consistent Standards**: Apply uniform criteria across cases

### Evidence Handling

1. **Verify WTS**: Always verify WTS file authenticity before evaluation
2. **Document Review**: Maintain records of evidence evaluation
3. **Privacy Protection**: Keep evidence confidential (Messenger-only)
4. **Chain of Custody**: Track evidence submission timestamps

### Fee Management

1. **Competitive Pricing**: Set fees that balance accessibility and sustainability
2. **Transparent Costs**: Clearly communicate fee structure upfront
3. **Fair Distribution**: Compensate voters fairly if using distributed voting
4. **Regular Withdrawals**: Extract fees periodically to manage treasury

---

## Schema Reference

Use `schema_query` tool to get complete JSON schemas:

```
schema_query({ action: "list" })                    // List all schemas
schema_query({ action: "get", name: "onchain_operations_arbitration" })   // Arbitration operations
schema_query({ action: "get", name: "onchain_operations_order" })         // Order arbitration operations
schema_query({ action: "get", name: "messenger_operation" })              // Messenger for evidence
```

**Key Schemas**:
- `ObjectArbitrationSchema`: Arbitration object structure
- `ObjectArbSchema`: Arb case object structure
- `ArbStatusSchema`: Arb lifecycle states
- `ContactSchema`: Messenger contact setup

**Tools**: `query_toolkit` | `messenger_operation` | [all_tools](../wowok-tools/SKILL.md)
