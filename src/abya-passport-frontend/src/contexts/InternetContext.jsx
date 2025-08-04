import { createContext, useContext, useState, useEffect } from "react";
import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { createActor } from "../../../declarations/abya-passport-backend";

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

  // Developer login with debugging
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

      // Generate DID for developer identity
      const did = "did:icp:" + principal.toString();
      setDid(did);
      console.log("🔧 Generated DID:", did);

      console.log("✅ Developer login successful");
    } catch (error) {
      console.error("❌ Developer login failed:", error);
    }
  };

  const login = async () => {
    setIsAuthenticating(true);

    try {
      // Always use mainnet Internet Identity for better compatibility
      const identityProvider = "https://identity.ic0.app";

      console.log("Using identity provider:", identityProvider);

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
    if (authClient && loginMethod === "internet-identity") {
      await authClient.logout();
    }
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

  // Issue a new VC
  const issueVC = async (recipientDid, claims, expiresInHours = 24) => {
    if (!identity) {
      throw new Error("Must be authenticated to issue VCs");
    }

    try {
      console.log(
        "Issuing VC with identity:",
        identity.getPrincipal().toString()
      );

      // Create authenticated agent with proper configuration
      const agent = new HttpAgent({
        host: "http://127.0.0.1:4943",
        identity: identity,
      });

      // Always fetch root key for local development
      await agent.fetchRootKey();

      const actor = createActor(canisterId, { agent });

      // Convert claims object to array of tuples
      const claimsArray = Object.entries(claims);
      console.log("Claims array:", claimsArray);

      // Convert expiresInHours to optional bigint
      const expirationOption = expiresInHours ? [BigInt(expiresInHours)] : [];
      console.log("Expiration option:", expirationOption);

      console.log("Calling issueVC with:", {
        recipientDid,
        claimsArray,
        expirationOption,
      });

      const vcJson = await actor.issueVC(
        recipientDid,
        claimsArray,
        expirationOption
      );

      console.log("VC issued successfully:", vcJson);

      // Refresh the issued VCs list
      await loadMyIssuedVCs();

      return JSON.parse(vcJson);
    } catch (error) {
      console.error("Error issuing VC:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
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

      // Always fetch root key for local development
      await agent.fetchRootKey();

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

      // Always fetch root key for local development
      await agent.fetchRootKey();

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

      // Always fetch root key for local development
      await agent.fetchRootKey();

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

      // Always fetch root key for local development
      await agent.fetchRootKey();

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

      // Always fetch root key for local development
      await agent.fetchRootKey();

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
