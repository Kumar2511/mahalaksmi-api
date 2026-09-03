import express from "express";

import {
  getInvoiceSettings,
  updateInvoiceSettings,
} from "../controllers/invoiceSettingsController.js";

const router = express.Router();

// GET invoice settings
router.get("/", getInvoiceSettings);

// UPDATE invoice settings
router.put("/", updateInvoiceSettings);

export default router;