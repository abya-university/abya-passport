# abya-passport

## `ABYA Passport`: A Multichain Decentralized Identity for Lifelong Learning

`ABYA Passport` is a multichain decentralized identity (DID) platform designed to empower learners with secure, verifiable, and privacy-preserving digital credentials that they fully own and control. It addresses the fragmentation, inefficiency, and lack of trust in traditional credentialing systems by leveraging blockchain technology, W3C standards, and zero-knowledge proofs.

## The Problem

Learners today accumulate credentials from various institutions and platforms, but these records are often siloed, unverifiable, and prone to fraud. There is no unified, learner-owned system that allows secure sharing and verification of educational achievements across different ecosystems. Additionally, most identity systems are centralized, compromising user privacy and control.

## The Solution

ABYA Passport introduces a multichain DID system that allows learners to:

- Create decentralized identities using DID methods like did:icp, did:ethr, did:key, and did:web.
- Receive W3C-compliant Verifiable Credentials (VCs) for achievements such as course completions, certifications, and skills.
- Share credentials securely via QR codes or DIDComm protocols.
- Verify credentials across chains using a Universal Resolver and multichain anchoring.
- Preserve privacy through selective disclosure using zero-knowledge proofs (e.g., BBS+ signatures).

## Tech Stack

- **`Smart Contracts`**: Motoko (ICP) and Solidity (EVM) for credential anchoring.
- **`Authentication`**: Internet Identity (ICP), MetaMask, Phantom, Keplr.
- **`DID Methods`**: did:icp, did:key, did:ethr, did:web.
- **`Credential Format`**: W3C Verifiable Credentials.
- **`Privacy Layer`**: ZKPs (e.g., BBS+, zk-SNARKs).
- **`Storage`**: On-chain metadata + IPFS/Filecoin for encrypted credential storage.
- **`Frontend`**: React with ICP Agent and EVM wallet connectors.

## Innovation Highlights

- **`Cross-chain interoperability`**: Works seamlessly across ICP, Ethereum, Polygon, and Solana.
- **`User sovereignty`**: Learners own and control their identity and credentials.
- **`AI-powered insights (bonus)`**: Recommends learning paths based on verified credentials.
- **`Reputation layer (bonus)`**: Builds a non-transferable, on-chain reputation for learners and educators.

## Use Cases

- **`Learners`**: Manage and share credentials across platforms and employers.
- **`Educators`**: Issue tamper-proof credentials.
- **`Employers`**: Instantly verify qualifications and reduce credential fraud.

## Deployment Guide

### Prerequisites

Before deploying ABYA Passport, ensure you have the following tools installed:

1. **DFX (DFINITY SDK)**

   ```bash
   sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
   ```

   Verify installation:

   ```bash
   dfx --version
   ```

2. **Node.js and npm**

   ```bash
   # Install Node.js (version 16 or higher)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Verify installation
   node --version
   npm --version
   ```

3. **Git**
   ```bash
   sudo apt-get update
   sudo apt-get install git
   ```

### Local Development Setup

1. **Clone the Repository**

   ```bash
   git clone https://github.com/abya-university/abya-passport.git
   cd abya-passport
   ```

2. **Start Local Internet Computer Replica**

   ```bash
   dfx start --clean --background
   ```

3. **Deploy Internet Identity (for authentication)**

   ```bash
   dfx deps pull
   dfx deps deploy internet_identity
   dfx generate internet_identity
   ```

4. **Deploy Backend Canister**

   ```bash
   dfx deploy abya-passport-backend
   ```

5. **Install Frontend Dependencies**

   ```bash
   cd src/abya-passport-frontend
   npm install
   cd ../..
   ```

6. **Generate Backend Declarations**

   ```bash
   dfx generate abya-passport-backend
   ```

7. **Build and Deploy Frontend**

   ```bash
   # Build frontend
   cd src/abya-passport-frontend
   npm run build
   cd ../..

   # Deploy frontend canister
   dfx deploy abya-passport-frontend
   ```

8. **Start Frontend Development Server**
   ```bash
   cd src/abya-passport-frontend
   npm run dev
   ```

### Accessing the Application

- **Frontend**: http://localhost:5173 (development) or http://localhost:4943/?canisterId=<frontend-canister-id> (production)
- **Local Internet Identity**: http://127.0.0.1:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai

### Testing Backend Functions

You can test the backend functionality directly using DFX commands:

```bash
# Get your DID after authentication
dfx canister call abya-passport-backend getMyDid

# Issue a Verifiable Credential
dfx canister call abya-passport-backend issueVC '("did:icp:example", [["name", "John Doe"], ["role", "Student"]], opt (48 : nat))'

# Verify a credential
dfx canister call abya-passport-backend verifyVC '("vc-id-here")'

# Get issued VCs
dfx canister call abya-passport-backend getMyIssuedVCs

# Resolve a DID document
dfx canister call abya-passport-backend resolveDid '("did:icp:example")'
```

### Production Deployment (IC Mainnet)

1. **Configure for Mainnet**

   ```bash
   dfx deploy --network ic --with-cycles 1000000000000
   ```

2. **Update Frontend Configuration**

   - Update the `identityProvider` in `InternetContext.jsx` to use `https://identity.ic0.app`
   - Update canister IDs in the frontend configuration

3. **Build and Deploy**
   ```bash
   dfx deploy --network ic abya-passport-backend
   dfx deploy --network ic abya-passport-frontend
   ```

### Troubleshooting

**Common Issues:**

1. **Certificate Verification Errors**

   - Ensure you're using local Internet Identity for development
   - Run `dfx start --clean` if you encounter persistent issues

2. **Frontend Build Errors**

   - Make sure all dependencies are installed: `npm install`
   - Regenerate declarations: `dfx generate`

3. **Canister Not Found**

   - Deploy the backend first: `dfx deploy abya-passport-backend`
   - Check canister status: `dfx canister status --all`

4. **Authentication Issues**
   - Clear browser cache and cookies
   - Restart DFX: `dfx stop && dfx start --clean --background`

### Environment Variables

Create a `.env` file in the frontend directory with:

```env
DFX_NETWORK=local
CANISTER_ID_ABYA_PASSPORT_BACKEND=your-backend-canister-id
CANISTER_ID_INTERNET_IDENTITY=rdmx6-jaaaa-aaaaa-aaadq-cai
```

### Development Workflow

1. Make changes to backend code in `src/abya-passport-backend/main.mo`
2. Deploy: `dfx deploy abya-passport-backend`
3. Regenerate declarations: `dfx generate abya-passport-backend`
4. Make frontend changes in `src/abya-passport-frontend/src/`
5. The development server will auto-reload changes

For a complete development cycle, the typical commands are:

```bash
dfx deploy abya-passport-backend && dfx generate abya-passport-backend
```
