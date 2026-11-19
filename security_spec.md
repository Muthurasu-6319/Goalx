# GoalX Phase 1–4 — Security Specification (Payload-First TDD)

## 1. Data Invariants

1. **Strict Ownership (`ownerId`) & Tenant Binding (`companyId`)**: Every document in Phase 1–4 collections MUST contain an immutable `ownerId` matching `request.auth.uid`. Every Phase 3A/3B/4 business document MUST also contain an immutable `companyId` matching a `companies/{companyId}` document owned by `request.auth.uid`.
2. **No Shadow Fields**: Document writes are strictly bound to allowlisted keys (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update). Arbitrary extra keys (e.g. `isAdmin`, `role`, `derivedStatus`, `totalPaid`) are rejected.
3. **Positive Integer Money & Valid Dates**: Financial amounts (`projectPayments.amountPaise`, `otherIncome.amountPaise`, `invoices.amountPaise`, `businessExpenses.amountPaise`, `recurringExpenseTemplates.amountPaise`, `budgets.limitPaise`) MUST be positive integers (`is int && > 0`). Salary components (`baseSalaryPaise`, `commissionPaise`, `incentivePaise`, `deductionsPaise`, `netPayablePaise`) MUST be non-negative integers (`is int && >= 0`). Dates must match `YYYY-MM-DD` and months must match `YYYY-MM`.
4. **Immutable Audit Trails**:
   - `financeAuditLogs` are strictly create-only (`allow update: if false; allow delete: if false;`).
   - `leadActivities`, `goalProgressHistory`, and `savingsTransactions` prohibit client updates (`allow update: if false;`).
5. **Single Source of Truth & Owner-Only Salary Isolation**:
   - `teamMemberPrivate` and `salaryRecords` are strictly owner-only (`request.auth.uid == ownerId`).
   - `invoices` NEVER store a mutable status field (status is derived client-side from `projectPayments` and `dueDate`).
   - `salaryRecords` deterministic ID `${memberId}_${month}` prevents duplicate monthly salary entries.
   - `businessExpenses` generated from recurring templates (`rec_${templateId}_${month}`) or paid salaries (`salexp_${salaryRecordId}`) use deterministic IDs to prevent duplicate writes.
6. **Workflow & Relational Gate**:
   - Creating `projectPayments`, `salaryRecords`, `budgets`, `invoices` with parent references verifies ownership of `companyId`, `projectId`, `clientId`, or `memberId` via `get()`.
   - `leads` requires non-empty `lostReason` when `status == 'Lost'`, and prevents double conversion.
7. **Storage Security (`storage.rules`)**:
   - Expense receipts are scoped to `/receipts/{userId}/{expenseId}/{fileName}`, strictly owner-only, restricted to `image/*` (`png`, `jpeg`, `webp`) or `application/pdf`, and capped at 5 MB.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unauthenticated Read/Write**: Read or write `/otherIncome/inc1` or `/salaryRecords/sal1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Cross-Tenant Read on Salary/Finance**: User B (`uid2`) calls `get(/salaryRecords/m1_2026-11)` or `get(/teamMemberPrivate/m1)` belonging to `uid1` -> `PERMISSION_DENIED`.
3. **Unfiltered List Scraping**: User B (`uid2`) queries `businessExpenses` or `invoices` without `where('ownerId', '==', 'uid2')` -> `PERMISSION_DENIED`.
4. **Owner Spoofing on Create**: User B (`uid2`) creates `/otherIncome/inc2` with `ownerId: "uid1"` -> `PERMISSION_DENIED`.
5. **Negative or Fractional Paise Injection**: User A (`uid1`) creates `/businessExpenses/exp1` with `amountPaise: -500` or `amountPaise: 12.5` -> `PERMISSION_DENIED`.
6. **Invalid Enum Injection**: User A (`uid1`) creates `/otherIncome/inc1` with `method: "Crypto"` or `/budgets/b1` with `budgetType: "Arbitrary"` -> `PERMISSION_DENIED`.
7. **Audit Log Tampering**: User A (`uid1`) updates or deletes `/financeAuditLogs/log1` -> `PERMISSION_DENIED`.
8. **Stored Invoice Status Spoofing**: User A (`uid1`) creates `/invoices/inv1` with a stored `status: "Paid"` field -> `PERMISSION_DENIED`.
9. **Invalid Date Format**: User A (`uid1`) creates `/businessExpenses/exp1` with `date: "18/11/2026"` -> `PERMISSION_DENIED`.
10. **CompanyId Mutation on Update**: User A (`uid1`) updates `/invoices/inv1` changing `companyId` -> `PERMISSION_DENIED`.
11. **Backdated Server Timestamp**: User A (`uid1`) creates `/salaryRecords/m1_2026-11` with forged `createdAt` -> `PERMISSION_DENIED`.
12. **Oversized String / Path Poisoning**: User A (`uid1`) writes a 200-char ID or 5,000-char description to `/businessExpenses/...` -> `PERMISSION_DENIED`.

## 3. Phase 5A Competitor Intelligence Invariants & Adversarial Tests

1. **Verified Requires Valid Source URL**: Any `competitorMetrics`, `competitorEvidence`, or `competitorPendingFindings` write with `dataStatus == 'Verified'` (or `reviewedDataStatus == 'Verified'`) MUST include a valid `http://` or `https://` `sourceUrl`.
2. **AI Pending Findings Safeguard**:
   - `competitorPendingFindings` cannot be created directly with `dataStatus == 'Verified'` or `decision != 'Pending'`; `researchRunId` must belong to an owned `competitorResearchHistory` run.
   - `competitorPendingFindings` updates are restricted solely to review decision fields (`decision`, `reviewedAt`, `reviewedValue`, `reviewedDataStatus`, `reviewedNotes`, `acceptedEvidenceId`, `createdCandidateId`, `updatedAt`) and are terminal-locked once `existing().decision != 'Pending'`.
3. **Immutable Competitor / Run Bindings**: `ownerId`, `companyId`, and `createdAt` are immutable across all 5 Phase 5A collections; `competitorId` and `researchRunId` cannot be reassigned after creation.
4. **Adversarial Payloads (Phase 5A)**:
   - Creating a `competitorMetrics` doc with `dataStatus: "Verified"` and `sourceUrl: ""` -> `PERMISSION_DENIED`.
   - Creating a `competitorPendingFindings` doc with `dataStatus: "Verified"` or `decision: "Accepted"` -> `PERMISSION_DENIED`.
   - Updating a `competitorPendingFindings` doc after `decision` is already `"Rejected"` or mutating `proposedValue` -> `PERMISSION_DENIED`.
   - Cross-user `get` or `list` without `ownerId == request.auth.uid` on `competitors` -> `PERMISSION_DENIED`.

## 4. Phase 5B Scorecards, Gaps & Surpassed Integrity Invariants

1. **Scorecard Weights MUST Sum to 100**: `competitorScoreConfigs.weights` requires all 10 standard dimensions as non-negative integers totaling strictly `100`, plus `minComparableMetrics >= 5`, `minScoreAdvantage >= 10`, `minEvidenceCoveragePct >= 70`, and `minConsecutiveMonths >= 2`.
2. **Own Metrics Evidence Rule**: `ownMetrics` with `dataStatus == 'Verified'` MUST provide a valid `http://` or `https://` `sourceUrl`.
3. **Immutable Monthly Reviews & Deterministic IDs**:
   - `competitorMonthlyReviews` are strictly create-only (`allow update: if false; allow delete: if false;`).
   - Doc IDs must match `competitorId_YYYY-MM` or `competitorId_YYYY-MM_vN`.
4. **Prevent Client-Direct `'Surpassed'` Status & Duplicate Reward Events**:
   - Creating a `competitors` document directly with `status == 'Surpassed'` is rejected.
   - Standard `competitors` updates cannot transition `status` to `'Surpassed'` and cannot modify a competitor already `'Surpassed'`.
   - Transitioning `status` to `'Surpassed'` requires an atomic write batch (`existsAfter`) creating both `rewardEvents/surpassed_${competitorId}` (`xpAwarded == 0`, `processedByPhase6 == false`) AND an immutable `competitorComparisons` `surpassed_archive` doc, backed by two distinct-month `competitorMonthlyReviews` documents belonging to the competitor that BOTH satisfy `eligibleForSurpass == true`, `comparableCount >= 5`, `ownLeadsCount >= 4`, `scoreAdvantage >= 10`, and `evidenceCoveragePct >= 70`.
5. **Prevent Double Gap Conversion**: `competitiveGoals` enforces deterministic doc ID `${gapId}_${targetType}` (`goal` or `task`) and references a valid owned `competitiveGaps/{gapId}`.
6. **Adversarial Payloads (Phase 5B)**:
   - Setting `competitors/{id}.status = 'Surpassed'` directly without atomic `rewardEvent`, archive, and 2 eligible monthly snapshots -> `PERMISSION_DENIED`.
   - Writing `rewardEvents` with `xpAwarded > 0` or `processedByPhase6 == true` or non-deterministic doc ID -> `PERMISSION_DENIED`.
   - Writing `competitorScoreConfigs` whose 10 weights sum to `95` -> `PERMISSION_DENIED`.
   - Updating or deleting an immutable `competitorMonthlyReviews` snapshot -> `PERMISSION_DENIED`.

## 5. Phase 6B GoalX AI CEO, Briefing & Action Proposals Invariants

1. **Strict Owner Isolation & Immutable Audit Logs**:
   - All 7 AI CEO collections (`aiConversations`, `aiMessages`, `aiBriefings`, `aiActionRequests`, `aiUsage`, `baselineReviews`, `activityLogs`) enforce `ownerId == request.auth.uid` on read/list and write.
   - `aiMessages`, `baselineReviews`, and `activityLogs` prohibit updates (`allow update: if false;`); `activityLogs` and `aiUsage` prohibit deletes (`allow delete: if false;`).
2. **Action Proposal Allowlist & Terminal State Lock**:
   - `aiActionRequests.actionType` is strictly limited to `create_goal`, `create_task`, `create_calendar_event`, `create_lead_followup`, `create_competitive_gap`. Finance, salary, team, settings, and delete actions are structurally blocked.
   - `aiActionRequests` can only be created in `Pending` status, and once `Executed`, `Rejected`, or `Expired`, subsequent client updates are rejected (`PERMISSION_DENIED`).
3. **Daily Rate Limit Counter Integrity (`aiUsage`)**:
   - Deterministic ID `${request.auth.uid}_${YYYY-MM-DD}` prevents duplicate daily quota docs; `chatCount <= 50`, `briefingCount <= 10`, `baselineCount <= 10`.
4. **Adversarial Payloads (Phase 6B)**:
   - Creating an `aiActionRequests` doc with `actionType: "delete_project"` or `status: "Executed"` -> `PERMISSION_DENIED`.
   - Updating an `aiActionRequests` doc after `status` is `"Executed"` or `"Rejected"` -> `PERMISSION_DENIED`.
   - Creating `aiUsage/fake_id` not matching `${uid}_${date}` or setting `chatCount: 999` -> `PERMISSION_DENIED`.
   - Cross-user `get` or unfiltered `list` on `aiConversations`, `aiMessages`, `aiBriefings`, or `aiActionRequests` -> `PERMISSION_DENIED`.

