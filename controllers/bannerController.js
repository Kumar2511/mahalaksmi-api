import Banner from "../models/Banner.js";

// ==========================
// Get All Banners
// ==========================
export const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      banners,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ==========================
// Get Active Hero Banners
// ==========================
export const getHeroBanner = async (req, res) => {
  try {
    const banners = await Banner.find({
      type: "Hero",
      active: true,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};// ==========================
// Get Single Banner
// ==========================
export const getBanner = async (req, res) => {
  try {

    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      banner,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ==========================
// Create Banner
// ==========================
export const createBanner = async (req, res) => {
  try {

    const banner = await Banner.create(req.body);

    res.status(201).json({
      success: true,
      banner,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ==========================
// Update Banner
// ==========================
export const updateBanner = async (req, res) => {
  try {

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      banner,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ==========================
// Delete Banner
// ==========================
export const deleteBanner = async (req, res) => {
  try {

    const banner = await Banner.findByIdAndDelete(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Banner deleted successfully",
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};