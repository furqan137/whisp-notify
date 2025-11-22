const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const app = express();
app.use(bodyParser.json());

// ✅ Path to your Firebase Admin SDK JSON key file
const serviceAccount = require("./serviceAccountkey.json");

// ✅ Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✅ Test Route
app.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;

  if (!token || !title || !body) {
    return res.status(400).send({ error: "Missing required fields" });
  }

  const message = {
    notification: { title, body },
    token,
  };

  try {
    await admin.messaging().send(message);
    console.log("✅ Test notification sent successfully!");
    res.send({ success: true });
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    res.status(500).send({ error: "Failed to send notification" });
  }
});

// ✅ Chat Notification Route
app.post("/send-chat-notification", async (req, res) => {
  try {
    const { toUid, title, body } = req.body;

    if (!toUid || !title || !body) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 🔹 Fetch recipient’s device token from Firestore
    const userDoc = await admin.firestore().collection("users").doc(toUid).get();
    if (!userDoc.exists) {
      console.log("⚠️ No user found with UID:", toUid);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const fcmToken = userDoc.data().deviceToken; // ✅ FIXED LINE
    if (!fcmToken) {
      console.log("⚠️ No FCM token for user:", toUid);
      return res.status(400).json({ success: false, message: "User has no FCM token" });
    }

    // 🔹 Create notification payload
    const message = {
      notification: { title, body },
      token: fcmToken,
      data: {
        type: "chat",
        sender: title,
      },
    };

    // 🔹 Send notification
    await admin.messaging().send(message);
    console.log(`💬 Chat notification sent to UID: ${toUid}`);

    return res.json({ success: true });
  } catch (error) {
    console.error("❌ Error sending chat notification:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Run server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
