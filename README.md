# NSO Backend (Admin + Mobile API)

Node.js/Express backend for the NSO mobile system and admin panel. It manages user accounts, activation keys (12‑digit), data sync, and analytics. Uses MongoDB via Mongoose.

## Features
- User management and authentication
- 12‑digit activation key lifecycle (create, list, revoke)
- Offline validation support: encrypted user payload with AES‑256‑CBC
- Activity and analytics endpoints for admin dashboard
- Hardened with helmet, CORS, rate limiting, and logging

## Tech stack
- Runtime: Node.js >= 16
- Framework: Express
- Database: MongoDB (Mongoose)
- Auth: JWT (for normal routes), simple admin guard for admin routes
- Logging: morgan, winston

## Project structure (key folders)
- `server.js` – app bootstrap
- `routes/` – Express routes (including `routes/admin.js`)
- `models/` – Mongoose models (e.g., `ActivationKey.js`)
- `services/` – business logic (e.g., `activationKeyService.js`)
- `middleware/` – auth and validation
- `scripts/` – utilities (seeders, key generators)

## Environment variables
Create a `.env` file in `backend/` (or set env vars in your hosting):

- `PORT` – server port (default: 5000)
- `MONGODB_URI` – MongoDB connection string
- `JWT_SECRET` – secret for JWT auth
- `LOG_LEVEL` – winston log level (default: info)
- `ENCRYPTION_KEY` – generic encryption key used elsewhere (default present)
- `ACTIVATION_KEY_SECRET` – secret used to derive 32‑byte key for activation payload encryption. Must match the mobile app expectation. Default fallback: `nso-activation-key-2024`

Notes:
- For offline validation, the backend derives a 32‑byte key via: `Buffer.from(secret.padEnd(32, '0').slice(0, 32), 'utf8')` and uses AES‑256‑CBC with a random 16‑byte IV. The IV (hex) is prefixed to ciphertext (hex) before storage. The mobile app uses CryptoJS with the same scheme to decrypt offline.

## Getting started

1) Install dependencies

```bash
cd backend
npm install
```

2) Configure environment

```bash
cp .env.example .env   # if available, otherwise create .env based on the vars above
```

3) Run the server (dev)

```bash
npm run dev
```

Server will listen on `http://localhost:5000` (unless overridden by env).

4) Run tests

```bash
npm test
```

## Activation keys – overview

- Key format: 12‑digit numeric string (e.g., `123456789012`).
- Model: `models/ActivationKey.js`
- Status lifecycle: `unused` -> `used` or `revoked`, and can become `expired` after `expiresAt`.
- Hashing: `keyHash = sha256(key)` stored in DB; original key is present but also hashed for fast lookup.
- Offline payload: user details encrypted and stored in `encryptedUserData` using AES‑256‑CBC.

### API (Admin)
Base path: `/api/v1/admin`

Create new activation key
- POST `/activation-keys`
- Body:
```json
{
  "userDetails": {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+234...",
    "role": "doctor",
    "facility": "Clinic A",
    "state": "Lagos"
  },
  "expiresAt": "2025-12-31T00:00:00.000Z",
  "notes": "optional"
}
```
- Response (shape used by admin UI):
```json
{
  "success": true,
  "message": "12-digit activation key created successfully",
  "data": { "activationKey": { /* key summary */ } }
}
```

List activation keys
- GET `/activation-keys`
- Query: `page`, `limit`, `status`, `role`, `email`, `sortBy`, `sortOrder`
- Response:
```json
{
  "success": true,
  "data": {
    "keys": [ /* ActivationKey documents */ ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
  }
}
```

Revoke a key
- POST `/activation-keys/:keyId/revoke`
- Body: `{ "reason": "Admin revocation" }`
- Response: `{ success: true, message: "Activation key revoked successfully", data: { keyId, revokedAt, reason } }`

### Encryption scheme (offline validation)
- Secret: `ACTIVATION_KEY_SECRET`
- Derived key: 32 bytes from the secret padded/truncated to 32 chars.
- Mode: AES‑256‑CBC
- IV: random 16‑byte; stored as a 32‑char hex prefix before the ciphertext hex.
- Mobile app uses CryptoJS to decrypt by splitting the IV (first 32 hex chars) and decrypting the rest using the same derived key.

## Common issues & troubleshooting

- "crypto.createCipher is not a function":
  - Cause: deprecated Node crypto APIs removed in newer Node versions.
  - Fix: backend now uses `crypto.createCipheriv/Decipheriv` and IV‑prefixed payloads. Make sure you’ve redeployed the latest backend.

- "ActivationKey validation failed: keyHash is required":
  - Cause: validation ran before `keyHash` was set.
  - Fix: model now computes `keyHash` in a `pre('validate')` hook.

- Admin UI shows "Failed to fetch activation keys":
  - Ensure backend `GET /admin/activation-keys` is returning the service‑based response shape `{ data: { keys, pagination } }` and the backend is redeployed.

## Development notes
- Lint: `npm run lint`
- Nodemon dev server: `npm run dev`
- Seeders and scripts are under `scripts/`. Review before running against production data.

## Security
- Do not commit real secrets.
- Rotate `ACTIVATION_KEY_SECRET` carefully; changing it will make existing encrypted payloads unreadable by the mobile app.
- Enable HTTPS and appropriate CORS in production.

## Deployment
- Ensure environment variables are set on your platform (Render, etc.).
- Use Node LTS. Verify Mongo connectivity and indexes.
- Monitor logs for route errors and validation messages.

## License
MIT

