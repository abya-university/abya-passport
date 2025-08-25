// src/abya-passport-frontend/src/contexts/InternetContext.jsx

import { createContext, useContext, useState, useEffect, useRef } from "react";
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

  // Network detection
  const isLocal =
    typeof window !== "undefined" &&
    (import.meta.env.VITE_APP_DFX_NETWORK === "local" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const IC_HOST = isLocal ? "http://127.0.0.1:4943" : "https://ic0.app";
  // const canisterId = "uxrrr-q7777-77774-qaaaq-cai";
  const canisterId =
    import.meta.env.VITE_APP_BACKEND_CANISTER_ID ||
    "uxrrr-q7777-77774-qaaaq-cai";

  // Agent cache (to avoid re-creating agents)
  const agentCache = useRef({});

  // Helper to get a configured agent (optionally with identity)
  const getAgent = async (identity = null) => {
    const key = identity ? identity.getPrincipal().toString() : "anonymous";
    if (agentCache.current[key]) {
      return agentCache.current[key];
    }
    const agent = new HttpAgent({
      host: IC_HOST,
      ...(identity ? { identity } : {}),
    });
    if (isLocal) {
      await agent.fetchRootKey();
    }
    agentCache.current[key] = agent;
    return agent;
  };

  // Initialize auth client
  useEffect(() => {
    AuthClient.create().then(async (client) => {
      setAuthClient(client);
      if (await client.isAuthenticated()) {
        handleLoginSuccess(client);
      }
    });
  }, []);

  // Developer login with IPFS DID creation
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

  const login = async () => {
    setIsAuthenticating(true);

    try {
      // Always use local Internet Identity for local development
      const identityProvider = isLocal
        ? "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943"
        : "https://identity.ic0.app";

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

    await createOrRetrieveDID(identity);

    setIsAuthenticating(false);
  };

  // Create DID with IPFS storage or retrieve existing one
  const createOrRetrieveDID = async (identity) => {
    try {
      const principalText = identity.getPrincipal().toString();
      const did = "did:icp:" + principalText;

      const agent = await getAgent(identity);
      const actor = createActor(canisterId, { agent });

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
    } catch (error) {
      console.error("❌ Error with DID creation/retrieval:", error);
      const did = "did:icp:" + identity.getPrincipal().toString();
      setDid(did);
      setDidDocument(null);
    }
  };

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

  const resolveDid = async (didToResolve = null) => {
    const targetDid = didToResolve || did;
    if (!targetDid) {
      console.error("No DID available to resolve");
      return null;
    }
    setIsResolvingDid(true);
    try {
      const agent = await getAgent(); // anonymous
      const actor = createActor(canisterId, { agent });
      const document = await actor.resolveDid(targetDid);
      console.log("Resolved DID Document:", document);
      const parsedDocument = JSON.parse(document);
      setDidDocument(parsedDocument);
      return parsedDocument;
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
      const actor = createActor(canisterId, { agent });

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
        const result = await actor.issueVCWithIPFS(
          vcId,
          ipfsCid,
          recipientDid,
          ["VerifiableCredential"],
          expiresInHours ? [BigInt(expiresInHours)] : []
        );
        if (result.ok) {
          console.log("✅ VC issued successfully:", vcId);
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

  const loadMyIssuedVCs = async () => {
    if (!identity) return;
    setIsLoadingVCs(true);
    try {
      console.log("📋 Loading issued VCs from IPFS...");
      const agent = await getAgent(identity);
      const actor = createActor(canisterId, { agent });
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

  const loadMyReceivedVCs = async () => {
    if (!did) return;
    setIsLoadingVCs(true);
    try {
      console.log("📥 Loading received VCs from IPFS...");
      const agent = await getAgent(); // anonymous
      const actor = createActor(canisterId, { agent });
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

  const verifyVC = async (vcId) => {
    try {
      console.log("🔍 Verifying VC:", vcId);
      const agent = await getAgent(); // anonymous
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

  const revokeVC = async (vcId) => {
    if (!identity) {
      throw new Error("Must be authenticated to revoke VCs");
    }
    try {
      console.log("🚫 Revoking VC:", vcId);
      const agent = await getAgent(identity);
      const actor = createActor(canisterId, { agent });
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
      const actor = createActor(canisterId, { agent });
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
        revokeVC,
        getVC,
      }}
    >
      {children}
    </InternetIdentityContext.Provider>
  );
};

export const useInternetIdentity = () => useContext(InternetIdentityContext);
