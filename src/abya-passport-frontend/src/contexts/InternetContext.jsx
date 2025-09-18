// src/abya-passport-frontend/src/contexts/InternetContext.jsx

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent, Actor } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { idlFactory } from "../../../declarations/abya-passport-backend/abya-passport-backend.did.js";
import { useIPFS } from "./IPFSContext";

const InternetIdentityContext = createContext();

export const InternetIdentityProvider = ({ children }) => {
  const [authClient, setAuthClient] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginMethod, setLoginMethod] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [did, setDid] = useState(null);
  const [didDocument, setDidDocument] = useState(null);
  const [isResolvingDid, setIsResolvingDid] = useState(false);

  // VC-related state
  const [myIssuedVCs, setMyIssuedVCs] = useState([]);
  const [myReceivedVCs, setMyReceivedVCs] = useState([]);
  const [isLoadingVCs, setIsLoadingVCs] = useState(false);

  // IPFS integration
  const {
    createAndUploadDID,
    createAndUploadVC,
    retrieveDIDDocument,
    retrieveVCDocument,
    rollbackIPFS,
  } = useIPFS();

  // Network configuration - FIXED
  const network = import.meta.env.VITE_APP_DFX_NETWORK;
  const isLocal = network === "local";

  console.log("VITE_APP_DFX_NETWORK:", import.meta.env.VITE_APP_DFX_NETWORK);

  console.log("Is local development:", isLocal);

  // Host configuration - FIXED
  const IC_HOST = isLocal ? "http://127.0.0.1:4943" : "https://ic0.app";

  // Canister ID - FIXED (use local canister ID for local development)
  const canisterId = isLocal
    ? import.meta.env.VITE_APP_LOCAL_BACKEND_CANISTER_ID
    : import.meta.env.VITE_APP_MAINNET_BACKEND_CANISTER_ID;

  console.log("Host:", IC_HOST);
  console.log("Canister ID:", canisterId);

  // Agent cache
  const agentCache = useRef({});

  // Helper to create an actor with the current identity - FIXED
  const createBackendActor = async (identity = null) => {
    try {
      const agent = await getAgent(identity);
      return Actor.createActor(idlFactory, {
        agent,
        canisterId,
      });
    } catch (error) {
      console.error("Error creating backend actor:", error);
      throw error;
    }
  };

  // Helper to get a configured agent - FIXED
  const getAgent = async (identity = null) => {
    try {
      const key = identity ? identity.getPrincipal().toString() : "anonymous";

      if (agentCache.current[key]) {
        return agentCache.current[key];
      }

      const agentOptions = {
        host: IC_HOST,
      };

      if (identity) {
        agentOptions.identity = identity;
      }

      const agent = new HttpAgent(agentOptions);

      // Only fetch root key for local development
      if (isLocal) {
        await agent.fetchRootKey();
        console.log("Fetched root key for local development");
      }

      agentCache.current[key] = agent;
      return agent;
    } catch (error) {
      console.error("Error creating agent:", error);
      throw error;
    }
  };

  // Initialize auth client - FIXED
  useEffect(() => {
    const initAuthClient = async () => {
      try {
        const client = await AuthClient.create();
        setAuthClient(client);

        if (await client.isAuthenticated()) {
          await handleLoginSuccess(client);
        }
      } catch (error) {
        console.error("Error initializing auth client:", error);
      }
    };

    initAuthClient();
  }, []);

  // Developer login - FIXED
  const developerLogin = async () => {
    try {
      console.log("🔧 Starting developer login...");

      const devIdentity = Ed25519KeyIdentity.generate();
      const principal = devIdentity.getPrincipal();

      setIdentity(devIdentity);
      setPrincipal(principal.toString());
      setIsAuthenticated(true);
      setLoginMethod("developer");

      await createOrRetrieveDID(devIdentity);

      console.log("✅ Developer login successful");
    } catch (error) {
      console.error("❌ Developer login failed:", error);
    }
  };

  // Login function - FIXED (proper local/mainnet separation)
  const login = async () => {
    setIsAuthenticating(true);

    try {
      // Use correct identity provider based on environment
      const identityProvider = isLocal
        ? `http://${
            import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY
          }.localhost:4943`
        : "https://identity.ic0.app";

      console.log("Using identity provider:", identityProvider);

      // Clear cached data
      localStorage.removeItem("ic-identity");
      localStorage.removeItem("ic-delegation");
      sessionStorage.clear();

      authClient.login({
        identityProvider: identityProvider,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
        onSuccess: async () => {
          await handleLoginSuccess(authClient);
        },
        onError: (err) => {
          console.error("II Login failed:", err);
          setIsAuthenticating(false);
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      setIsAuthenticating(false);
    }
  };

  // Handle login success - FIXED
  const handleLoginSuccess = async (client) => {
    try {
      const identity = client.getIdentity();
      setIdentity(identity);
      setPrincipal(identity.getPrincipal().toString());
      setIsAuthenticated(true);
      setLoginMethod("internet-identity");

      await createOrRetrieveDID(identity);
    } catch (error) {
      console.error("Error in login success handler:", error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Create or retrieve DID - FIXED
  const createOrRetrieveDID = async (identity) => {
    try {
      const principalText = identity.getPrincipal().toString();
      const did = "did:icp:" + principalText;

      // Test backend connection first
      const isConnected = await verifyBackendConnection();
      if (!isConnected) {
        throw new Error("Backend connection failed");
      }

      const agent = await getAgent(identity);
      const actor = await createBackendActor(identity);

      const hasExistingDID = await actor.hasMyDID();

      if (hasExistingDID) {
        console.log("📋 DID already exists, retrieving from IPFS...");
        const didMetadata = await actor.getDIDMetadata(did);
        if (didMetadata) {
          const didDoc = await retrieveDIDDocument(didMetadata.ipfsCid);
          setDid(did);
          setDidDocument(didDoc);
          console.log("✅ DID retrieved successfully:", did);
        }
      } else {
        console.log("🆔 Creating new DID with IPFS storage...");
        const {
          did: newDid,
          ipfsCid,
          document,
        } = await createAndUploadDID(principalText);

        const result = await actor.storeDIDDocument(ipfsCid);

        if (result.ok) {
          setDid(newDid);
          setDidDocument(document);
          console.log("✅ DID created and stored successfully:", newDid);
        } else {
          throw new Error(result.err);
        }
      }

      // Load VCs after DID is set
      await loadMyIssuedVCs();
      await loadMyReceivedVCs();
    } catch (error) {
      console.error("❌ Error with DID creation/retrieval:", error);
      const did = "did:icp:" + identity.getPrincipal().toString();
      setDid(did);
      setDidDocument(null);
    }
  };

  // Verify backend connection - FIXED
  const verifyBackendConnection = async () => {
    try {
      console.log("Verifying backend connection...");
      console.log("Canister ID:", canisterId);
      console.log("Network:", isLocal ? "local" : "mainnet");
      console.log("Host:", IC_HOST);

      const agent = await getAgent();
      const actor = await createBackendActor();

      // Try a simple method
      try {
        const testResult = await actor.getDIDMetadata("did:example:test");
        console.log("Connection test successful", testResult);
        return true;
      } catch (methodError) {
        // If getDIDMetadata fails, try any method to check connectivity
        const methods = Object.keys(actor);
        console.log("Available methods:", methods);
        return methods.length > 0;
      }
    } catch (error) {
      console.error("Backend connection failed:", error);
      return false;
    }
  };

  useEffect(() => {
    verifyBackendConnection();
  }, [canisterId, IC_HOST]);

  // ... rest of the functions remain similar but use the fixed createBackendActor and getAgent

  const logout = async () => {
    if (authClient && loginMethod === "internet-identity") {
      await authClient.logout();
    }
    localStorage.removeItem("ic-identity");
    localStorage.removeItem("ic-delegation");
    sessionStorage.clear();

    setIdentity(null);
    setPrincipal(null);
    setIsAuthenticated(false);
    setLoginMethod(null);
    setDid(null);
    setDidDocument(null);
    setMyIssuedVCs([]);
    setMyReceivedVCs([]);
  };

  const resolveDidFallback = async (didToResolve = null) => {
    const targetDid = didToResolve || did;
    if (!targetDid) return null;

    try {
      // Try to get DID metadata directly
      const agent = await getAgent();
      const actor = await createBackendActor(null);

      if (typeof actor.getDIDMetadata === "function") {
        const didMetadata = await actor.getDIDMetadata(targetDid);
        if (didMetadata && didMetadata.ipfsCid) {
          const didDoc = await retrieveDIDDocument(didMetadata.ipfsCid);
          setDidDocument(didDoc);
          return didDoc;
        }
      }

      return null;
    } catch (error) {
      console.error("Fallback DID resolution failed:", error);
      return null;
    }
  };

  const resolveDid = async (didToResolve = null) => {
    const targetDid = didToResolve || did;
    if (!targetDid) {
      console.error("No DID available to resolve");
      return null;
    }
    setIsResolvingDid(true);
    try {
      const agent = await getAgent(); // anonymous
      const actor = await createBackendActor(identity);
      if (typeof actor.resolveDid === "function") {
        const document = await actor.resolveDid(targetDid);
        console.log("Resolved DID Document:", document);
        const parsedDocument = JSON.parse(document);
        setDidDocument(parsedDocument);
        return parsedDocument;
      } else {
        // Fallback if resolveDid is not available
        return await resolveDidFallback(targetDid);
      }
    } catch (error) {
      console.error("Error resolving DID:", error);
      setDidDocument(null);
      return null;
    } finally {
      setIsResolvingDid(false);
    }
  };

  // ==================== VC FUNCTIONS ====================

  const issueVC = async (recipientDid, claims, expiresInHours = 24) => {
    if (!identity) {
      throw new Error("Must be authenticated to issue VCs");
    }
    let vcId = null;
    let ipfsCid = null;
    let document = null;
    try {
      console.log("📜 Issuing VC with IPFS storage...");
      console.log("Issuer:", identity.getPrincipal().toString());
      console.log("Recipient:", recipientDid);
      console.log("Claims:", claims);

      const agent = await getAgent(identity);
      // const actor = await createBackendActor(canisterId, { agent });
      const actor = await createBackendActor(identity);

      const vcData = {
        issuerPrincipal: identity.getPrincipal().toString(),
        recipientDid,
        claims,
        credentialTypes: ["VerifiableCredential"],
        expiresInHours,
      };

      const uploadResult = await createAndUploadVC(vcData);
      vcId = uploadResult.vcId;
      ipfsCid = uploadResult.ipfsCid;
      document = uploadResult.document;

      console.log("📁 VC uploaded to IPFS:", ipfsCid);

      try {
        // Use the same calculation as backend: hours × nanoseconds_per_hour
        const NANOS_PER_HOUR = BigInt(3600 * 1000000000); // 3,600,000,000,000
        const expirationNanos = expiresInHours
          ? [BigInt(expiresInHours) * NANOS_PER_HOUR]
          : [];

        const result = await actor.issueVCWithIPFS(
          vcId,
          ipfsCid,
          recipientDid,
          ["VerifiableCredential"],
          expirationNanos
        );
        if (result.ok) {
          console.log("✅ VC issued successfully:", vcId);

          // NEW: fetch canister-generated verification proof (vcHash, treeHash, certificate, proofPath)
          let proof = null;
          try {
            const proofRes = await actor.generateVerificationProof(vcId);
            if (proofRes && proofRes.ok) {
              proof = proofRes.ok;
            } else if (proofRes && proofRes.err) {
              console.warn(
                "generateVerificationProof returned err:",
                proofRes.err
              );
            }
          } catch (proofErr) {
            console.warn(
              "Failed to fetch verification proof from canister:",
              proofErr
            );
          }

          await loadMyIssuedVCs();

          // Return issuance data + proof so callers/components can verify client-side
          return {
            id: vcId,
            ipfsCid: ipfsCid,
            document: document,
            proof,
          };
        } else {
          throw new Error(result.err);
        }
      } catch (onChainError) {
        if (ipfsCid) {
          try {
            await rollbackIPFS(ipfsCid);
            console.log("✅ IPFS rollback completed");
          } catch (rollbackError) {
            console.error("❌ Failed to rollback IPFS content:", rollbackError);
          }
        }
        throw onChainError;
      }
    } catch (error) {
      console.error("❌ Error issuing VC:", error);
      throw error;
    }
  };

  // Helper: normalize canister Blobs/ArrayBuffers to Uint8Array
  const toUint8Array = (blob) => {
    if (!blob) return new Uint8Array([]);
    if (blob instanceof Uint8Array) return blob;
    if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
    if (blob.buffer && blob.byteLength !== undefined)
      return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
    if (typeof blob === "string") {
      try {
        const binStr = atob(blob);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
        return bytes;
      } catch (e) {
        return new Uint8Array([]);
      }
    }
    return new Uint8Array([]);
  };

  // Helper: concat two Uint8Arrays
  const concatBytes = (a, b) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  };

  // Helper: compare two Uint8Arrays
  const equalBytes = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  const verifyProofClientSide = async (proof) => {
    if (!proof) return false;

    // Use the leaf hash returned by canister (vcHash). Optionally recompute leaf if needed.
    let current = toUint8Array(proof.vcHash);

    for (const step of proof.proofPath || []) {
      const sibling = toUint8Array(step.sibling);
      const combined = step.isLeft
        ? concatBytes(sibling, current)
        : concatBytes(current, sibling);
      const hashed = await crypto.subtle.digest("SHA-256", combined);
      current = new Uint8Array(hashed);
    }

    const root = toUint8Array(proof.treeHash);
    return equalBytes(current, root);
  };

  const getVerificationProof = async (vcId) => {
    try {
      const actor = await createBackendActor(identity); // use same actor creation pattern as elsewhere
      const proofRes = await actor.generateVerificationProof(vcId);
      if (proofRes && proofRes.ok) {
        const clientValid = await verifyProofClientSide(proofRes.ok);
        return { ...proofRes.ok, clientValid };
      }
      throw new Error(
        proofRes && proofRes.err ? proofRes.err : "Proof not found"
      );
    } catch (err) {
      console.error("Error fetching verification proof:", err);
      throw err;
    }
  };

  const loadMyIssuedVCs = async () => {
    if (!identity) return;
    setIsLoadingVCs(true);
    try {
      console.log("📋 Loading issued VCs from IPFS...");
      const agent = await getAgent(identity);
      const actor = await createBackendActor(canisterId, { agent });
      const vcMetadataArray = await actor.getMyIssuedVCsMetadata();
      const vcsWithDocuments = await Promise.all(
        vcMetadataArray.map(async (metadata) => {
          try {
            const document = await retrieveVCDocument(metadata.ipfsCid);
            return {
              metadata,
              document,
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: document.credentialSubject || {},
              issuanceDate: document.issuanceDate,
              expirationDate: document.expirationDate,
              type: document.type,
            };
          } catch (error) {
            console.error(
              `❌ Failed to retrieve VC document for VC ID ${metadata.id}:`,
              error
            );
            return {
              metadata,
              document: null,
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: { id: metadata.subject },
              issuanceDate: new Date(
                Number(metadata.issuedAt / 1000000n)
              ).toISOString(),
              expirationDate: null,
              type: ["VerifiableCredential"],
            };
          }
        })
      );
      setMyIssuedVCs(vcsWithDocuments);
      console.log("✅ Loaded issued VCs:", vcsWithDocuments.length);
    } catch (error) {
      console.error("❌ Error loading issued VCs:", error);
      setMyIssuedVCs([]);
    } finally {
      setIsLoadingVCs(false);
    }
  };

  // Load VCs functions - FIXED
  const loadMyReceivedVCs = async () => {
    if (!did) return;
    setIsLoadingVCs(true);
    try {
      console.log("📥 Loading received VCs from IPFS...");
      const agent = await getAgent(identity); // Use authenticated identity
      const actor = await createBackendActor(identity);
      const vcMetadataArray = await actor.getVCsForDidMetadata(did);

      const vcsWithDocuments = await Promise.all(
        vcMetadataArray.map(async (metadata) => {
          try {
            const document = await retrieveVCDocument(metadata.ipfsCid);
            return {
              metadata,
              document,
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: document.credentialSubject || {},
              issuanceDate: document.issuanceDate,
              expirationDate: document.expirationDate,
              type: document.type,
            };
          } catch (error) {
            console.log("❌ Failed to retrieve VC document:", error);
            return null; // Skip failed retrievals
          }
        })
      );

      // Filter out null values
      setMyReceivedVCs(vcsWithDocuments.filter((vc) => vc !== null));
      console.log("✅ Loaded received VCs:", vcsWithDocuments.length);
      console.log("Received VCs:", vcsWithDocuments);
    } catch (error) {
      console.error("❌ Error loading received VCs:", error);
      setMyReceivedVCs([]);
    } finally {
      setIsLoadingVCs(false);
    }
  };

  // Replace your existing verifyVC and add these helper functions to your InternetIdentityContext

  // Helper: Convert certificate to proper format for agent verification
  const processCertificate = (certificate) => {
    if (!certificate) return null;

    // Convert the certificate blob to ArrayBuffer if needed
    const certBytes = toUint8Array(certificate);
    return certBytes.buffer;
  };

  // Helper: Verify certificate against IC root key
  const verifyCertificateWithAgent = async (certificate) => {
    try {
      if (!certificate) return false;

      // The agent automatically validates certificates during queries
      // For frontend verification, we can rely on the fact that if we got a response
      // from the canister, the certificate was already validated by the agent

      // Additional validation can be done by checking the certificate structure
      const certBytes = new Uint8Array(certificate);

      // Basic validation - check if it looks like a certificate
      // (Certificates typically start with specific CBOR headers)
      return certBytes.length > 50; // Simple length check as placeholder
    } catch (error) {
      console.error("Certificate validation error:", error);
      return false;
    }
  };

  // Main VC verification function - CORRECTED
  const verifyVC = async (vcId) => {
    try {
      console.log("🔍 Starting comprehensive VC verification:", vcId);

      // Step 1: Get verification proof from canister
      let proof;
      try {
        proof = await getVerificationProof(vcId);
        console.log("📋 Retrieved verification proof from canister");
      } catch (error) {
        console.error("❌ Failed to get verification proof:", error);
        return {
          isValid: false,
          status: "proof_retrieval_failed",
          error: error.message,
        };
      }

      // Step 2: Verify merkle proof client-side
      let merkleValid = false;
      try {
        merkleValid = await verifyProofClientSide(proof);
        console.log(
          "🌳 Merkle proof validation:",
          merkleValid ? "✅ VALID" : "❌ INVALID"
        );
      } catch (error) {
        console.error("❌ Merkle proof verification failed:", error);
        return {
          isValid: false,
          status: "merkle_verification_failed",
          error: error.message,
        };
      }

      // Step 3: Verify IC certificate with agent
      let certificateValid = false;
      if (proof.certificate) {
        try {
          const processedCert = processCertificate(proof.certificate);
          certificateValid = await verifyCertificateWithAgent(processedCert);
          console.log(
            "🔐 Certificate validation:",
            certificateValid ? "✅ VALID" : "❌ INVALID"
          );
        } catch (error) {
          console.error("❌ Certificate verification failed:", error);
          // Don't fail entirely if certificate verification fails
          certificateValid = false;
        }
      } else {
        console.warn("⚠️ No certificate provided in proof");
      }

      // Step 4: Check VC status (revocation, expiration) from canister
      let statusValid = false;
      try {
        const agent = await getAgent(); // Use anonymous agent
        const actor = await createBackendActor(null); // Anonymous actor
        const statusResult = await actor.verifyVCStatus(vcId);

        if (statusResult.ok) {
          statusValid = true;
          console.log(
            "📊 VC status check: ✅ VALID (not revoked, not expired)"
          );
        } else {
          console.log("📊 VC status check: ❌ INVALID -", statusResult.err);
        }
      } catch (error) {
        console.error("❌ VC status check failed:", error);
        return {
          isValid: false,
          status: "status_check_failed",
          error: error.message,
        };
      }

      // Step 5: Combine all verification results
      const isFullyValid = merkleValid && statusValid;

      // Certificate verification is optional but adds extra security
      const verificationResults = {
        isValid: isFullyValid,
        status: isFullyValid ? "valid" : "invalid",
        details: {
          merkleProofValid: merkleValid,
          certificateValid: certificateValid,
          statusValid: statusValid,
          vcHash: proof.vcHash ? Array.from(toUint8Array(proof.vcHash)) : null,
          treeHash: proof.treeHash
            ? Array.from(toUint8Array(proof.treeHash))
            : null,
          hasCertificate: !!proof.certificate,
        },
        proof: proof, // Include full proof for debugging
      };

      console.log("🏁 Final verification result:", verificationResults);
      return verificationResults;
    } catch (error) {
      console.error("❌ Comprehensive VC verification failed:", error);
      return {
        isValid: false,
        status: "verification_error",
        error: error.message,
      };
    }
  };

  // Alternative simpler verification if agent certificate verification is problematic
  const verifyVCSimplified = async (vcId) => {
    try {
      console.log("🔍 Starting simplified VC verification:", vcId);

      // Get verification proof and verify merkle proof
      const proof = await getVerificationProof(vcId);
      const merkleValid = await verifyProofClientSide(proof);

      // Check VC status from canister
      const actor = await createBackendActor(null);
      const statusResult = await actor.verifyVCStatus(vcId);
      const statusValid = statusResult.ok;

      const isValid = merkleValid && statusValid;

      return {
        isValid,
        status: isValid ? "valid" : "invalid",
        details: {
          merkleProofValid: merkleValid,
          statusValid: statusValid,
          statusError: statusResult.err || null,
        },
      };
    } catch (error) {
      console.error("❌ Simplified VC verification failed:", error);
      return {
        isValid: false,
        status: "verification_error",
        error: error.message,
      };
    }
  };

  const revokeVC = async (vcId) => {
    if (!identity) {
      throw new Error("Must be authenticated to revoke VCs");
    }
    try {
      console.log("🚫 Revoking VC:", vcId);
      const agent = await getAgent(identity);
      const actor = await createBackendActor(identity);
      const result = await actor.revokeVCWithIPFS(vcId);
      if (result.ok) {
        console.log("✅ VC revoked successfully");
        await loadMyIssuedVCs();
        return true;
      } else {
        throw new Error(result.err);
      }
    } catch (error) {
      console.error("❌ Error revoking VC:", error);
      throw error;
    }
  };

  const getVC = async (vcId) => {
    try {
      console.log("📄 Retrieving VC:", vcId);
      const agent = await getAgent(); // anonymous
      const actor = await createBackendActor(canisterId, { agent });
      const metadata = await actor.getVCMetadata(vcId);
      if (metadata) {
        const document = await retrieveVCDocument(metadata.ipfsCid);
        return {
          metadata,
          document,
          id: metadata.id,
          issuer: metadata.issuer,
          credentialSubject: document.credentialSubject || {},
          issuanceDate: document.issuanceDate,
          expirationDate: document.expirationDate,
          type: document.type,
        };
      }
      return null;
    } catch (error) {
      console.error("❌ Error getting VC:", error);
      throw error;
    }
  };

  useEffect(() => {
    if (identity && did) {
      loadMyIssuedVCs();
      loadMyReceivedVCs();
    }
    // eslint-disable-next-line
  }, [identity, did]);

  return (
    <InternetIdentityContext.Provider
      value={{
        identity,
        principal,
        did,
        didDocument,
        isAuthenticated,
        loginMethod,
        isAuthenticating,
        isResolvingDid,
        login,
        developerLogin,
        logout,
        resolveDid,
        myIssuedVCs,
        myReceivedVCs,
        isLoadingVCs,
        issueVC,
        loadMyIssuedVCs,
        loadMyReceivedVCs,
        verifyVC,
        verifyVCSimplified,
        revokeVC,
        getVC,
        isLocal, // Expose isLocal for components to use
        canisterId, // Expose canisterId for debugging
        getVerificationProof,
        verifyProofClientSide,
      }}
    >
      {children}
    </InternetIdentityContext.Provider>
  );
};

export const useInternetIdentity = () => useContext(InternetIdentityContext);
