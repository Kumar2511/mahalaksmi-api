import express from "express";
import multer from "multer";
import { uploadMedia } from "../controllers/uploadController.js";

const router = express.Router();

const upload = multer({
  dest: "uploads/",
});

router.post(
  "/",
  upload.single("image"),
  uploadMedia
);

export default router;