/**
 * Test fixtures for the Document Intelligence Engine — representative documents
 * (architecture doc, PRD, README) exercised across the suite.
 */

export const ARCHITECTURE_DOC = `---
title: Payments Architecture
tags: [payments, backend]
---

# Payments Architecture

## Overview

The **API Gateway** routes external requests to internal services.

## Components

- The Orders Service depends on the Postgres Database.
- The Billing Service uses Redis for caching.
- API Gateway calls Auth Service.

| Component | Purpose |
| --- | --- |
| Orders Service | Manage orders |
| Billing Service | Handle payments |

## Requirements

- The system shall authenticate all requests.
- Users must be able to view their order history.
- The API should respond within 200ms.

## Decisions

We decided to use PostgreSQL for durability. Status: Accepted.

## Risks

- The Database is a single point of failure.

## Constraints

- The system must comply with PCI-DSS.

## Assumptions

- Assumption: traffic will stay under 1000 rps.
`;

export const README_DOC = `# Acme CLI

A command-line tool for managing Acme resources.

## Installation

\`\`\`bash
npm install -g acme-cli
\`\`\`

## Usage

Run \`acme deploy\` to deploy. See [the docs](https://acme.dev/docs).

## Contributing

Pull requests welcome.
`;

export const PRD_DOC = `# Product Requirements: Notifications

## Goals

- Increase user engagement.
- Deliver notifications reliably.

## User Stories

- As a user, I must receive an email when my order ships.
- As an admin, I should be able to configure notification templates.

## Out of Scope

- SMS notifications.
`;
