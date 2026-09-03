import multer from "multer";
import path from "path";
import fs from "fs";

// ==========================================
// Payment Proof Upload Directory
// ==========================================

const uploadDirectory = path.join(
  process.cwd(),
  "uploads",
  "payment-proofs"
);

// ==========================================
// Create Directory Automatically
// ==========================================

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

// ==========================================
// Storage Configuration
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);

    const uniqueName =
      `payment-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, uniqueName);
  },
});

// ==========================================
// Allowed Image Types
// ==========================================

const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// ==========================================
// File Filter
// ==========================================

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed."
      )
    );
  }

  cb(null, true);
};

// ==========================================
// Multer Upload Configuration
// ==========================================

const paymentProofUpload = multer({
  storage,

  fileFilter,

  limits: {
    // Maximum 5 MB
    fileSize: 5 * 1024 * 1024,

    files: 1,
  },
});

export default paymentProofUpload;