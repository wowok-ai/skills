---
name: wowok-order
description: |
  WoWok order lifecycle management — covers the complete order flow from
  creation through payment, progress tracking, completion, and dispute
  resolution. Includes order splitting (Allocation), incentive distribution
  (Reward), and arbitration patterns.
  
  Use this skill when managing orders, setting up payment flows, configuring
  order splitting, or handling disputes.
when_to_use:
  - User wants to create or manage orders
  - User asks about order lifecycle, payment, or progress
  - User needs to set up order splitting (allocation) or incentives (reward)
  - User mentions "order", "payment", "allocation", "reward", "arbitration", "dispute"
  - User wants to understand how money flows in WoWok
---

# WoWok Order Lifecycle Management

## Runtime Objects Overview

After a Service is published (see [wowok-provider](../wowok-provider/SKILL.md)), users interact with it creating runtime objects:

| Object | Created By | Purpose |
|--------|-----------|---------|
| **Order** | User purchase | Order management and escrow |
| **Progress** | Order creation | Workflow state tracking |
| **Allocation** | Order creation | Executes allocators to distribute order funds |
| **Arb(s)** | Dispute request | Arbitration for compensation |

**Key Distinction:**
- **Allocators** (plural): Defined at **Service** level — multiple distribution strategies with Guard conditions
- **Allocation** (singular): Created per **Order** — the execution engine that runs the winning allocator strategy

```
User Purchase
     ↓
Service ──→ Order ──→ Progress
              ↓           ↓
         Payment    Node Transitions
         (escrow)   (Guard validated)
                        ↓
              ┌─────────────────┐
              │  Multiple Exit  │
              │    Nodes →      │
              │  Allocation     │
              │  (Conditional)  │
              └─────────────────┘
                        ↓
            Fund Distribution
            (Per Consensus Rules)
```

### Allocation as Consensus-Driven Distribution

**Allocation is not a single endpoint** — it's a set of **conditional distribution strategies** defined by mutual consensus between buyer and seller:

| Scenario | Trigger Node | Allocation Strategy | Guard Control |
|----------|-------------|---------------------|---------------|
| **Order Complete** | "Completed" / "Wonderful" | Full payment to seller | `merchant_win_guard` |
| **Order Cancelled** | "Cancelled" / "Lost" | Refund to buyer | `customer_win_guard` |
| **Return Accepted** | "Return Complete" | Partial refund per policy | `return_accept_guard` |
| **Return Rejected** | "Return Fail" | Payment to seller | `return_reject_guard` |

Each allocation strategy is **independently validated by its Guard** — only the Guard that evaluates to `true` for the current Progress node will execute its distribution rules.

## Component Relationships

```
Service (marketplace)
  ├── Machine (workflow template)
  ├── Allocators (order splitting rules - multiple strategies)
  ├── Reward (incentive pool)
  └── Treasury (team fund)

Order (instance)
  ├── references Service
  ├── references Machine (for workflow)
  ├── Payment (funds transfer)
  ├── Progress (workflow tracking)
  └── Allocation (created at order creation, executes allocators)
      └── Runs the winning allocator strategy when Guard validates
```

## Order Lifecycle: From Discovery to Consensus

Creating an order is NOT just a single transaction — it's a **matching and consensus-building process**. AI must help users gather sufficient information, evaluate the service, and establish clear mutual understanding before committing funds.

### Phase 1: Service Discovery & Evaluation

Before creating an order, thoroughly investigate the Service:

**1. Query Service Configuration**
```
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
```

Extract and analyze:
- **Sales**: Pricing models, available offerings. Each sale includes:
  - `name`, `price`, `stock`: Basic product info
  - `wip`: HTTP URL to the Witness Promise file (product description, images, terms)
  - `wip_hash`: Hash of the WIP file for integrity verification
  - **Critical**: The WIP file represents the seller's **immutable commitment** to product specifications. If `wip_hash` is empty, the system auto-verifies against the WIP content; if provided, it must match. This commitment serves as **arbitration evidence** in case of disputes.
- **Locations**: Geographic/service scope constraints
- **Machine**: Workflow definition, node structure, exit conditions
- **Allocators**: Fund distribution strategies and their Guard conditions
- **Arbitrations**: Dispute resolution mechanisms
- **Rewards**: Incentive programs for buyers/sellers
- **Guards**: Validation rules that control state transitions

**2. Deep Service Evaluation via EntityLinker (Optional but Recommended)**

Query the Service's community endorsement graph to build a comprehensive service capability profile:

```
// Get Service's EntityLinker data
query_toolkit({ query_type: "onchain_table_item_entity_linker", address: "<service_name_or_address>" })
```

**Response Analysis**:
- **`count`**: Follower count indicating community attention/activity level
- **`votes`**: Array of vote records, each containing:
  - `address`: Linked object address (order, arbitration, etc.)
  - `like/dislike/affiliation`: Community sentiment
  - `time`: When the relationship was established (most recent interaction time)

**Query Associated Objects for Deep Analysis**:

Objects may have associated table data. Query base object data first, then query tables if the object type supports them (Repository, Treasury, Machine, Progress, Permission, Reward, Demand, Resource, etc.):

```
// Query base object data
query_toolkit({ query_type: "onchain_objects", objects: ["<order_address_1>", "<order_address_2>"] })

// Query object's table items for detailed records
query_toolkit({ query_type: "onchain_table", parent: "<progress_address>"})
```

**Schema Reference**:
```
schema_query({ action: "get", name: "query_toolkit" })
// Look for: onchain_objects, onchain_table, onchain_table_item_repository_data
```

**Key Metrics to Calculate** (from Order object fields):
- **Activity Level**: `count` and vote frequency in EntityLinker
- **Order Completion Rate**: % of orders where `progress` reached terminal nodes (check Progress table for completion status)
- **Arbitration Rate**: % of orders where `dispute` array is non-empty (lower is better)
- **Average Resolution Time**: Calculate from Progress table node timestamps (time from order creation to reaching completion node)
- **Customer Satisfaction**: Ratio of likes vs dislikes in EntityLinker votes
- **Repeat Customer Rate**: % of unique `builder` (purchaser) addresses appearing multiple times across orders

### Phase 2: Communication & Consensus Building (CRITICAL)

Before committing funds, establish encrypted communication with the Service to clarify terms and build mutual understanding.

**Step 1: Establish Messenger Contact with Service**

Query the Service to get its Contact object (`um` field), then extract IM addresses for encrypted communication:

```
// Query Service to get um (Contact object)
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
// Extract: service.um (Contact object ID)

// Query Contact object for IM addresses
query_toolkit({ query_type: "onchain_objects", objects: ["<contact_object_id>"] })
// Extract: contact.ims[].at (IM addresses for encrypted communication)
```

**Step 2: Send Encrypted Messages**

Use the encrypted messenger to communicate with Service customer service:

```
messenger_operation({
  operation: "send_message",
  from: "<your_account>",
  to: "<service_im_address>",
  content: "<your_message_content>"
})
```

**Schema**: `schema_query({ action: "get", name: "messenger_operation" })`

**Why Encrypted Messenger Matters**:
- Messages are **end-to-end encrypted** and **NOT stored on-chain**
- Establishes **off-chain consensus** before on-chain commitment
- Creates **audit trail** for dispute resolution
- Allows **negotiation** of terms not hardcoded in the Service

**AI Guidance**: Proactively suggest users contact the seller to clarify:
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Handling of edge cases
- Refund and cancellation terms
- Delivery address, contact phone, and other logistics
- Any custom requirements

### Phase 3: Order Creation & Payment

Once consensus is established, create the Order through the **Service** operation (`operation_type: "service"`), which atomically creates **Order + Allocation + Progress**.

**Use `schema_query({ action: "get", name: "onchain_operations_service" })` to get the complete schema.** Key fields in `order_new`:

**Purchase Specification (`buy`)**:
- `items`: List of items to purchase (reference `Service.sales` for available products)
- `total_pay`: Your payment budget — **excess funds are automatically refunded**
- `discount`: Optional discount coupon object ID (if you own one)
- `payment_remark`: Optional note/reference for the payment

**Agent Delegation (`agents`)**:
- Optional list of agent addresses who can operate the order on your behalf
- **Agent powers**: Cancel order, modify status, participate in Progress workflow, apply for arbitration
- **Agent limitation**: **CANNOT extract/withdraw funds** — only the order holder (`builder`) can receive payments

**Order Required Info (`order_required_info`)**:
- Contact object ID or WTS Proof object for delivery/communication (delivery address, contact phone, etc.)
- **CRITICAL**: After order creation, must notify Service customer service via **Messenger** (see Phase 2 for how to establish contact)
- Include the order ID and submitted info reference in the message

**Object Naming** (optional but recommended):
- `namedNewOrder`: Assign a local name to the Order for easy reference
- `namedNewAllocation`: Name the Allocation object
- `namedNewProgress`: Name the Progress object

**Service-Required Private Information (`customer_required`)**:
- If Service specifies `customer_required` fields (e.g., phone, email, delivery address), these are **mandatory**
- **Security**: Send this private information **via Messenger** (end-to-end encrypted) directly to Service customer service 
- Messenger ensures **point-to-point secure communication** between buyer and seller — **no information is published on-chain**

## Order Operations (Post-Creation)

After order creation, the order holder (`builder`) and agents can perform various operations using `operation_type: "order"`.

**Schema**: `schema_query({ action: "get", name: "onchain_operations_order" })`

### Order Operation Categories

**1. Agent Management (`agents`)**
- **Only `builder` (order owner)** can add or remove agents
- Agents can: cancel order, modify status, advance progress, apply for arbitration
- Agents **CANNOT**: withdraw funds (only `builder` can)

**2. Progress Advancement (`progress`)**

Progress advancement follows Machine-defined workflow rules:

**Step 1: Query Current Progress State**
```
query_toolkit({ query_type: "onchain_objects", objects: ["<order_name>"] })
// Extract: order.progress (Progress object ID), order.machine (Machine ID)

query_toolkit({ query_type: "onchain_objects", objects: ["<progress_id>"] })
// Extract: progress.current_node (current node name, "" for initial node)
```

**Step 2: Check Machine Forward Permissions**

Query Machine table to find available forward operations from current node:

```
// Query Machine nodes table (returns ALL node definitions)
query_toolkit({ query_type: "onchain_table", parent: "<machine_id>" })

// Returns: TableAnswer with items[] where each item is TableItem_MachineNode:
// - key: node name (string)
// - value: MachineNodePair[] with prev_node and forwards[]

// Filter logic:
// 1. Find node pair where pair.prev_node === Progress.current_node
// 2. From that pair's forwards[], filter where namedOperator === ""
// Result: Valid transitions FROM current node that Order can trigger
```

**Forward Structure**:
- `namedOperator`: Namespace permission ("" = Order can operate)
- `permissionIndex`: Index permission (alternative to namedOperator)
- `weight`: Contribution weight toward threshold
- `guard`: Optional Guard ID for validation
- `threshold`: Required total weight to advance node

**Algorithm**: Find valid transitions FROM current node where:
- `pair.prev_node === Progress.current_node` (transition originates from current state)
- `forward.namedOperator === ""` (Order has permission to execute)

### CRITICAL: Path Selection & Game Theory

**Core Principle**: The **consensus (Machine + Allocators) is immutable and transparent to all**, but **how to advance Progress depends on each party's own interests**.

- **Service Provider** (seller): Wants to reach "completed" node to receive payment
- **Buyer** (order builder): May want "refund", "dispute", or "completed" depending on satisfaction
- **Both parties** operate within the same transparent rules, but choose different paths based on their interests

**Multiple Paths Scenario**: A node may have **multiple forwards** leading to **different next nodes**. Each path has distinct consequences:

```
Current Node: "delivery_pending"
├── Forward A → Node: "delivery_confirmed" 
│   ├── Guard: "buyer_receipt_signed" (buyer confirms receipt)
│   └── Allocation: 95% to seller, 5% to platform
│
├── Forward B → Node: "dispute_filed"
│   ├── Guard: "arbitration_requested" (buyer disputes)
│   └── Allocation: Funds frozen, arbitration begins
│
└── Forward C → Node: "return_initiated"
    ├── Guard: "return_window_active" (within return period)
    └── Allocation: 90% refund to buyer, 10% restocking fee
```

**AI Decision Framework**:

1. **Query All Valid Paths**
   ```
   // For each forward where namedOperator === "":
   // - Extract target node name
   // - Extract guard ID (if any)
   // - Query Guard to understand validation conditions
   ```

2. **Evaluate Guard Conditions**
   ```
   query_toolkit({ query_type: "onchain_objects", objects: ["<guard_id>"] })
   // Understand: What data/proof is required to pass this Guard?
   // Example: "buyer_receipt_signed" requires buyer's signature
   ```

3. **Assess Allocation Impact**
   ```
   // Query Service order_allocators to see which allocator triggers at each exit node:
   query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
   // Extract: service.order_allocators[]
   // Match: allocator.guard with node's expected outcome
   ```

4. **Present Options to User**

   | Path | Guard Condition | Allocation Outcome | User Action Required |
   |------|----------------|-------------------|---------------------|
   | A | Buyer signs receipt | 95% seller / 5% platform | Confirm delivery |
   | B | Arbitration requested | Funds frozen | Submit dispute evidence |
   | C | Within return window | 90% refund / 10% fee | Return merchandise |

**Key Insight**: The **same current node** can lead to **drastically different financial outcomes**. User must understand:
- Which path aligns with their interests
- What Guard validation data they can provide
- The final Allocation result of each path

**AI Guidance**: 
- **Always** query and present ALL available forwards
- **Explain** the Guard condition for each path
- **Map** each path to its Allocation consequence
- **Recommend** based on user's stated goals and available evidence

**Schema**: `schema_query({ action: "get", name: "onchain_operations_service" })` — review `order_allocators` structure

---

**Step 3: Execute Progress Operation (Via Order)**

Order users **MUST** advance progress through the Order object, not directly via Progress.

**Node Advancement Requirements**:
- **Weight Threshold**: Sum of forward weights must reach/exceed node threshold
- **Guard Validation**: If forward has `guard`, Guard must return true
- **Permission**: Either `namedOperator` (namespace) or `permissionIndex` must authorize the operation

**Schema**: `schema_query({ action: "get", name: "onchain_operations_order" })` 

**3. Arbitration Operations (Dispute Resolution)**

Arbitration allows order users to resolve disputes through third-party Arbitration objects. The process involves:

**Arb Object Lifecycle** (created via `arbitration` operation, managed via `order` operation):
- `Principal_confirming` → `Arbitrator_confirming` → `Voting` → `Arbitrated` → `Objectionable` → `Finished`/`Withdrawn`

**Step-by-Step Process**:

1. **Initiate Arbitration** (`arbitration.dispute`)
   - Create new Arb object on a Service-supported Arbitration
   - **User pays arbitration fee separately** (`arbitration.fee`) — NOT from Order balance
   - **Order balance is isolated** — only distributed via `service.order_allocators`
   - Arb object added to Order's `dispute` array

2. **Generate & Submit Evidence** (Messenger)
   - Generate WTS file from Messenger conversation history with Service
   - WTS is cryptographically signed, tamper-proof, and self-verifying
   - Send WTS to Arbitration's contact address via Messenger (end-to-end encrypted)
   - **Privacy**: Evidence stays off-chain, only transmitted via encrypted Messenger

3. **Confirm Submission** (`order.arb_confirm`)
   - Signal "all evidence submitted" to Arbitration
   - Arbitration reviews evidence and proceeds to voting/adjudication

4. **Object to Result** (`order.arb_objection`)
   - If dissatisfied with arbitration outcome, file objection
   - Request re-arbitration or appeal

5. **Claim Compensation** (`order.arb_claim_compensation`)
   - After favorable arbitration decision, claim compensation
   - Automatically extracted from Service's `compensation_fund`
   - Funds transferred to Order's `builder` account

**Key Rules**:
- **Multiple Arb Objects**: Can create Arb objects on multiple Arbitrations simultaneously
- **One Compensation**: Only ONE compensation claim allowed per Order (choose the best Arb result)
- **Time Sensitivity**: Prolonged arbitration may exceed order's time-based allocation deadlines. If this is a major concern, discuss arbitration timelines during the **pre-order consensus phase** (Phase 2: Communication & Consensus Building)
- **WTS Verification**: Arbitrations use `messenger_operation({ operation: "verify_wts" })` to validate evidence authenticity

**Schema**: `schema_query({ action: "get", name: "onchain_operations_arbitration" })`

**4. Fund Management (`receive`)**
- Unwrap CoinWrapper objects received by the order
- Transfer received funds to order owner (`builder`)
- **Agents and `builder` can both execute**, but only `builder` receives the funds

**Examples of funds Order may receive**:
- **Service penalties**: Late delivery compensation, quality issue compensation — separate from order funds, paid voluntarily by Service Provider to appease customer
- **Collaboration payments**: Cross-service collaboration payments (e.g., courier late delivery penalty)
- **Direct transfers**: Wallet-to-order payments for order-related purposes

**6. Ownership Transfer (`transfer_to`)**
- Transfer order ownership to new address
- Requires order owner (`builder`) permission
- New owner gains all `builder` powers

### Key Principle: Permission Hierarchy

| Role | Powers | Limitations |
|------|--------|-------------|
| **Builder** (Order Holder) | All operations + fund withdrawal | Cannot be restricted by agents |
| **Agents** | Operational tasks (progress, arbitration, cancel) | **No fund access** |

> **Critical**: The `builder` maintains ultimate authority over funds. Agents assist in workflow operations but cannot override financial control. This protects the purchaser's investment.


---

## Payments & Refunds Rules

- **Service purchase**: Always pay through `Service`. Name the generated `Order`, `Progress`, and `Allocation` via `namedNew*` fields for easy management.
- **Order operations**: All order user operations MUST go through the `Order` object — do not operate on `Progress` directly for order-related actions.
- **Refunds/withdrawals**: Users satisfy `Allocation` Guard conditions to withdraw instantly.
- **Arbitration claims**: Compensation payouts go through `Order`. Use `receive` to extract funds to order owner.

**Schema**: `schema_query({ action: "get", name: "onchain_operations_order" })`
