import express from "express";

import {
  subscribeEmail,
} from "../controllers/subscriberController.js";

const router = express.Router();

// Subscribe
router.post("/", subscribeEmail);

export default router;