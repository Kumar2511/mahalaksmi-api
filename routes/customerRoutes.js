import express from "express";
import {
  getCustomers,
  getCustomer,
} from "../controllers/customerController.js";

const router = express.Router();

// Get all customers
router.get("/", getCustomers);

// Get single customer by phone
router.get("/:phone", getCustomer);

export default router;