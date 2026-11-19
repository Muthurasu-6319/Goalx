import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import {
  calculateMemberCommission,
  calculateNetSalaryPaise,
  computeBudgetUtilization,
  computeCompanyFinanceSummary,
  computeLeadSourceRevenue,
  computeMomChangePct,
  computeProjectFinancials,
  computeServicePerformance,
  deriveInvoicesWithStatus,
  formatPctOrNA,
  isDuplicateInvoiceNumber,
  suggestNextInvoiceNumber,
} from '../financeUtils';
import {
  Budget,
  BusinessExpense,
  BusinessService,
  Client,
  Invoice,
  Lead,
  OtherIncome,
  Project,
  ProjectPayment,
  TeamMember,
  TeamMemberPrivate,
} from '../../types';

const nowTs = Timestamp.fromMillis(1700000000000);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    ownerId: 'u1',
    companyId: 'u1',
    title: 'SCADA Dashboard',
    clientId: 'client-1',
    serviceId: 'svc-1',
    serviceCategory: 'Industrial Automation',
    assignedMemberId: 'mem-1',
    budgetPaise: 100_000_00, // ₹1,00,000
    status: 'In Progress',
    startDate: '2026-04-05',
    dueDate: '2026-05-05',
    description: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

function makePayment(overrides: Partial<ProjectPayment> = {}): ProjectPayment {
  return {
    id: 'pay-1',
    ownerId: 'u1',
    companyId: 'u1',
    projectId: 'proj-1',
    clientId: 'client-1',
    amountPaise: 40_000_00,
    date: '2026-04-10',
    method: 'UPI',
    paymentType: 'Advance',
    invoiceNumber: '',
    notes: '',
    isDeleted: false,
    deletedAt: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

function makeOtherIncome(overrides: Partial<OtherIncome> = {}): OtherIncome {
  return {
    id: 'inc-1',
    ownerId: 'u1',
    companyId: 'u1',
    source: 'Retainer Subscription',
    clientId: 'client-1',
    amountPaise: 10_000_00,
    date: '2026-04-12',
    method: 'Bank Transfer',
    notes: '',
    isDeleted: false,
    deletedAt: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

function makeExpense(overrides: Partial<BusinessExpense> = {}): BusinessExpense {
  return {
    id: 'exp-1',
    ownerId: 'u1',
    companyId: 'u1',
    title: 'Cloud Server',
    category: 'Hosting & Cloud',
    amountPaise: 15_000_00,
    date: '2026-04-15',
    paymentMethod: 'Card',
    paidBy: 'Company Card',
    description: '',
    serviceId: '',
    projectId: '',
    attachmentUrl: '',
    attachmentName: '',
    recurringTemplateId: '',
    recurringMonth: '',
    salaryRecordId: '',
    isDeleted: false,
    deletedAt: '',
    createdAt: nowTs,
    updatedAt: nowTs,
    ...overrides,
  };
}

describe('financeUtils core calculations', () => {
  it('computes cash basis revenue, net profit, margin, cash flow, and ignores soft-deleted records', () => {
    const projects = [
      makeProject({ id: 'p1', budgetPaise: 100_000_00, status: 'In Progress' }),
      makeProject({ id: 'p2', budgetPaise: 50_000_00, status: 'Cancelled' }),
      makeProject({ id: 'p3', budgetPaise: 30_000_00, status: 'Planning' }),
    ];
    const payments = [
      makePayment({ id: 'pay1', projectId: 'p1', amountPaise: 40_000_00, date: '2026-04-10' }),
      makePayment({ id: 'pay2', projectId: 'p1', amountPaise: 99_000_00, date: '2026-04-11', isDeleted: true }),
    ];
    const otherIncome = [
      makeOtherIncome({ id: 'inc1', amountPaise: 10_000_00, date: '2026-04-12' }),
      makeOtherIncome({ id: 'inc2', amountPaise: 20_000_00, date: '2026-04-12', isDeleted: true }),
    ];
    const expenses = [
      makeExpense({ id: 'e1', amountPaise: 15_000_00, date: '2026-04-15' }),
      makeExpense({ id: 'e2', amountPaise: 50_000_00, date: '2026-04-16', isDeleted: true }),
    ];

    const summary = computeCompanyFinanceSummary({
      projects,
      projectPayments: payments,
      otherIncome,
      businessExpenses: expenses,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      basis: 'cash',
    });

    assert.equal(summary.collectionsPaise, 50_000_00);
    assert.equal(summary.revenuePaise, 50_000_00);
    assert.equal(summary.expensesPaise, 15_000_00);
    assert.equal(summary.netProfitPaise, 35_000_00);
    assert.equal(summary.profitMarginPct, 70);
    assert.equal(summary.cashFlowPaise, 35_000_00);
    // Outstanding only includes confirmed p1 (100k - 40k = 60k), excludes Cancelled p2 & Planning p3
    assert.equal(summary.totalOutstandingPaise, 60_000_00);
  });

  it('computes accrual basis revenue only from confirmed projects in period and handles 0 revenue profit margin as null (N/A)', () => {
    const projects = [
      makeProject({ id: 'p1', budgetPaise: 100_000_00, status: 'Completed', startDate: '2026-04-05' }),
      makeProject({ id: 'p2', budgetPaise: 80_000_00, status: 'Planning', startDate: '2026-04-06' }),
    ];
    const accrual = computeCompanyFinanceSummary({
      projects,
      projectPayments: [],
      otherIncome: [],
      businessExpenses: [makeExpense({ amountPaise: 25_000_00, date: '2026-04-10' })],
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      basis: 'accrual',
    });

    assert.equal(accrual.revenuePaise, 100_000_00);
    assert.equal(accrual.netProfitPaise, 75_000_00);
    assert.equal(accrual.profitMarginPct, 75);

    const zeroRev = computeCompanyFinanceSummary({
      projects: [],
      projectPayments: [],
      otherIncome: [],
      businessExpenses: [makeExpense({ amountPaise: 5_000_00, date: '2026-04-10' })],
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      basis: 'cash',
    });

    assert.equal(zeroRev.profitMarginPct, null);
    assert.equal(formatPctOrNA(zeroRev.profitMarginPct), 'N/A');
  });

  it('never allows negative outstanding totals and flags overpaid projects separately', () => {
    const projects = [
      makeProject({ id: 'p1', budgetPaise: 50_000_00 }),
      makeProject({ id: 'p2', budgetPaise: 40_000_00 }),
    ];
    const payments = [
      makePayment({ id: 'pay1', projectId: 'p1', amountPaise: 70_000_00 }), // Overpaid by 20k
      makePayment({ id: 'pay2', projectId: 'p2', amountPaise: 10_000_00 }), // Outstanding 30k
    ];

    const rows = computeProjectFinancials(projects, payments, []);
    const p1Row = rows.find((r) => r.project.id === 'p1')!;
    const p2Row = rows.find((r) => r.project.id === 'p2')!;

    assert.equal(p1Row.outstandingPaise, 0);
    assert.equal(p1Row.isOverpaid, true);
    assert.equal(p1Row.overpaidPaise, 20_000_00);
    assert.equal(p2Row.outstandingPaise, 30_000_00);
    assert.equal(p2Row.isOverpaid, false);

    const summary = computeCompanyFinanceSummary({
      projects,
      projectPayments: payments,
      otherIncome: [],
      businessExpenses: [],
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    assert.equal(summary.totalOutstandingPaise, 30_000_00);
    assert.equal(summary.overpaidProjectsCount, 1);
  });

  it('derives invoice statuses (Paid, Partially Paid, Unpaid, Overdue) dynamically from payments', () => {
    const invoices: Invoice[] = [
      {
        id: 'inv-1',
        ownerId: 'u1',
        companyId: 'u1',
        invoiceNumber: 'INV-2026-0001',
        clientId: 'c1',
        projectId: 'p1',
        amountPaise: 50_000_00,
        issueDate: '2026-04-01',
        dueDate: '2026-04-10',
        notes: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      {
        id: 'inv-2',
        ownerId: 'u1',
        companyId: 'u1',
        invoiceNumber: 'INV-2026-0002',
        clientId: 'c1',
        projectId: 'p1',
        amountPaise: 50_000_00,
        issueDate: '2026-04-02',
        dueDate: '2026-04-05',
        notes: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      {
        id: 'inv-3',
        ownerId: 'u1',
        companyId: 'u1',
        invoiceNumber: 'INV-2026-0003',
        clientId: 'c1',
        projectId: 'p2',
        amountPaise: 30_000_00,
        issueDate: '2026-04-10',
        dueDate: '2026-04-30',
        notes: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      {
        id: 'inv-4',
        ownerId: 'u1',
        companyId: 'u1',
        invoiceNumber: 'INV-2026-0004',
        clientId: 'c2',
        projectId: '',
        amountPaise: 20_000_00,
        issueDate: '2026-04-12',
        dueDate: '2026-04-28',
        notes: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    ];

    const payments = [
      makePayment({ id: 'pay1', projectId: 'p1', amountPaise: 50_000_00, invoiceNumber: 'INV-2026-0001' }),
      makePayment({ id: 'pay2', projectId: 'p2', amountPaise: 10_000_00, invoiceNumber: '' }),
    ];

    const derived = deriveInvoicesWithStatus(invoices, payments, '2026-04-20');
    const byId = new Map(derived.map((d) => [d.invoice.id, d]));

    assert.equal(byId.get('inv-1')?.status, 'Paid');
    assert.equal(byId.get('inv-2')?.status, 'Overdue');
    assert.equal(byId.get('inv-2')?.daysOverdue, 15);
    assert.equal(byId.get('inv-3')?.status, 'Partially Paid');
    assert.equal(byId.get('inv-3')?.balancePaise, 20_000_00);
    assert.equal(byId.get('inv-4')?.status, 'Unpaid');

    assert.equal(suggestNextInvoiceNumber(invoices, '2026-04-20'), 'INV-2026-0005');
    assert.equal(isDuplicateInvoiceNumber(invoices, 'inv-2026-0001'), true);
    assert.equal(isDuplicateInvoiceNumber(invoices, 'inv-2026-0001', 'inv-1'), false);
  });

  it('calculates team member commission strictly on Completed assigned project collections in month', () => {
    const member: TeamMember = {
      id: 'mem-1',
      ownerId: 'u1',
      companyId: 'u1',
      name: 'Arjun',
      role: 'Tech Lead',
      department: 'Engineering',
      email: '',
      phone: '',
      status: 'Active',
      joinedDate: '2025-01-01',
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    const memberPrivate: TeamMemberPrivate = {
      id: 'mem-1',
      ownerId: 'u1',
      companyId: 'u1',
      memberId: 'mem-1',
      baseSalaryPaise: 45_000_00,
      commissionRatePct: 8,
      bankNotes: '',
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    const projects = [
      makeProject({ id: 'p-done', assignedMemberId: 'mem-1', status: 'Completed' }),
      makeProject({ id: 'p-wip', assignedMemberId: 'mem-1', status: 'In Progress' }),
    ];
    const payments = [
      makePayment({ id: 'pay1', projectId: 'p-done', amountPaise: 100_000_00, date: '2026-04-08' }),
      makePayment({ id: 'pay2', projectId: 'p-wip', amountPaise: 200_000_00, date: '2026-04-09' }),
      makePayment({ id: 'pay3', projectId: 'p-done', amountPaise: 50_000_00, date: '2026-03-20' }),
    ];

    const comm = calculateMemberCommission({
      member,
      memberPrivate,
      projects,
      projectPayments: payments,
      month: '2026-04',
      defaultCommissionPct: 5,
    });

    assert.equal(comm.eligibleCollectionsPaise, 100_000_00);
    assert.equal(comm.commissionPctUsed, 8);
    assert.equal(comm.commissionPaise, 8_000_00);
    assert.equal(calculateNetSalaryPaise(45_000_00, comm.commissionPaise, 2_000_00, 1_000_00), 54_000_00);
  });

  it('computes budget utilization health bands (<80% healthy, 80-100% warning, >100% exceeded)', () => {
    const budgets: Budget[] = [
      {
        id: 'b1',
        ownerId: 'u1',
        companyId: 'u1',
        budgetType: 'Monthly Overall',
        target: 'Overall Company',
        month: '2026-04',
        limitPaise: 100_000_00,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      {
        id: 'b2',
        ownerId: 'u1',
        companyId: 'u1',
        budgetType: 'Category',
        target: 'Marketing & Ads',
        month: '2026-04',
        limitPaise: 10_000_00,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      {
        id: 'b3',
        ownerId: 'u1',
        companyId: 'u1',
        budgetType: 'Category',
        target: 'Hosting & Cloud',
        month: '2026-04',
        limitPaise: 5_000_00,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    ];
    const expenses = [
      makeExpense({ id: 'e1', category: 'Marketing & Ads', amountPaise: 8_500_00, date: '2026-04-03' }),
      makeExpense({ id: 'e2', category: 'Hosting & Cloud', amountPaise: 6_000_00, date: '2026-04-04' }),
    ];

    const util = computeBudgetUtilization(budgets, expenses, []);
    const byId = new Map(util.map((u) => [u.budget.id, u]));

    assert.equal(byId.get('b1')?.health, 'healthy'); // 14.5%
    assert.equal(byId.get('b2')?.health, 'warning'); // 85%
    assert.equal(byId.get('b3')?.health, 'exceeded'); // 120%
  });

  it('computes service performance, unallocated expenses, lead source attribution, and MoM N/A', () => {
    const services: BusinessService[] = [
      {
        id: 'svc-1',
        ownerId: 'u1',
        companyId: 'u1',
        name: 'Industrial Automation',
        description: '',
        startingPricePaise: 50_000_00,
        estimatedDeliveryDays: 30,
        status: 'Active',
        subServices: ['SCADA'],
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    ];
    const projects = [makeProject({ id: 'p1', serviceId: 'svc-1', clientId: 'c1' })];
    const payments = [makePayment({ id: 'pay1', projectId: 'p1', clientId: 'c1', amountPaise: 80_000_00 })];
    const expenses = [
      makeExpense({ id: 'e1', serviceId: 'svc-1', amountPaise: 20_000_00 }),
      makeExpense({ id: 'e2', serviceId: '', projectId: '', amountPaise: 5_000_00 }),
    ];

    const svcPerf = computeServicePerformance({
      services,
      projects,
      projectPayments: payments,
      businessExpenses: expenses,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      basis: 'cash',
    });

    assert.equal(svcPerf.rows[0].revenuePaise, 80_000_00);
    assert.equal(svcPerf.rows[0].estimatedProfitPaise, 60_000_00);
    assert.equal(svcPerf.unallocatedExpensesPaise, 5_000_00);

    const leads: Lead[] = [
      {
        id: 'lead-1',
        ownerId: 'u1',
        companyId: 'u1',
        clientName: 'Sri Lakshmi Mills',
        businessName: '',
        phone: '',
        email: '',
        location: '',
        requirement: '',
        serviceId: 'svc-1',
        serviceCategory: 'Industrial Automation',
        leadSource: 'Referral',
        leadGeneratedDate: '2026-03-01',
        assignedPerson: '',
        estimatedBudgetPaise: 100_000_00,
        followUpDate: '',
        notes: '',
        status: 'Won',
        lostReason: '',
        archived: false,
        convertedClientId: 'c1',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    ];
    const clients: Client[] = [
      {
        id: 'c1',
        ownerId: 'u1',
        companyId: 'u1',
        clientName: 'Sri Lakshmi Mills',
        company: '',
        phone: '',
        email: '',
        address: '',
        sourceLeadId: 'lead-1',
        serviceId: 'svc-1',
        serviceCategory: 'Industrial Automation',
        clientManager: '',
        notes: '',
        status: 'Active',
        createdAt: nowTs,
        updatedAt: nowTs,
      },
    ];

    const attr = computeLeadSourceRevenue({
      leads,
      clients,
      projectPayments: payments,
      otherIncome: [makeOtherIncome({ clientId: 'c1', amountPaise: 10_000_00 })],
    });
    assert.equal(attr[0].source, 'Referral');
    assert.equal(attr[0].totalRevenuePaise, 90_000_00);

    assert.equal(computeMomChangePct(50_000_00, 0), null);
    assert.equal(formatPctOrNA(computeMomChangePct(50_000_00, 0)), 'N/A');
    assert.equal(computeMomChangePct(150, 100), 50);
  });
});
