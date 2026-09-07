import express from "express";
import {
  getNotifications,
  registerFCMToken,
  unregisterFCMToken,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getNotifications);

// Admin FCM device token endpoints
router.post("/fcm-token", protect, registerFCMToken);
router.delete("/fcm-token", protect, unregisterFCMToken);

export default router;