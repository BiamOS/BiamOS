// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Routes (Barrel Re-export)
// ============================================================
// Composes sub-routers for integration management.
// Preserves the /api/integrations/* URL structure.
//
// Implementation split into:
//   - integration-crud-routes.ts   (list, create, update, delete)
//   - template-routes.ts           (templates, install, block catalog)
//   - integration-health-routes.ts (health checks, history)
//   - import-export-routes.ts      (export, import .biam packages)
// ============================================================

import { Hono } from "hono";
import { integrationCrudRoutes } from "./integration-crud-routes.js";
import { templateRoutes } from "./template-routes.js";
import { integrationHealthRoutes } from "./integration-health-routes.js";
import { importExportRoutes } from "./import-export-routes.js";

const integrationRoutes = new Hono();

// /api/integrations/health/*      — Health checks
integrationRoutes.route("/health", integrationHealthRoutes);

// /api/integrations/templates     — Template listing
// /api/integrations/install-template
// /api/integrations/install-web
// /api/integrations/suggest-blocks
// /api/integrations/block-catalog
integrationRoutes.route("/", templateRoutes);

// /api/integrations/:id/export    — Export
// /api/integrations/import        — Import
integrationRoutes.route("/", importExportRoutes);

// /api/integrations/              — CRUD (list, create)
// /api/integrations/:id           — CRUD (update, delete)
integrationRoutes.route("/", integrationCrudRoutes);

export { integrationRoutes };
