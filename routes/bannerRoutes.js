import express from "express";

import {
  getBanners,
  getHeroBanner,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../controllers/bannerController.js";

const router = express.Router();

router.get("/", getBanners);

// IMPORTANT: Keep this before "/:id"
router.get("/hero", getHeroBanner);

router.get("/:id", getBanner);

router.post("/", createBanner);

router.put("/:id", updateBanner);

router.delete("/:id", deleteBanner);

export default router;