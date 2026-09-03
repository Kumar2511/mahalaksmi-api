import {
  parseVoiceCommand,
  executeVoiceCommand,
  getVoiceAssistantContext,
} from "../services/voiceCommandService.js";

/*
|--------------------------------------------------------------------------
| GET LIVE VOICE ASSISTANT CONTEXT
|--------------------------------------------------------------------------
*/

export const getVoiceAssistantContextController =
  async (req, res) => {
    try {
      const result =
        await getVoiceAssistantContext();

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        "Voice Context Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Unable to load live product information.",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| PARSE VOICE COMMAND
|--------------------------------------------------------------------------
*/

export const parseVoiceCommandController =
  async (req, res) => {
    try {
      const {
        transcript,
      } = req.body;

      if (
        !transcript ||
        typeof transcript !==
          "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Voice transcript is required.",
        });
      }

      const result =
        await parseVoiceCommand(
          transcript
        );

      if (!result.success) {
        return res
          .status(400)
          .json(result);
      }

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        "Voice Parse Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Unable to process voice command.",
      });
    }
  };

/*
|--------------------------------------------------------------------------
| EXECUTE VOICE COMMAND
|--------------------------------------------------------------------------
*/

export const executeVoiceCommandController =
  async (req, res) => {
    try {
      const {
        productId,
        action,
        amount,
      } = req.body;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message:
            "Product ID is required.",
        });
      }

      if (!action) {
        return res.status(400).json({
          success: false,
          message:
            "Voice action is required.",
        });
      }

      const result =
        await executeVoiceCommand({
          productId,
          action,
          amount,
        });

      return res.status(200).json({
        success: true,

        message: `${result.product.name} stock updated successfully.`,

        product: {
          _id:
            result.product._id,

          name:
            result.product.name,

          stock:
            result.product.stock,
        },

        change: {
          oldStock:
            result.oldStock,

          newStock:
            result.newStock,
        },
      });
    } catch (error) {
      console.error(
        "Voice Execute Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Unable to execute voice command.",
      });
    }
  };