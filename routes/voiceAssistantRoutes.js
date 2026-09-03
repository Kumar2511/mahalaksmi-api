import express from "express";

import {
  getVoiceAssistantContextController,
  parseVoiceCommandController,
  executeVoiceCommandController,
} from "../controllers/voiceAssistantController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| LIVE ASSISTANT CONTEXT
|--------------------------------------------------------------------------
|
| GET /api/voice-assistant/context
|
| Reads the current product catalog.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/context",
  protect,
  admin,
  getVoiceAssistantContextController
);

/*
|--------------------------------------------------------------------------
| PARSE VOICE COMMAND
|--------------------------------------------------------------------------
|
| POST /api/voice-assistant/parse
|
| READ ONLY.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/parse",
  protect,
  admin,
  parseVoiceCommandController
);

/*
|--------------------------------------------------------------------------
| EXECUTE VOICE COMMAND
|--------------------------------------------------------------------------
|
| POST /api/voice-assistant/execute
|
| This actually modifies MongoDB.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/execute",
  protect,
  admin,
  executeVoiceCommandController
);

export default router;