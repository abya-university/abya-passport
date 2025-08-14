# IPFS Storage Strategy for ABYA Passport

## 🎯 **Overview**

This document outlines a scalable architecture for storing DIDs and Verifiable Credentials (VCs) on IPFS while maintaining metadata and CIDs on-chain. This approach provides better scalability, reduced storage costs, and true decentralization.

## 🏗️ **Current Architecture vs Proposed Architecture**

### Current Architecture (On-Chain Storage)

```
┌─────────────────┐
│   ICP Canister  │
│                 │
│ ├─ DIDs         │ ← Full DID documents stored on-chain
│ ├─ VCs          │ ← Full VC documents stored on-chain
│ └─ Metadata     │ ← All metadata on-chain
└─────────────────┘
```

### Proposed Architecture (Hybrid IPFS + On-Chain)

```
┌─────────────────┐     ┌─────────────────┐
│   ICP Canister  │────▶│      IPFS       │
│                 │     │                 │
│ ├─ DID CIDs     │     │ ├─ DID Docs     │
│ ├─ VC CIDs      │     │ ├─ VC Docs      │
│ ├─ Metadata     │     │ └─ Assets       │
│ └─ Mappings     │     └─────────────────┘
└─────────────────┘
```

## 🚀 **Benefits of IPFS Storage**

### 1. **Scalability**

- **Unlimited Storage**: No canister storage limits
- **Cost Efficiency**: Cheaper than on-chain storage
- **Performance**: Faster retrieval of large documents

### 2. **Decentralization**

- **Distributed Storage**: Content replicated across IPFS network
- **Censorship Resistance**: No single point of failure
- **Immutability**: Content-addressed storage ensures integrity

### 3. **Interoperability**

- **Standard Access**: DIDs/VCs accessible via standard IPFS gateways
- **Cross-Platform**: Can be accessed from any IPFS-compatible system
- **Future-Proof**: Technology-agnostic storage layer

## 📋 **Implementation Strategy**

### Phase 1: IPFS Integration Setup

#### Step 1.1: Add IPFS Dependencies

```bash
# Frontend
npm install ipfs-http-client
npm install ipfs-core

# Backend (if using Node.js IPFS integration)
npm install ipfs-http-client
```

#### Step 1.2: IPFS Service Configuration

```javascript
// src/services/ipfsService.js
import { create } from "ipfs-http-client";

const ipfs = create({
  host: "localhost",
  port: 5001,
  protocol: "http",
});

export default ipfs;
```

### Phase 2: Backend Refactoring

#### Step 2.1: Update Motoko Backend Data Structures

```motoko
// main.mo - Updated data structures
type DIDMetadata = {
  did: Text;
  ipfsCid: Text;
  owner: Principal;
  createdAt: Int;
  updatedAt: Int;
  isActive: Bool;
};

type VCMetadata = {
  id: Text;
  ipfsCid: Text;
  issuer: Principal;
  subject: Text; // DID
  credentialType: [Text];
  issuedAt: Int;
  expiresAt: ?Int;
  isRevoked: Bool;
  revokedAt: ?Int;
};

private stable var didRegistry: [(Text, DIDMetadata)] = [];
private stable var vcRegistry: [(Text, VCMetadata)] = [];
private stable var principalToDid: [(Principal, Text)] = [];
```

#### Step 2.2: Add IPFS Integration Functions

```motoko
// IPFS CID validation and storage functions
public func storeDIDDocument(principal: Principal, ipfsCid: Text): async Result<Text, Text> {
  // Validate CID format
  if (not isValidIPFSCid(ipfsCid)) {
    return #err("Invalid IPFS CID format");
  };

  let did = "did:icp:" # Principal.toText(principal);

  // Check if DID already exists
  switch (didMap.get(did)) {
    case (?existingDid) {
      return #err("DID already exists");
    };
    case null {
      let metadata: DIDMetadata = {
        did = did;
        ipfsCid = ipfsCid;
        owner = principal;
        createdAt = Time.now();
        updatedAt = Time.now();
        isActive = true;
      };

      didMap.put(did, metadata);
      principalDidMap.put(principal, did);
      return #ok(did);
    };
  };
};
```

### Phase 3: Frontend IPFS Integration

#### Step 3.1: Create IPFS Context Provider

```javascript
// src/contexts/IPFSContext.jsx
import React, { createContext, useContext, useState } from "react";
import ipfs from "../services/ipfsService";

const IPFSContext = createContext();

export const IPFSProvider = ({ children }) => {
  const [ipfsStatus, setIpfsStatus] = useState("disconnected");

  const uploadToIPFS = async (content) => {
    try {
      const result = await ipfs.add(JSON.stringify(content));
      return result.cid.toString();
    } catch (error) {
      console.error("IPFS upload failed:", error);
      throw error;
    }
  };

  const retrieveFromIPFS = async (cid) => {
    try {
      const chunks = [];
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString();
      return JSON.parse(content);
    } catch (error) {
      console.error("IPFS retrieval failed:", error);
      throw error;
    }
  };

  return (
    <IPFSContext.Provider
      value={{
        uploadToIPFS,
        retrieveFromIPFS,
        ipfsStatus,
      }}
    >
      {children}
    </IPFSContext.Provider>
  );
};

export const useIPFS = () => useContext(IPFSContext);
```

#### Step 3.2: Update DID Creation Flow

```javascript
// Updated DID creation with IPFS storage
const createDIDDocument = async (principal) => {
  try {
    // 1. Create DID document
    const didDocument = {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: `did:icp:${principal}`,
      authentication: [
        {
          id: `did:icp:${principal}#key-1`,
          type: "Ed25519VerificationKey2020",
          controller: `did:icp:${principal}`,
          publicKeyMultibase: "...", // Generated key
        },
      ],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // 2. Upload to IPFS
    const ipfsCid = await uploadToIPFS(didDocument);
    console.log("DID uploaded to IPFS:", ipfsCid);

    // 3. Store CID on-chain
    const result = await actor.storeDIDDocument(principal, ipfsCid);

    if (result.ok) {
      return { did: result.ok, ipfsCid, document: didDocument };
    } else {
      throw new Error(result.err);
    }
  } catch (error) {
    console.error("DID creation failed:", error);
    throw error;
  }
};
```

### Phase 4: VC Storage Implementation

#### Step 4.1: Update VC Issuance

```javascript
const issueVC = async (recipientDid, claims, expiresInHours = 24) => {
  try {
    // 1. Create VC document
    const vcDocument = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `vc:${Date.now()}`,
      type: ["VerifiableCredential"],
      issuer: identity.getPrincipal().toString(),
      issuanceDate: new Date().toISOString(),
      expirationDate: expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
        : null,
      credentialSubject: {
        id: recipientDid,
        ...claims,
      },
      proof: {
        type: "Ed25519Signature2020",
        created: new Date().toISOString(),
        verificationMethod: `did:icp:${identity
          .getPrincipal()
          .toString()}#key-1`,
        proofPurpose: "assertionMethod",
        proofValue: "...", // Generated signature
      },
    };

    // 2. Upload VC to IPFS
    const ipfsCid = await uploadToIPFS(vcDocument);
    console.log("VC uploaded to IPFS:", ipfsCid);

    // 3. Store VC metadata on-chain
    const result = await actor.issueVCWithIPFS(
      vcDocument.id,
      ipfsCid,
      recipientDid,
      vcDocument.type,
      expiresInHours ? [BigInt(expiresInHours)] : []
    );

    return { vcId: vcDocument.id, ipfsCid, document: vcDocument };
  } catch (error) {
    console.error("VC issuance failed:", error);
    throw error;
  }
};
```

### Phase 5: Data Retrieval Implementation

#### Step 5.1: Efficient Data Loading

```javascript
const loadDIDDocument = async (did) => {
  try {
    // 1. Get CID from on-chain metadata
    const metadata = await actor.getDIDMetadata(did);

    // 2. Retrieve document from IPFS
    const document = await retrieveFromIPFS(metadata.ipfsCid);

    return { metadata, document };
  } catch (error) {
    console.error("DID loading failed:", error);
    throw error;
  }
};

const loadVC = async (vcId) => {
  try {
    // 1. Get VC metadata from on-chain
    const metadata = await actor.getVCMetadata(vcId);

    // 2. Retrieve VC document from IPFS
    const document = await retrieveFromIPFS(metadata.ipfsCid);

    return { metadata, document };
  } catch (error) {
    console.error("VC loading failed:", error);
    throw error;
  }
};
```

## 🛠️ **Migration Strategy**

### Step 1: Parallel Implementation

- Keep existing on-chain storage functional
- Implement IPFS storage alongside
- Add feature flags to switch between modes

### Step 2: Data Migration Script

```javascript
// scripts/migrateToIPFS.js
const migrateExistingData = async () => {
  // 1. Export all existing DIDs and VCs
  const existingDIDs = await actor.getAllDIDs();
  const existingVCs = await actor.getAllVCs();

  // 2. Upload to IPFS and update references
  for (const did of existingDIDs) {
    const ipfsCid = await uploadToIPFS(did.document);
    await actor.updateDIDWithIPFS(did.id, ipfsCid);
  }

  for (const vc of existingVCs) {
    const ipfsCid = await uploadToIPFS(vc.document);
    await actor.updateVCWithIPFS(vc.id, ipfsCid);
  }
};
```

### Step 3: Gradual Rollout

1. **Week 1**: Deploy IPFS integration (feature flagged)
2. **Week 2**: Migrate existing data
3. **Week 3**: Enable IPFS for new creations
4. **Week 4**: Full IPFS mode, deprecate on-chain storage

## 🔒 **Security Considerations**

### 1. **Data Integrity**

- **Content Addressing**: IPFS CIDs ensure content integrity
- **Signature Verification**: Verify signatures before storing
- **CID Validation**: Validate IPFS CIDs on-chain

### 2. **Access Control**

- **On-Chain Permissions**: Maintain access control on-chain
- **Encryption**: Consider encrypting sensitive VCs before IPFS upload
- **Privacy**: Private data should be encrypted with recipient's public key

### 3. **Availability**

- **IPFS Pinning**: Pin important content to ensure availability
- **Backup Strategies**: Multiple IPFS nodes and pinning services
- **Fallback Mechanisms**: Graceful degradation if IPFS unavailable

## 📊 **Performance Optimizations**

### 1. **Caching Strategy**

```javascript
// Frontend caching
const ipfsCache = new Map();

const getCachedDocument = async (cid) => {
  if (ipfsCache.has(cid)) {
    return ipfsCache.get(cid);
  }

  const document = await retrieveFromIPFS(cid);
  ipfsCache.set(cid, document);
  return document;
};
```

### 2. **Batch Operations**

```javascript
const loadMultipleVCs = async (vcIds) => {
  // 1. Batch get metadata from on-chain
  const metadataList = await actor.getMultipleVCMetadata(vcIds);

  // 2. Batch retrieve from IPFS
  const documents = await Promise.all(
    metadataList.map((meta) => retrieveFromIPFS(meta.ipfsCid))
  );

  return metadataList.map((meta, index) => ({
    metadata: meta,
    document: documents[index],
  }));
};
```

## 🎯 **Implementation Timeline**

### Week 1-2: Foundation

- [ ] Set up IPFS node and configuration
- [ ] Create IPFS service integration
- [ ] Update Motoko backend data structures
- [ ] Implement basic IPFS upload/download functions

### Week 3-4: Core Integration

- [ ] Update DID creation flow with IPFS
- [ ] Implement VC issuance with IPFS storage
- [ ] Create data retrieval functions
- [ ] Add error handling and fallbacks

### Week 5-6: Enhancement & Testing

- [ ] Implement caching strategies
- [ ] Add batch operations
- [ ] Create migration scripts
- [ ] Comprehensive testing

### Week 7-8: Migration & Deployment

- [ ] Migrate existing data to IPFS
- [ ] Feature flag rollout
- [ ] Performance monitoring
- [ ] Full production deployment

## 🔍 **Monitoring & Maintenance**

### Key Metrics to Track

- **IPFS Retrieval Times**: Monitor performance
- **Storage Costs**: Compare IPFS vs on-chain costs
- **Data Availability**: Track successful retrievals
- **Error Rates**: Monitor IPFS failures

### Maintenance Tasks

- **Regular Pinning**: Ensure important content stays available
- **Cache Management**: Optimize frontend caching
- **Node Health**: Monitor IPFS node status
- **Backup Verification**: Regular backup integrity checks

## 🎉 **Expected Outcomes**

### 1. **Cost Reduction**

- **90% less storage costs** compared to full on-chain storage
- **Scalable growth** without hitting canister limits

### 2. **Performance Improvement**

- **Faster loading** of large documents
- **Better user experience** with cached content

### 3. **Enhanced Decentralization**

- **True distributed storage** via IPFS network
- **Improved censorship resistance**
- **Greater interoperability** with other systems

---

## 🚀 **Next Steps**

1. **Review and approve** this strategy
2. **Set up IPFS development environment**
3. **Begin Phase 1 implementation**
4. **Create detailed technical specifications**
5. **Start with DID storage migration**

This strategy provides a robust, scalable, and truly decentralized approach to storing DIDs and VCs while maintaining the benefits of on-chain metadata and access control.
