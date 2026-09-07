import admin from "firebase-admin";
import AdminDeviceToken from "../models/AdminDeviceToken.js";

let fcmInitialized = false;

function initFirebase() {
  if (fcmInitialized) return true;
  if (admin.apps.length > 0) {
    fcmInitialized = true;
    return true;
  }

  try {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    let credential = null;

    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      credential = admin.credential.cert(serviceAccount);
    } else if (projectId && clientEmail && privateKeyRaw) {
      const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
      credential = admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      });
    }

    if (credential) {
      admin.initializeApp({ credential });
      fcmInitialized = true;
      console.log("✅ Firebase Admin SDK initialized successfully");
      return true;
    } else {
      console.warn(
        "⚠️ Firebase Admin SDK credentials not configured in environment variables."
      );
      return false;
    }
  } catch (error) {
    console.error("❌ Firebase Admin SDK initialization error:", error.message);
    return false;
  }
}

/**
 * Dispatch FCM native push notification to registered Admin devices.
 * Safely fails without breaking caller operations.
 */
export async function sendAdminPushNotification({ title, message, link, data = {} }) {
  try {
    const isReady = initFirebase();
    if (!isReady) {
      return { success: false, reason: "FCM_NOT_CONFIGURED" };
    }

    const deviceRecords = await AdminDeviceToken.find();
    if (!deviceRecords || deviceRecords.length === 0) {
      return { success: true, deliveredCount: 0 };
    }

    const tokens = deviceRecords.map((d) => d.token).filter(Boolean);
    if (tokens.length === 0) return { success: true, deliveredCount: 0 };

    const payload = {
      tokens,
      notification: {
        title: title || "The Girl House Admin",
        body: message || "",
      },
      data: {
        link: link || "/admin",
        title: title || "",
        message: message || "",
        ...data,
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "admin_notifications",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(payload);

    // Prune invalid or expired tokens safely
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await AdminDeviceToken.deleteMany({ token: { $in: invalidTokens } });
    }

    return {
      success: true,
      deliveredCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("❌ Send Admin Push Notification Error:", error.message);
    return { success: false, error: error.message };
  }
}
