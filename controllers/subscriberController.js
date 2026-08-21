import Subscriber from "../models/Subscriber.js";

// ===============================
// Subscribe Email
// ===============================

export const subscribeEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid email address.",
      });
    }

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

// ===============================
// Get Subscribers
// ===============================

export const getSubscribers = async (
  req,
  res
) => {
  try {
    const subscribers =
      await Subscriber.find({})
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json({
      success: true,
      count: subscribers.length,
      subscribers,
    });
  } catch (error) {
    console.error(
      "Get Subscribers Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load subscribers.",
    });
  }
};

// ===============================
// Delete Subscriber
// ===============================

export const deleteSubscriber = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const subscriber =
      await Subscriber.findByIdAndDelete(id);

    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message:
          "Subscriber not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Subscriber deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Subscriber Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete subscriber.",
    });
  }
};