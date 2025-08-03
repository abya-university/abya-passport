import { createContext, useContext, useState, useEffect } from "react";
import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from "@dfinity/agent";
import { createActor } from "../../../declarations/abya-passport-backend";

const InternetIdentityContext = createContext();

export const InternetIdentityProvider = ({ children }) => {
  const [authClient, setAuthClient] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [did, setDid] = useState(null);
  const [didDocument, setDidDocument] = useState(null);
  const [isResolvingDid, setIsResolvingDid] = useState(false);

  // VC-related state
  const [myIssuedVCs, setMyIssuedVCs] = useState([]);
  const [myReceivedVCs, setMyReceivedVCs] = useState([]);
  const [isLoadingVCs, setIsLoadingVCs] = useState(false);

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

  // Development mode bypass (for testing without Internet Identity)
  const loginAsDeveloper = async () => {
    setIsAuthenticating(true);

    try {
      // Import the Ed25519KeyIdentity for creating a test identity
      const { Ed25519KeyIdentity } = await import("@dfinity/identity");

      // Create a deterministic test identity for development
      const seed = new Uint8Array(32);
      // Fill with a deterministic pattern for consistent testing
      for (let i = 0; i < 32; i++) {
        seed[i] = i;
      }

      // Create the test identity
      const testIdentity = Ed25519KeyIdentity.fromSecretKey(seed);
      const testPrincipal = testIdentity.getPrincipal().toString();

      console.log("Created test identity with principal:", testPrincipal);

      setIdentity(testIdentity);
      setPrincipal(testPrincipal);

      // Generate DID for development
      const did = "did:icp:" + testPrincipal;
      setDid(did);

      setIsAuthenticating(false);
      console.log("Logged in as developer with DID:", did);
    } catch (error) {
      console.error("Error creating developer identity:", error);
      setIsAuthenticating(false);
    }
  };

  const login = async () => {
    setIsAuthenticating(true);

    try {
      // For development, we'll use a simpler approach
      // First try local Internet Identity, fallback to mainnet if local fails
      const localIdentityProvider = `http://127.0.0.1:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai`;
      const mainnetIdentityProvider = "https://identity.ic0.app";

      // Try local first, fallback to mainnet
      const identityProvider =
        process.env.DFX_NETWORK === "ic"
          ? mainnetIdentityProvider
          : localIdentityProvider;

      console.log("Using identity provider:", identityProvider);

      authClient.login({
        identityProvider: identityProvider,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000), // 7 days
        onSuccess: () => handleLoginSuccess(authClient),
        onError: (err) => {
          console.error("II Login failed:", err);
          console.log("Trying fallback authentication...");

          // Fallback: try mainnet Internet Identity for development
          if (identityProvider !== mainnetIdentityProvider) {
            authClient.login({
              identityProvider: mainnetIdentityProvider,
              maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
              onSuccess: () => handleLoginSuccess(authClient),
              onError: (fallbackErr) => {
                console.error("Fallback login also failed:", fallbackErr);
                setIsAuthenticating(false);
              },
            });
          } else {
            setIsAuthenticating(false);
          }
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

    // Generate DID after login - use simple DID generation instead of calling backend
    try {
      // For test purposes, generate DID locally to avoid certificate issues
      const did = "did:icp:" + identity.getPrincipal().toString();
      console.log("Generated DID:", did);
      setDid(did);
    } catch (error) {
      console.error("Error generating DID:", error);
      console.error("Error details:", error.message);
      setDid(null);
    }

    setIsAuthenticating(false);
  };

  const logout = async () => {
    await authClient?.logout();
    setIdentity(null);
    setPrincipal(null);
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

  // Issue a new VC
  const issueVC = async (recipientDid, claims, expiresInHours = 24) => {
    if (!identity) {
      throw new Error("Must be authenticated to issue VCs");
    }

    try {
      // Create authenticated agent with the current identity
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });

      // Fetch root key for local development
      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      // Convert claims object to array of tuples
      const claimsArray = Object.entries(claims);

      // Convert expiresInHours to optional bigint
      const expirationOption = expiresInHours ? [BigInt(expiresInHours)] : [];

      const vcJson = await actor.issueVC(
        recipientDid,
        claimsArray,
        expirationOption
      );

      // Refresh the issued VCs list
      await loadMyIssuedVCs();

      return JSON.parse(vcJson);
    } catch (error) {
      console.error("Error issuing VC:", error);
      throw error;
    }
  };

  // Load VCs issued by the current user
  const loadMyIssuedVCs = async () => {
    if (!identity) return;

    setIsLoadingVCs(true);
    try {
      // Create authenticated agent with the current identity
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });

      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      const vcJsonArray = await actor.getMyIssuedVCs();
      const vcs = vcJsonArray.map((vcJson) => JSON.parse(vcJson));
      setMyIssuedVCs(vcs);
    } catch (error) {
      console.error("Error loading issued VCs:", error);
      setMyIssuedVCs([]);
    } finally {
      setIsLoadingVCs(false);
    }
  };

  // Load VCs received by the current user (based on their DID)
  const loadMyReceivedVCs = async () => {
    if (!did) return;

    setIsLoadingVCs(true);
    try {
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });

      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      const vcJsonArray = await actor.getVCsForDid(did);
      const vcs = vcJsonArray.map((vcJson) => JSON.parse(vcJson));
      setMyReceivedVCs(vcs);
    } catch (error) {
      console.error("Error loading received VCs:", error);
      setMyReceivedVCs([]);
    } finally {
      setIsLoadingVCs(false);
    }
  };

  // Verify a VC
  const verifyVC = async (vcId) => {
    try {
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });

      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      const verification = await actor.verifyVC(vcId);
      return verification;
    } catch (error) {
      console.error("Error verifying VC:", error);
      throw error;
    }
  };

  // Revoke a VC (only for issuers)
  const revokeVC = async (vcId) => {
    if (!identity) {
      throw new Error("Must be authenticated to revoke VCs");
    }

    try {
      // Create authenticated agent with the current identity
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });

      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      const success = await actor.revokeVC(vcId);

      if (success) {
        // Refresh the issued VCs list
        await loadMyIssuedVCs();
      }

      return success;
    } catch (error) {
      console.error("Error revoking VC:", error);
      throw error;
    }
  };

  // Get a specific VC by ID
  const getVC = async (vcId) => {
    try {
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
      });

      if (process.env.DFX_NETWORK !== "ic") {
        await agent.fetchRootKey();
      }

      const actor = createActor(canisterId, { agent });

      const vcJson = await actor.getVC(vcId);
      return vcJson ? JSON.parse(vcJson) : null;
    } catch (error) {
      console.error("Error getting VC:", error);
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
        isAuthenticating,
        isResolvingDid,
        login,
        loginAsDeveloper, // Add developer login option
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
