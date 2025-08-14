# Setting Up Pinata for IPFS Storage

## 🔧 Quick Setup Guide

### 1. Create Pinata Account

1. Go to [Pinata Cloud](https://app.pinata.cloud/)
2. Sign up for a free account
3. Verify your email address

### 2. Generate API Key

1. In your Pinata dashboard, go to **API Keys**
2. Click **"New Key"**
3. Select the following permissions:
   - ✅ **pinFileToIPFS**
   - ✅ **pinJSONToIPFS**
   - ✅ **unpin**
   - ✅ **pinList**
4. Name your key (e.g., "Abya Passport DID Storage")
5. Click **"Create Key"**
6. **IMPORTANT**: Copy the JWT token immediately (you won't be able to see it again)

### 3. Get Gateway URL

1. In your Pinata dashboard, go to **Gateways**
2. Copy your dedicated gateway URL (format: `https://yourname.mypinata.cloud`)

### 4. Configure Environment Variables

1. Create a `.env` file in your frontend directory:

   ```bash
   cd src/abya-passport-frontend
   cp .env.example .env
   ```

2. Edit the `.env` file and add your credentials:
   ```env
   VITE_APP_PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_actual_jwt_token_here
   VITE_APP_PINATA_GATEWAY=https://yourname.mypinata.cloud
   VITE_APP_VERAMO_API_URL=http://localhost:3000
   ```

### 5. Restart Your Development Server

```bash
# Stop the current dev server (Ctrl+C)
npm run dev
```

## 🚨 Common Issues & Solutions

### Issue: "token is malformed"

**Cause**: JWT token is incomplete, has extra spaces, or is missing parts.
**Solution**:

- Copy the JWT token again from Pinata dashboard
- Make sure there are no line breaks or extra spaces
- JWT should have 3 parts separated by dots (eyJhbG... format)

### Issue: "INVALID_CREDENTIALS"

**Cause**: JWT token is wrong or API key was deleted/disabled.
**Solution**:

- Generate a new API key in Pinata dashboard
- Update your `.env` file with the new JWT token

### Issue: Environment variables not loading

**Cause**: `.env` file not in the right location or missing `VITE_` prefix.
**Solution**:

- Ensure `.env` file is in `src/abya-passport-frontend/` directory
- All variables must start with `VITE_APP_` for Vite to load them
- Restart the dev server after changing `.env`

## 🔄 Fallback Mode

If Pinata is not configured, the app will automatically use localStorage for development. You'll see these messages:

- "Pinata SDK not available, using fallback storage"
- "Using fallback storage for DID document"

This allows you to test DID resolution without Pinata, but won't persist between browser sessions.

## ✅ Testing Your Setup

1. Start your frontend: `npm run dev`
2. Open browser console (F12)
3. Look for: "✓ Pinata SDK initialized successfully"
4. Try resolving a DID - it should now work without authentication errors

## 📞 Need Help?

If you're still getting authentication errors after following these steps:

1. Check the browser console for the exact error message
2. Verify your `.env` file format
3. Make sure you restarted the dev server after changing environment variables
