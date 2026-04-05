const mail = require("./tools/mail.js");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

const FILES_PATH = process.env.FILES_PATH || "/Users/matthias/Documents";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || "";

let _getAuth = null;
let _saveAuth = null;

/** Called by index.js to share the auth object reference and saveAuth function */
exports.setAuthRef = function (getAuth, saveAuth) {
  _getAuth = getAuth;
  _saveAuth = saveAuth;
};

const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";

function requireAccess(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  console.log(process.env.ADMIN_EMAIL);
  if (req.session.email && req.session.email == process.env.ADMIN_EMAIL)
    return next();
  if (!req.session.user || req.session.user.priv < 1) {
    return res.status(403).json({ error: "Access denied", needsAccess: true });
  }
  next();
}

/** Resolves a user-supplied relative path against FILES_PATH, preventing traversal */
function resolveSafePath(reqPath) {
  const normalized = reqPath
    ? path.normalize(reqPath.replace(/^[/\\]+/, ""))
    : "";
  const resolved = path.join(FILES_PATH, normalized);
  if (resolved !== FILES_PATH && !resolved.startsWith(FILES_PATH + path.sep)) {
    return null;
  }
  return resolved;
}

function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
}

exports.public = function (app) {
  app.get("/config", (_req, res) => {
    res.json({
      appName: process.env.APP_NAME || "File Explorer",
      authRequired: process.env.AUTH_REQUIRED !== "false",
    });
  });
};

exports.private = function (app) {
  // User info — priv level exposed so frontend knows access state
  app.get("/user", (req, res) => {
    let priv = 0;
    priv |= req.session.user?.priv;
    if (req.session.email == process.env.ADMIN_EMAIL) priv = 1;
    res.json({
      username: req.session.username,
      email: req.session.email,
      photoUrl: req.session.photoUrl,
      priv: priv,
    });
  });

  // List directory contents
  app.get("/files", requireAccess, (req, res) => {
    const reqPath = req.query.path || "";
    const safePath = resolveSafePath(reqPath);
    if (!safePath) return res.status(400).json({ error: "Invalid path" });

    try {
      if (!fs.existsSync(safePath) || !fs.statSync(safePath).isDirectory()) {
        return res.status(404).json({ error: "Directory not found" });
      }

      const entries = fs.readdirSync(safePath, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => {
          const fullPath = path.join(safePath, e.name);
          let sizeBytes = null,
            sizeFormatted = null,
            modified = null;
          try {
            const stat = fs.statSync(fullPath);
            if (e.isFile()) {
              sizeBytes = stat.size;
              sizeFormatted = formatSize(stat.size);
            }
            modified = stat.mtime.toISOString();
          } catch {}
          return {
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
            sizeBytes,
            sizeFormatted,
            modified,
          };
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        });

      res.json({ items, path: reqPath });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to read directory" });
    }
  });

  // Download a single file
  app.get("/files/download", requireAccess, (req, res) => {
    const reqPath = req.query.path || "";
    const safePath = resolveSafePath(reqPath);
    if (!safePath) return res.status(400).json({ error: "Invalid path" });

    if (!fs.existsSync(safePath))
      return res.status(404).json({ error: "File not found" });
    if (!fs.statSync(safePath).isFile())
      return res.status(400).json({ error: "Not a file" });

    res.download(safePath);
  });

  // Zip and download an entire directory
  app.get("/files/download-all", requireAccess, (req, res) => {
    const reqPath = req.query.path || "";
    const safePath = resolveSafePath(reqPath);
    if (!safePath) return res.status(400).json({ error: "Invalid path" });

    if (!fs.existsSync(safePath))
      return res.status(404).json({ error: "Directory not found" });

    const folderName = path.basename(safePath) || "files";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${folderName}.zip"`,
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(safePath, false);
    archive.finalize();
  });

  // Request access — any authenticated user can send a request email to admin
  app.post("/access/request", async (req, res) => {
    const session = req.session;
    const email = session.email || session.username || "unknown";
    const name = session.username || email;

    if (session.user?.priv >= 1) {
      return res.json({ message: "You already have access" });
    }

    if (!ADMIN_EMAIL) {
      return res
        .status(500)
        .json({ error: "Admin email not configured. Set ADMIN_EMAIL in .env" });
    }

    const siteUrl = `${req.protocol}://${req.get("host")}`;
    const site_name = process.env.APP_NAME || "File Explorer";
    try {
      await mail.sendEmail(
        ADMIN_EMAIL,
        "File Explorer — Access Request",
        `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#3b82f6;margin-top:0">Access Request</h2>
          <p><strong>${name}</strong> (<a href="mailto:${email}">${email}</a>) is requesting access to the ${site_name}.</p>
          <p style="color:#64748b;font-size:14px">Log in at <a href="${siteUrl}">${siteUrl}</a> and use the Grant Access button, entering: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${email}</code></p>
        </div>`,
      );
      res.json({ message: "Access request sent successfully" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to send email: " + e.message });
    }
  });

  // Grant file-browser access to any email address (any user with access can do this)
  app.post("/access/grant", requireAccess, (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    const trimmed = email.trim();
    const auth = _getAuth ? _getAuth() : null;
    if (!auth)
      return res.status(500).json({ error: "Auth store not available" });

    const existingKey = Object.keys(auth).find(
      (k) => k.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existingKey) {
      auth[existingKey].priv = 1;
    } else {
      auth[trimmed] = { priv: 1, token: "" };
    }

    if (_saveAuth) _saveAuth();
    res.json({ message: `Access granted to ${trimmed}` });
  });

  // List all users and their access level
  app.get("/access/users", requireAccess, (_req, res) => {
    const auth = _getAuth ? _getAuth() : null;
    if (!auth)
      return res.status(500).json({ error: "Auth store not available" });

    const users = Object.entries(auth)
      .map(([email, data]) => ({ email, priv: data.priv || 0 }))
      .sort((a, b) => a.email.localeCompare(b.email));

    res.json({ users });
  });

  // Revoke file-browser access
  app.post("/access/revoke", requireAccess, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const auth = _getAuth ? _getAuth() : null;
    if (!auth)
      return res.status(500).json({ error: "Auth store not available" });

    const existingKey = Object.keys(auth).find(
      (k) => k.toLowerCase() === email.trim().toLowerCase(),
    );
    if (existingKey) {
      auth[existingKey].priv = 0;
      if (_saveAuth) _saveAuth();
    }

    res.json({ message: `Access revoked for ${email.trim()}` });
  });
};

exports.onLogin = function (_session) {};
