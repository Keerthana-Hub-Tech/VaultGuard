const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path");
const { connectToDB } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// ✅ Serve index.html on root /
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ API routes
const uploadRoute = require("./routes/upload");
app.use("/upload", uploadRoute);

// ✅ Start server
const PORT = process.env.PORT || 3000;
connectToDB();
app.listen(PORT, () => {
  console.log(`✅ VaultGuard AI running on http://localhost:${PORT}`);
});
