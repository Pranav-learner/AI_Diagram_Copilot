import type { Project } from '@/types';

/**
 * Seed data for the mock backend. Timestamps are computed relative to a fixed
 * reference date so the dashboard shows a realistic spread of "recent" and
 * "older" projects without depending on the current clock at module load.
 */
const REFERENCE = new Date('2026-07-11T12:00:00.000Z').getTime();
const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

function iso(offsetMs: number): string {
  return new Date(REFERENCE - offsetMs).toISOString();
}

export const SEED_PROJECTS: Project[] = [
  {
    id: 'prj_a1b2c3',
    title: 'Microservices Architecture',
    description:
      'High-level service topology for the payments platform, including gateways and message queues.',
    createdAt: iso(30 * DAY),
    updatedAt: iso(2 * HOUR),
    thumbnailUrl: null,
  },
  {
    id: 'prj_d4e5f6',
    title: 'Onboarding User Flow',
    description: 'End-to-end signup and activation flow with branching states.',
    createdAt: iso(21 * DAY),
    updatedAt: iso(1 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_g7h8i9',
    title: 'Database ERD — Billing',
    description: 'Entity relationship diagram for invoices, subscriptions, and line items.',
    createdAt: iso(18 * DAY),
    updatedAt: iso(3 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_j1k2l3',
    title: 'CI/CD Pipeline',
    description: 'Build, test, and deploy stages across staging and production environments.',
    createdAt: iso(45 * DAY),
    updatedAt: iso(5 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_m4n5o6',
    title: 'Network Topology',
    description: 'VPC layout with subnets, load balancers, and security groups.',
    createdAt: iso(60 * DAY),
    updatedAt: iso(12 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_p7q8r9',
    title: 'State Machine — Orders',
    description: 'Order lifecycle from cart to fulfillment with cancellation paths.',
    createdAt: iso(90 * DAY),
    updatedAt: iso(40 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_s1t2u3',
    title: 'Team Org Chart',
    description: 'Engineering organization structure across squads and chapters.',
    createdAt: iso(120 * DAY),
    updatedAt: iso(65 * DAY),
    thumbnailUrl: null,
  },
  {
    id: 'prj_v4w5x6',
    title: 'Event-Driven Architecture',
    description: 'Producers, consumers, and topics for the analytics ingestion system.',
    createdAt: iso(15 * DAY),
    updatedAt: iso(6 * HOUR),
    thumbnailUrl: null,
  },
];
