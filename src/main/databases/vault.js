'use strict';

/**
 * Secret vault for database credentials.
 *
 * Preference order:
 *   1. Electron safeStorage (OS keyring — libsecret / Keychain / DPAPI).
 *   2. AES-256-GCM with a random key stored in the app profile (mode 0600).
 *
 * Ciphertext strings are self-describing (`v1:safe:...` / `v1:aes:...`) so a
 * profile remains readable when the backend changes.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFIX = 'v1';

function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort on exotic filesystems */ }
}

function readKey(file) {
  try {
    const key = fs.readFileSync(file);
    if (key.length === 32) return key;
  } catch { /* create below */ }
  const key = crypto.randomBytes(32);
  writePrivate(file, key);
  return key;
}

class SecretVault {
  constructor(app, options = {}) {
    this.app = app;
    this.keyFile = path.join(app.getPath('userData'), options.keyFile || 'databases.secret');
    this.key = null;
    this.safeStorage = null;
    try {
      // Electron is only present in the main process. Plain Node tests fall
      // back to the AES implementation automatically.
      const electron = require('electron');
      if (electron && electron.safeStorage) this.safeStorage = electron.safeStorage;
    } catch { /* plain Node */ }
  }

  safeAvailable() {
    try {
      if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) return false;
      // Chromium's Linux fallback ("basic_text") is obfuscation with a
      // hard-coded key, not real protection. Prefer the AES vault instead.
      if (typeof this.safeStorage.getSelectedStorageBackend === 'function') {
        const backend = String(this.safeStorage.getSelectedStorageBackend() || '');
        if (backend === 'basic_text' || backend === 'unknown') return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  backend() {
    return this.safeAvailable() ? 'os-keyring' : 'aes-256-gcm';
  }

  aesKey() {
    if (!this.key) this.key = readKey(this.keyFile);
    return this.key;
  }

  encrypt(plain) {
    const text = String(plain ?? '');
    if (!text) return '';
    if (this.safeAvailable()) {
      try {
        return `${PREFIX}:safe:${this.safeStorage.encryptString(text).toString('base64')}`;
      } catch { /* fall through to AES */ }
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.aesKey(), iv);
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}:aes:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
  }

  decrypt(value) {
    const text = String(value ?? '');
    if (!text) return '';
    const parts = text.split(':');
    if (parts[0] !== PREFIX || parts.length < 3) throw new Error('Unknown secret format');
    if (parts[1] === 'safe') {
      if (!this.safeStorage) throw new Error('OS secure storage is unavailable');
      return this.safeStorage.decryptString(Buffer.from(parts[2], 'base64'));
    }
    if (parts[1] === 'aes' && parts.length === 5) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey(), Buffer.from(parts[2], 'base64'));
      decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64')), decipher.final()]).toString('utf8');
    }
    throw new Error('Unknown secret format');
  }

  /** Re-encrypt with the currently preferred backend (used after keyring unlock). */
  reencrypt(value) {
    return this.encrypt(this.decrypt(value));
  }
}

module.exports = { SecretVault, writePrivate };
