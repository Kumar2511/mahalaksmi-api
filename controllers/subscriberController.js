import Subscriber from "../models/Subscriber.js";

// ===============================
// Subscribe Email
// ===============================

export const subscribeEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Check existing subscriber
    const existingSubscriber =
      await Subscriber.findOne({
        email: normalizedEmail,
      });

    if (existingSubscriber) {
      return res.status(409).json({
        success: false,
        message:
          "This email is already subscribed.",
      });
    }

    // Create subscriber
    const subscriber =
      await Subscriber.create({
        email: normalizedEmail,
      });

    return res.status(201).json({
      success: true,
      message:
        "You're now a VIP subscriber!",
      subscriber,
    });
  } catch (error) {
    console.error(
      "Subscribe Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to subscribe. Please try again.",
    });
  }
};