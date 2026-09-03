import Razorpay from "razorpay";

let razorpayInstance = null;

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret && !keyId.includes("xxxx")) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  } catch (err) {
    console.warn("Razorpay SDK initialization deferred (Missing valid credentials):", err.message);
  }
}

export default razorpayInstance;