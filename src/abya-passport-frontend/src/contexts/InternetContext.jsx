// src/abya-passport-frontend/src/contexts/InternetContext.jsx

import { createContext, useContext, useState, useEffect } from "react";
import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { createActor } from "../../../declarations/abya-passport-backend";
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

  // Initialize auth client
  useEffect(() => {
    AuthClient.create().then(async (client) => {
      setAuthClient(client);
      if (await client.isAuthenticated()) {
        handleLoginSuccess(client);
      }
    });
  }, []);

  const canisterId = "uxrrr-q7777-77774-qaaaq-cai";

  // Developer login with IPFS DID creation
  const developerLogin = async () => {
    try {
      console.log("🔧 Starting developer login...");

      const devIdentity = Ed25519KeyIdentity.generate();
      const principal = devIdentity.getPrincipal();

      console.log("🔧 Developer identity created:", {
        principal: principal.toString(),
        identityType: devIdentity.constructor.name,
      });

      setIdentity(devIdentity);
      setPrincipal(principal.toString());
      setIsAuthenticated(true);
      setLoginMethod("developer");

      // Create DID with IPFS storage for developer identity
      await createOrRetrieveDID(devIdentity);

      console.log("✅ Developer login successful");
    } catch (error) {
      console.error("❌ Developer login failed:", error);
    }
  };
  const login = async () => {
    setIsAuthenticating(true);

    try {
      // Always use local Internet Identity for local development
      const identityProvider =
        "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943";

      console.log("Using identity provider:", identityProvider);

      // Clear any cached Internet Identity data to avoid mainnet/local conflicts
      localStorage.removeItem("ic-identity");
      localStorage.removeItem("ic-delegation");
      sessionStorage.clear();

      authClient.login({
        identityProvider: identityProvider,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000), // 7 days
        onSuccess: () => handleLoginSuccess(authClient),
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
  const handleLoginSuccess = async (client) => {
    const identity = client.getIdentity();
    setIdentity(identity);
    setPrincipal(identity.getPrincipal().toString());
    setIsAuthenticated(true);
    setLoginMethod("internet-identity");

    // Check if DID already exists and create with IPFS if needed
    await createOrRetrieveDID(identity);

    setIsAuthenticating(false);
  };

  // Create DID with IPFS storage or retrieve existing one
  const createOrRetrieveDID = async (identity) => {
    try {
      const principalText = identity.getPrincipal().toString();
      const did = "did:icp:" + principalText;

      // Check if DID already exists on-chain
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      const hasExistingDID = await actor.hasMyDID();

      if (hasExistingDID) {
        console.log("📋 DID already exists, retrieving from IPFS...");

        // Get DID metadata from on-chain
        const didMetadata = await actor.getDIDMetadata(did);
        if (didMetadata) {
          // Retrieve DID document from IPFS
          const didDoc = await retrieveDIDDocument(didMetadata.ipfsCid);
          setDid(did);
          setDidDocument(didDoc);
          console.log("✅ DID retrieved successfully:", did);
        }
      } else {
        console.log("🆔 Creating new DID with IPFS storage...");

        // Create new DID document and upload to IPFS
        const {
          did: newDid,
          ipfsCid,
          document,
        } = await createAndUploadDID(principalText);

        // Store DID metadata on-chain
        const result = await actor.storeDIDDocument(ipfsCid);

        if (result.ok) {
          setDid(newDid);
          setDidDocument(document);
          console.log("✅ DID created and stored successfully:", newDid);
        } else {
          throw new Error(result.err);
        }
      }
    } catch (error) {
      console.error("❌ Error with DID creation/retrieval:", error);
      // Fallback to simple DID generation
      const did = "did:icp:" + identity.getPrincipal().toString();
      setDid(did);
      setDidDocument(null);
    }
  };

  const logout = async () => {
    if (authClient && loginMethod === "internet-identity") {
      await authClient.logout();
    }

    // Clear all cached Internet Identity data
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

  const resolveDid = async (didToResolve = null) => {
    const targetDid = didToResolve || did;

    if (!targetDid) {
      console.error("No DID available to resolve");
      return null;
    }

    setIsResolvingDid(true);

    try {
      // Create anonymous agent for public DID resolution
      // This avoids certificate verification issues with mainnet II + local backend
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        // Don't pass identity for public resolution
      });

      // Disable certificate verification for local development
      await agent.fetchRootKey();

      // Initialize actor with anonymous agent
      const actor = createActor(canisterId, { agent });

      const document = await actor.resolveDid(targetDid);
      console.log("Resolved DID Document:", document);

      // Parse the JSON string to make it more usable
      const parsedDocument = JSON.parse(document);
      setDidDocument(parsedDocument);

      return parsedDocument;
    } catch (error) {
      console.error("Error resolving DID:", error);
      console.error("Error details:", error.message);
      setDidDocument(null);
      return null;
    } finally {
      setIsResolvingDid(false);
    }
  };

  // ==================== VC FUNCTIONS ====================

  // Issue a new VC with IPFS storage
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

      // Create authenticated agent
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      // Step 1: Create VC document and upload to IPFS
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

      // Step 2: Store VC metadata on-chain (atomic transaction)
      try {
        const result = await actor.issueVCWithIPFS(
          vcId,
          ipfsCid,
          recipientDid,
          ["VerifiableCredential"],
          expiresInHours ? [BigInt(expiresInHours)] : []
        );

        if (result.ok) {
          console.log("✅ VC issued successfully:", vcId);

          // Refresh the issued VCs list
          await loadMyIssuedVCs();

          return {
            id: vcId,
            ipfsCid: ipfsCid,
            document: document,
          };
        } else {
          throw new Error(result.err);
        }
      } catch (onChainError) {
        // Rollback: Remove from IPFS since on-chain storage failed
        console.warn(
          "⚠️  On-chain storage failed, rolling back IPFS upload..."
        );
        if (ipfsCid) {
          try {
            await rollbackIPFS(ipfsCid);
            console.log("✅ IPFS rollback completed");
          } catch (rollbackError) {
            console.error("❌ Failed to rollback IPFS content:", rollbackError);
            // Still throw the original on-chain error
          }
        }
        throw onChainError;
      }
    } catch (error) {
      console.error("❌ Error issuing VC:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      throw error;
    }
  };

  // Load VCs issued by the current user from IPFS
  const loadMyIssuedVCs = async () => {
    if (!identity) return;

    setIsLoadingVCs(true);
    try {
      console.log("📋 Loading issued VCs from IPFS...");

      // Create authenticated agent
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      // Get VC metadata (includes IPFS CIDs)
      const vcMetadataArray = await actor.getMyIssuedVCsMetadata();

      // Retrieve full VC documents from IPFS
      const vcsWithDocuments = await Promise.all(
        vcMetadataArray.map(async (metadata) => {
          try {
            const document = await retrieveVCDocument(metadata.ipfsCid);
            return {
              metadata,
              document,
              // Legacy format for compatibility
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: document.credentialSubject || {},
              issuanceDate: document.issuanceDate,
              expirationDate: document.expirationDate,
              type: document.type,
            };
          } catch (error) {
            console.error(
              `Failed to retrieve VC ${metadata.id} from IPFS:`,
              error
            );
            // Return metadata only if IPFS retrieval fails
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

  // Load VCs received by the current user from IPFS
  const loadMyReceivedVCs = async () => {
    if (!did) return;

    setIsLoadingVCs(true);
    try {
      console.log("📥 Loading received VCs from IPFS...");

      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      // Get VC metadata for this DID (includes IPFS CIDs)
      const vcMetadataArray = await actor.getVCsForDidMetadata(did);

      // Retrieve full VC documents from IPFS
      const vcsWithDocuments = await Promise.all(
        vcMetadataArray.map(async (metadata) => {
          try {
            const document = await retrieveVCDocument(metadata.ipfsCid);
            return {
              metadata,
              document,
              // Legacy format for compatibility
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: document.credentialSubject || {},
              issuanceDate: document.issuanceDate,
              expirationDate: document.expirationDate,
              type: document.type,
            };
          } catch (error) {
            console.error(
              `Failed to retrieve VC ${metadata.id} from IPFS:`,
              error
            );
            // Return metadata only if IPFS retrieval fails
            return {
              metadata,
              document: null,
              id: metadata.id,
              issuer: metadata.issuer,
              credentialSubject: { id: did },
              issuanceDate: new Date(
                Number(metadata.issuedAt / 1000000n)
              ).toISOString(),
              expirationDate: null,
              type: ["VerifiableCredential"],
            };
          }
        })
      );

      setMyReceivedVCs(vcsWithDocuments);
      console.log("✅ Loaded received VCs:", vcsWithDocuments.length);
    } catch (error) {
      console.error("❌ Error loading received VCs:", error);
      setMyReceivedVCs([]);
    } finally {
      setIsLoadingVCs(false);
    }
  };

  // Verify a VC status
  const verifyVC = async (vcId) => {
    try {
      console.log("🔍 Verifying VC:", vcId);

      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      const result = await actor.verifyVCStatus(vcId);

      if (result.ok) {
        console.log("✅ VC verification successful");
        return { isValid: true, status: "valid" };
      } else {
        console.log("❌ VC verification failed:", result.err);
        return { isValid: false, status: result.err };
      }
    } catch (error) {
      console.error("❌ Error verifying VC:", error);
      return {
        isValid: false,
        status: "verification_failed",
        error: error.message,
      };
    }
  };

  // Revoke a VC (only for issuers)
  const revokeVC = async (vcId) => {
    if (!identity) {
      throw new Error("Must be authenticated to revoke VCs");
    }

    try {
      console.log("🚫 Revoking VC:", vcId);

      // Create authenticated agent with the current identity
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      const result = await actor.revokeVCWithIPFS(vcId);

      if (result.ok) {
        console.log("✅ VC revoked successfully");
        // Refresh the issued VCs list
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

  // Get a specific VC by ID from IPFS
  const getVC = async (vcId) => {
    try {
      console.log("📄 Retrieving VC:", vcId);

      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });
      await agent.fetchRootKey();
      const actor = createActor(canisterId, { agent });

      // Get VC metadata including IPFS CID
      const metadata = await actor.getVCMetadata(vcId);

      if (metadata) {
        // Retrieve full VC document from IPFS
        const document = await retrieveVCDocument(metadata.ipfsCid);

        return {
          metadata,
          document,
          // Legacy format for compatibility
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

  // Load VCs when user logs in
  useEffect(() => {
    if (identity && did) {
      loadMyIssuedVCs();
      loadMyReceivedVCs();
    }
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
        // VC functions
        myIssuedVCs,
        myReceivedVCs,
        isLoadingVCs,
        issueVC,
        loadMyIssuedVCs,
        loadMyReceivedVCs,
        verifyVC,
        revokeVC,
        getVC,
      }}
    >
      {/* <WagmiConfig config={wagmiConfig}> */}
      {children}
      {/* </WagmiConfig> */}
    </InternetIdentityContext.Provider>
  );
};

export const useInternetIdentity = () => useContext(InternetIdentityContext);
