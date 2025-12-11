// ==============================================
// 🔥 WHISP NOTIFICATION SERVER — DEBUG VERSION
// ==============================================

// 1) Load environment variables
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
// 🌍 Root Route
// -----------------------------
app.get("/", (req, res) => {
  res.send("🔥 Whisp Notify Server Running (DEBUG MODE ENABLED)");
});

// -----------------------------
// 📂 Public uploads folder
// -----------------------------
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -----------------------------
// 🛠 Firebase Admin Initialization (DEBUG)
// -----------------------------

console.log("🔧 DEBUG: Validating Firebase Admin ENV variables...");
console.log({
  project_id: process.env.PROJECT_ID,
  client_email: process.env.CLIENT_EMAIL,
  private_key_exists: !!process.env.PRIVATE_KEY
});

// IMPORTANT: MUST convert newline escapes to real newlines
let fixedPrivateKey = process.env.PRIVATE_KEY?.replace(/\\n/g, "\n");

try {
  const serviceAccount = {
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: fixedPrivateKey,
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

  console.log("✅ Firebase Admin Initialized Successfully");
} catch (err) {
  console.error("❌ Firebase Admin Initialization Failed:", err);
}

// -----------------------------
// 📁 Multer (for uploads)
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
  console.log("📨 DEBUG Sending Notification:", { token, title, body, type });

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
    const response = await admin.messaging().send(message);
    console.log("✅ Notification Sent Successfully:", response);
    return true;
  } catch (err) {
    console.error("❌ Notification Send Failed:", err);
    return false;
  }
}

// -----------------------------
// 📌 POST /send-notification
// -----------------------------
app.post("/send-notification", async (req, res) => {
  console.log("📥 DEBUG Request → /send-notification:", req.body);

  const { token, title, body } = req.body;
  if (!token || !title || !body)
    return res.status(400).send({ error: "Missing fields" });

  const ok = await sendNotification(token, title, body);

  res.send({ success: ok });
});

// -----------------------------
// 📌 POST /send-chat-notification
// -----------------------------
app.post("/send-chat-notification", async (req, res) => {
  console.log("📥 DEBUG Request → /send-chat-notification:", req.body);

  try {
    const { toUid, title, body, messageType } = req.body;

    if (!toUid || !title)
      return res.status(400).json({ success: false, message: "Missing fields" });

    let finalBody = body || "";
    if (finalBody.trim() === "") {
      finalBody =
        {
          audio: "Sent you a voice message 🎤",
          image: "Sent you a photo 📷",
          video: "Sent you a video 🎥",
          document: "Sent you a document 📄",
        }[messageType] || "Sent you a message 💬";
    }

    const userDoc = await admin.firestore().collection("users").doc(toUid).get();
    console.log("📄 DEBUG Firestore user lookup:", userDoc.exists);

    if (!userDoc.exists)
      return res.status(404).json({ success: false, message: "User not found" });

    const fcmToken = userDoc.data().deviceToken;
    console.log("📱 DEBUG User FCM Token:", fcmToken);

    if (!fcmToken)
      return res.status(400).json({ success: false, message: "User has no FCM token" });

    const ok = await sendNotification(fcmToken, title, finalBody, messageType);

    res.json({ success: ok });
  } catch (error) {
    console.error("❌ CHAT Notification Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------
// 📌 Upload endpoint
// -----------------------------
app.post("/upload-message", upload.single("file"), async (req, res) => {
  console.log("📥 DEBUG Upload:", req.file);

  try {
    const { senderId, receiverId, messageType } = req.body;

    if (!req.file) return res.status(400).json({ error: "Missing file" });
    if (!receiverId) return res.status(400).json({ error: "Missing receiverId" });

    const fileUrl = `/uploads/${req.file.filename}`;
    console.log("📄 DEBUG File URL:", fileUrl);

    const userDoc = await admin.firestore().collection("users").doc(receiverId).get();
    if (!userDoc.exists)
      return res.status(404).json({ success: false, message: "Receiver not found" });

    const fcmToken = userDoc.data().deviceToken;

    let messageBody =
      {
        audio: "Sent you a voice message 🎤",
        image: "Sent you a photo 📷",
        video: "Sent you a video 🎥",
        document: "Sent you a document 📄",
      }[messageType] || "Sent you a message 💬";

    if (fcmToken) {
      await sendNotification(fcmToken, "New Message", messageBody, messageType);
    }

    res.json({ success: true, fileUrl });
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------
// 🚀 Start Server
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Whisp Backend Running on port ${PORT}`);
});
