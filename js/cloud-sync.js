/* ============================================================
   Cloud sync — BerryStudio-Upgrade-Plan WP-18.
   Local-first stays the default forever: nothing here runs unless the user
   explicitly turns on Settings → Cloud Sync AND configures a target.
   Never requires an account with BerryStudio itself — every target is
   either the user's own server, or the user's own OAuth app registration
   with their own cloud account, the same "bring your own credential"
   honesty as WP-1's AI provider keys (see js/ai-keystore.js).

   Three targets:
   - selfHosted: a plain fetch PUT/GET against a URL the user runs. Fully
     first-party, no external dependency, no OAuth.
   - googleDrive: Google Identity Services token client (loaded from
     accounts.google.com only when this target is used) + the Drive REST
     API's `drive.file` scope — BerryStudio can only see files it creates
     itself, never the user's whole Drive.
   - oneDrive: MSAL.js (loaded from Microsoft's own CDN only when this
     target is used) + the Microsoft Graph REST API's `Files.ReadWrite.AppFolder`
     permission — confined to a dedicated per-app folder, same minimal-scope
     principle as the Drive target.

   Bearer tokens/access tokens are never written to `state`/localStorage's
   "pps" blob — they live only in memory for the life of the tab (Drive/
   OneDrive access tokens are short-lived anyway) or in KeyStore's existing
   sessionStorage tier (the self-hosted endpoint's optional auth token),
   exactly like an AI provider key.
   ============================================================ */
import { KeyStore } from './ai-keystore.js';

const SYNC_TOKEN_ID = 'sync-endpoint';

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------- Self-hosted endpoint ----------------
export const SelfHostedSync = {
  setToken(token) { if (token) KeyStore.set(SYNC_TOKEN_ID, token); else KeyStore.clearSession(SYNC_TOKEN_ID); },
  getToken() { return KeyStore.get(SYNC_TOKEN_ID) || ''; },

  async save(url, payload) {
    if (!url) throw new Error('No sync endpoint configured');
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders(this.getToken()) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Server responded ${res.status} ${res.statusText}`);
    return true;
  },

  async load(url) {
    if (!url) throw new Error('No sync endpoint configured');
    const res = await fetch(url, { headers: { ...authHeaders(this.getToken()) } });
    if (!res.ok) throw new Error(`Server responded ${res.status} ${res.statusText}`);
    return res.json();
  },
};

// ---------------- Google Drive (drive.file scope) ----------------
let gisLoaded = null;
function loadGis() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

const DRIVE_FILE_NAME = 'berrystudio-project.json';
let driveAccessToken = null;
let driveFileIdCache = null;

export const GoogleDriveSync = {
  isConnected() { return !!driveAccessToken; },

  async connect(clientId) {
    if (!clientId) throw new Error('No Google OAuth client ID configured');
    const google = await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          driveAccessToken = resp.access_token;
          resolve(true);
        },
      });
      client.requestAccessToken();
    });
  },

  async findFileId() {
    if (driveFileIdCache) return driveFileIdCache;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE_NAME}'&spaces=drive&fields=files(id)`,
      { headers: authHeaders(driveAccessToken) }
    );
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json();
    driveFileIdCache = data.files && data.files[0] ? data.files[0].id : null;
    return driveFileIdCache;
  },

  async save(payload) {
    if (!driveAccessToken) throw new Error('Not connected to Google Drive');
    const id = await this.findFileId();
    const body = JSON.stringify(payload);
    const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
    const boundary = 'berrystudio-boundary';
    const multipartBody =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const url = id
      ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const res = await fetch(url, {
      method: id ? 'PATCH' : 'POST',
      headers: { ...authHeaders(driveAccessToken), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    });
    if (!res.ok) throw new Error(`Drive save failed: ${res.status}`);
    const data = await res.json();
    driveFileIdCache = data.id;
    return true;
  },

  async load() {
    if (!driveAccessToken) throw new Error('Not connected to Google Drive');
    const id = await this.findFileId();
    if (!id) throw new Error('No BerryStudio project found in Drive yet');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: authHeaders(driveAccessToken),
    });
    if (!res.ok) throw new Error(`Drive load failed: ${res.status}`);
    return res.json();
  },
};

// ---------------- Microsoft OneDrive (Files.ReadWrite.AppFolder) ----------------
let msalLoaded = null;
function loadMsal() {
  if (msalLoaded) return msalLoaded;
  msalLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://alcdn.msauth.net/browser/3.7.1/js/msal-browser.min.js';
    s.onload = () => resolve(window.msal);
    s.onerror = () => reject(new Error('Failed to load MSAL.js'));
    document.head.appendChild(s);
  });
  return msalLoaded;
}

let msalInstance = null;
let oneDriveAccessToken = null;
const ONEDRIVE_SCOPES = ['Files.ReadWrite.AppFolder'];

export const OneDriveSync = {
  isConnected() { return !!oneDriveAccessToken; },

  async connect(clientId) {
    if (!clientId) throw new Error('No Microsoft OAuth client ID configured');
    const msal = await loadMsal();
    msalInstance = new msal.PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/consumers' },
    });
    await msalInstance.initialize();
    const result = await msalInstance.loginPopup({ scopes: ONEDRIVE_SCOPES });
    oneDriveAccessToken = result.accessToken;
    return true;
  },

  async save(payload) {
    if (!oneDriveAccessToken) throw new Error('Not connected to OneDrive');
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/drive/special/approot:/berrystudio-project.json:/content',
      { method: 'PUT', headers: { ...authHeaders(oneDriveAccessToken), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error(`OneDrive save failed: ${res.status}`);
    return true;
  },

  async load() {
    if (!oneDriveAccessToken) throw new Error('Not connected to OneDrive');
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/drive/special/approot:/berrystudio-project.json:/content',
      { headers: authHeaders(oneDriveAccessToken) }
    );
    if (!res.ok) throw new Error(`OneDrive load failed: ${res.status}`);
    return res.json();
  },
};
