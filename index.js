// ✅ Load environment variables
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const admin = require("firebase-admin");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// -----------------------------
// 🔥 Firebase Admin Initialization
// -----------------------------
const serviceAccount = {
  type: process.env.TYPE,
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: process.env.AUTH_URI,
  token_uri: process.env.TOKEN_URI,
  auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// -----------------------------
// 🔥 Multer setup for file uploads
// -----------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage });

// -----------------------------
// 🔔 Helper: Send Notification
// -----------------------------
async function sendNotification(token, title, body, type = "chat") {
  const message = {
    token,
    notification: { title, body },
    data: { type },
    android: {
      priority: "high",
      notification: { channelId: "default_channel", sound: "default" },
    },
  };
  try {
    await admin.messaging().send(message);
    console.log(`✅ Notification sent: ${type}`);
  } catch (err) {
    console.error("❌ Error sending notification:", err);
  }
}

// -----------------------------
// ✅ Test Route
// -----------------------------
app.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;
  if (!token || !title || !body) return res.status(400).send({ error: "Missing fields" });

  await sendNotification(token, title, body);
  res.send({ success: true });
});

// -----------------------------
// ✅ Chat Notification Route (text messages)
// -----------------------------
app.post("/send-chat-notification", async (req, res) => {
  try {
    const { toUid, title, body, messageType } = req.body;
    if (!toUid || !title) return res.status(400).json({ success: false, message: "Missing fields" });

    let finalBody = body;
    if (!finalBody || finalBody.trim() === "") {
      switch (messageType) {
        case "audio": finalBody = "Sent you a voice message 🎤"; break;
        case "image": finalBody = "Sent you a photo 📷"; break;
        case "video": finalBody = "Sent you a video 🎥"; break;
        case "document": finalBody = "Sent you a document 📄"; break;
        default: finalBody = "Sent you a message 💬";
      }
    }

    const userDoc = await admin.firestore().collection("users").doc(toUid).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, message: "User not found" });

    const fcmToken = userDoc.data().deviceToken;
    if (!fcmToken) return res.status(400).json({ success: false, message: "No FCM token for user" });

    await sendNotification(fcmToken, title, finalBody, messageType || "chat");
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error sending chat notification:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------
// ✅ Upload voice/image/video/document
// -----------------------------
app.post("/upload-message", upload.single("file"), async (req, res) => {
  try {
    const { senderId, receiverId, messageType } = req.body;

    if (!req.file) return res.status(400).json({ error: "File missing" });
    if (!receiverId) return res.status(400).json({ error: "ReceiverId missing" });

    console.log("File uploaded:", req.file.filename);
    const fileUrl = `/uploads/${req.file.filename}`;

    // TODO: Save file info to DB
    console.log("Saved message to DB:", { senderId, receiverId, fileUrl, messageType });

    const userDoc = await admin.firestore().collection("users").doc(receiverId).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, message: "Receiver not found" });

    const fcmToken = userDoc.data().deviceToken;
    if (fcmToken) {
      let notificationBody;
      switch (messageType) {
        case "audio": notificationBody = "Sent you a voice message 🎤"; break;
        case "image": notificationBody = "Sent you a photo 📷"; break;
        case "video": notificationBody = "Sent you a video 🎥"; break;
        case "document": notificationBody = "Sent you a document 📄"; break;
        default: notificationBody = "Sent you a message 💬";
      }

      await sendNotification(fcmToken, "New Message", notificationBody, messageType);
    }

    res.json({ success: true, fileUrl });
  } catch (error) {
    console.error("❌ Upload/message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// -----------------------------
// 🚀 Start server
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
