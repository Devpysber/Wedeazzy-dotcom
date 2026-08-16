const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');

const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Extension is derived ONLY from the validated mimetype, never from the
// client-supplied original filename. Trusting the filename's extension (even
// after checking Content-Type) lets an attacker name a file "x.svg"/"x.html",
// forge Content-Type: image/png, and have it stored + served as
// uuid.svg/uuid.html — a stored-XSS vector via same-origin static uploads.
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = Object.prototype.hasOwnProperty.call(MIME_TO_EXT, file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG or WebP images allowed'), ok);
  },
});

const router = express.Router();

// Auth-only. Returns a public URL for the uploaded file.
router.post('/photo', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, code: 'ERR_NO_FILE', message: 'No file' });
  const publicUrl = `${env.PUBLIC_BASE_URL}/api/uploads/${req.file.filename}`;
  res.json({ ok: true, url: publicUrl, size: req.file.size });
});

module.exports = router;
