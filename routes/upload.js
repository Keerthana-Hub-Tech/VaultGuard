const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const cloudinary = require("cloudinary").v2;
const { getDB } = require("../db");

const upload = multer();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// 🔐 Upload and encrypt a file
router.post("/file", upload.single("file"), async (req, res) => {
  const fileBuffer = req.file?.buffer;
  const uid = req.body?.uid;

  if (!uid || !fileBuffer) {
    return res.status(400).json({ error: "Missing UID or file" });
  }

  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);

  cloudinary.uploader.upload_stream({ resource_type: "raw" }, async (error, result) => {
    if (error) {
      console.error("Cloudinary error:", error);
      return res.status(500).json({ error: "Cloudinary upload failed" });
    }

    const db = getDB();
    await db.collection("vaults").insertOne({
      uid,
      url: result.secure_url,
      key: key.toString("base64"),
      iv: iv.toString("base64"),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedAt: new Date()
    });

    res.json({
      url: result.secure_url,
      key: key.toString("base64"),
      iv: iv.toString("base64")
    });
  }).end(encrypted);
});

// 📁 Get all uploaded files for a user
router.get("/myvault/:uid", async (req, res) => {
  const uid = req.params.uid;
  if (!uid) return res.status(400).json({ error: "Missing UID" });

  const db = getDB();
  const files = await db.collection("vaults").find({ uid }).sort({ uploadedAt: -1 }).toArray();
  res.json(files);
});

// 📥 Download and decrypt a file by ID
router.get("/download/:id", async (req, res) => {
  const fileId = req.params.id;
  const db = getDB();

  const fileEntry = await db.collection("vaults").findOne({ _id: new ObjectId(fileId) });

  if (!fileEntry) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const response = await axios.get(fileEntry.url, { responseType: "arraybuffer" });
    const encryptedData = Buffer.from(response.data);

    const key = Buffer.from(fileEntry.key, "base64");
    const iv = Buffer.from(fileEntry.iv, "base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    res.set({
      "Content-Disposition": `attachment; filename="${fileEntry.originalName || 'VaultFile'}"`,
      "Content-Type": fileEntry.mimeType || "application/octet-stream"
    });

    res.send(decrypted);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Decryption or download failed" });
  }
});

module.exports = router;