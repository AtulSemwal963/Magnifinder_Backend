
// src/domains/credentials/routes/credentials.routes.ts

import { Router } from "express";

import {
  credentialsController,
} from "../controllers/credentials.controller.js";

import {
  requireAuth,
} from "../../../middleware/auth.middleware.js";

const router = Router();

/**
 * POST /api/v1/credentials
 *
 * Create a provider credential for the authenticated user.
 */
router.post(
  "/",
  requireAuth,
  (req, res, next) =>
    credentialsController.createCredential(
      req,
      res,
      next
    )
);

/**
 * GET /api/v1/credentials
 *
 * Get all provider credentials belonging
 * to the authenticated user.
 *
 * API keys are never returned.
 */
router.get(
  "/",
  requireAuth,
  (req, res, next) =>
    credentialsController.getCredentials(
      req,
      res,
      next
    )
);

/**
 * GET /api/v1/credentials/:provider
 *
 * Get metadata for one provider credential.
 *
 * The decrypted API key is never returned.
 */
router.get(
  "/:provider",
  requireAuth,
  (req, res, next) =>
    credentialsController.getCredential(
      req,
      res,
      next
    )
);

/**
 * PATCH /api/v1/credentials/:provider
 *
 * Update a provider credential.
 *
 * A new API key is encrypted before being persisted.
 */
router.patch(
  "/:provider",
  requireAuth,
  (req, res, next) =>
    credentialsController.updateCredential(
      req,
      res,
      next
    )
);

/**
 * DELETE /api/v1/credentials/:provider
 *
 * Delete a provider credential belonging
 * to the authenticated user.
 */
router.delete(
  "/:provider",
  requireAuth,
  (req, res, next) =>
    credentialsController.deleteCredential(
      req,
      res,
      next
    )
);

export default router;

