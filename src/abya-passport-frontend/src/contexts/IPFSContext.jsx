import React, { createContext, useContext, useState, useEffect } from "react";
import {
  uploadMetadataToIPFS,
  getFromIPFS,
  unpinFromIPFS,
} from "../components/pinata";

const IPFSContext = createContext();

export const IPFSProvider = ({ children }) => {
  const [ipfsStatus, setIpfsStatus] = useState("disconnected");

  // Check IPFS connection on mount
  useEffect(() => {
    // Since we're using Pinata, we'll consider it always connected
    setIpfsStatus("connected");
  }, []);

  // Upload JSON data to IPFS via Pinata
  const uploadToIPFS = async (content) => {
    try {
      console.log("📁 Uploading to IPFS via Pinata:", content);

      // Use Pinata's JSON upload function
      const ipfsHash = await uploadMetadataToIPFS(content);

      if (!ipfsHash) {
        throw new Error("Failed to upload to IPFS");
      }

      console.log("✅ IPFS upload successful:", ipfsHash);
      return ipfsHash;
    } catch (error) {
      console.error("❌ IPFS upload failed:", error);
      throw error;
    }
  };

  // Retrieve JSON data from IPFS via Pinata gateway
  const retrieveFromIPFS = async (ipfsHash) => {
    try {
      console.log("📥 Retrieving from IPFS:", ipfsHash);

      // Use Pinata's gateway to retrieve data
      const content = await getFromIPFS(ipfsHash);

      console.log("✅ IPFS retrieval successful");
      return content;
    } catch (error) {
      console.error("❌ IPFS retrieval failed:", error);
      throw error;
    }
  };

  // Create a DID document and upload to IPFS
  const createAndUploadDID = async (principal, publicKey = null) => {
    try {
      const did = `did:icp:${principal}`;

      // Create W3C compliant DID document
      const didDocument = {
        "@context": [
          "https://www.w3.org/ns/did/v1",
          "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        id: did,
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: publicKey || `z${principal}`, // Fallback if no public key provided
          },
        ],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      console.log("🆔 Creating DID document:", didDocument);

      // Upload to IPFS
      const ipfsCid = await uploadToIPFS(didDocument);

      return {
        did,
        ipfsCid,
        document: didDocument,
      };
    } catch (error) {
      console.error("❌ DID creation and upload failed:", error);
      throw error;
    }
  };

  // Create a VC document and upload to IPFS
  const createAndUploadVC = async (vcData) => {
    try {
      const {
        issuerPrincipal,
        recipientDid,
        claims,
        credentialTypes = ["VerifiableCredential"],
        expiresInHours,
      } = vcData;

      const vcId = `vc:${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const issuerDid = `did:icp:${issuerPrincipal}`;
      const now = new Date().toISOString();

      // Calculate expiration date if provided
      const expirationDate = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
        : null;

      // Create W3C compliant VC document
      const vcDocument = {
        "@context": [
          "https://www.w3.org/2018/credentials/v1",
          "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        id: vcId,
        type: credentialTypes,
        issuer: {
          id: issuerDid,
        },
        issuanceDate: now,
        ...(expirationDate && { expirationDate: expirationDate }),
        credentialSubject: {
          id: recipientDid,
          ...claims,
        },
        proof: {
          type: "Ed25519Signature2020",
          created: now,
          verificationMethod: `${issuerDid}#key-1`,
          proofPurpose: "assertionMethod",
          proofValue: `proof-${Date.now()}`, // Simplified proof for demo
        },
      };

      console.log("📜 Creating VC document:", vcDocument);

      // Upload to IPFS
      const ipfsCid = await uploadToIPFS(vcDocument);

      return {
        vcId,
        ipfsCid,
        document: vcDocument,
      };
    } catch (error) {
      console.error("❌ VC creation and upload failed:", error);
      throw error;
    }
  };

  // Retrieve and validate DID document from IPFS
  const retrieveDIDDocument = async (ipfsCid) => {
    try {
      const document = await retrieveFromIPFS(ipfsCid);

      // Basic validation
      if (
        !document["@context"] ||
        !document.id ||
        !document.verificationMethod
      ) {
        throw new Error("Invalid DID document structure");
      }

      return document;
    } catch (error) {
      console.error("❌ DID document retrieval failed:", error);
      throw error;
    }
  };

  // Retrieve and validate VC document from IPFS
  const retrieveVCDocument = async (ipfsCid) => {
    try {
      const document = await retrieveFromIPFS(ipfsCid);

      // Basic validation
      if (
        !document["@context"] ||
        !document.id ||
        !document.credentialSubject
      ) {
        throw new Error("Invalid VC document structure");
      }

      return document;
    } catch (error) {
      console.error("❌ VC document retrieval failed:", error);
      throw error;
    }
  };

  // Rollback function to unpin content if transaction fails
  const rollbackIPFS = async (ipfsHash) => {
    try {
      console.log("🔄 Rolling back IPFS content:", ipfsHash);
      await unpinFromIPFS(ipfsHash);
      console.log("✅ IPFS rollback successful");
    } catch (error) {
      console.error("❌ IPFS rollback failed:", error);
      // Don't throw error for rollback failures to avoid masking original error
    }
  };

  const contextValue = {
    ipfsStatus,
    uploadToIPFS,
    retrieveFromIPFS,
    createAndUploadDID,
    createAndUploadVC,
    retrieveDIDDocument,
    retrieveVCDocument,
    rollbackIPFS,
  };

  return (
    <IPFSContext.Provider value={contextValue}>{children}</IPFSContext.Provider>
  );
};

export const useIPFS = () => {
  const context = useContext(IPFSContext);
  if (!context) {
    throw new Error("useIPFS must be used within an IPFSProvider");
  }
  return context;
};
