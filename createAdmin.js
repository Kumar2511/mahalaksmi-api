import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import Admin from "./models/Admin.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const hashedPassword = await bcrypt.hash("admin123", 10);

await Admin.create({
  email: "admin@gmail.com",
  password: hashedPassword,
});

console.log("✅ Admin created successfully");

process.exit();