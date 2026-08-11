import mongoose from "mongoose";

const uri =
  "mongodb+srv://senthils111002_db_user:senthil2511@cluster0.ok79wxm.mongodb.net/?appName=Cluster0";

try {
  await mongoose.connect(uri);
  console.log("✅ Connected");
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}