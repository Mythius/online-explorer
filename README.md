# Online Explorer

A self-hosted file explorer web app. Browse, preview, and download files from a configured directory on your server, protected by Google or Microsoft OAuth (or a CAS auth server).

## Features

- Browse folders and files with a clean desktop + mobile UI
- Preview images, video, audio, PDFs, and text/code files in-browser
- Navigate previews with swipe (mobile), arrow keys (desktop), or prev/next buttons
- Download individual files or an entire folder as a ZIP
- Access control: grant or revoke access to users by email
- Request access email sent to admin when an unauthenticated user asks
- Optional auth bypass (`AUTH_REQUIRED=false`) for private/internal deployments

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a `.env` file

Copy the example below and fill in the values for your environment:

```env
# ── Files ────────────────────────────────────────────────────────────────────
# Absolute path to the directory you want to expose
FILES_PATH=/home/user/Documents

# Display name shown in the browser tab and header
APP_NAME=My Files

# ── Auth ─────────────────────────────────────────────────────────────────────
# Set to false to disable all authentication (no login required)
# Useful for internal/private networks. Omit or set to true to require login.
AUTH_REQUIRED=true

# ── Admin ────────────────────────────────────────────────────────────────────
# Email address that receives access request notifications
ADMIN_EMAIL=you@example.com

# ── Email (for access request notifications) ─────────────────────────────────
# Gmail credentials for sending access request emails
GMAIL_USER=you@gmail.com
GMAIL_PASS=your_gmail_app_password

# ── Google OAuth (direct, without CAS) ───────────────────────────────────────
# Required only if NOT using a CAS server for auth
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/callback/google

# ── Microsoft OAuth (direct, without CAS) ────────────────────────────────────
# Required only if NOT using a CAS server for auth
MS_CLIENT_ID=your_ms_client_id
MS_CLIENT_SECRET=your_ms_client_secret
MS_REDIRECT_URI=https://yourdomain.com/auth/callback/microsoft

# ── CAS Server (optional) ────────────────────────────────────────────────────
# If set, Google/Microsoft OAuth is delegated to a central auth server (CAS)
# instead of handled locally. The other OAuth vars above are not needed.
CAS_SERVER_URL=https://cas.example.com
CAS_CLIENT_ID=default
CAS_CALLBACK_URL=https://yourdomain.com/auth/callback/cas

# ── Server ───────────────────────────────────────────────────────────────────
PORT=80
```

### 3. Run the server

```bash
node index.js
```

## Auth modes

| Scenario | Config |
|---|---|
| No auth (open/internal) | `AUTH_REQUIRED=false` |
| Google + Microsoft OAuth locally | Set `GOOGLE_CLIENT_SECRET`, `MS_CLIENT_ID`, etc. |
| Delegate OAuth to a CAS server | Set `CAS_SERVER_URL` + `CAS_CLIENT_ID` + `CAS_CALLBACK_URL` |

## Access control

When `AUTH_REQUIRED=true`, users who sign in are denied access by default (`priv=0`). An admin with access can grant or revoke access from the **Manage Access** panel in the UI, or users can click **Request Access** to email the admin.

Access state is stored in `auth.json` in the project root.
