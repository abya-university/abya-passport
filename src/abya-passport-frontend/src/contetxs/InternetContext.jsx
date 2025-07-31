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

  const login = async () => {
    setIsAuthenticating(true);

    authClient.login({
      identityProvider: "https://identity.ic0.app",
      maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000), // 7 days
      onSuccess: () => handleLoginSuccess(authClient),
      onError: (err) => {
        console.error("II Login failed:", err);
        setIsAuthenticating(false);
      },
    });
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
        logout,
        resolveDid,
      }}
    >
      {/* <WagmiConfig config={wagmiConfig}> */}
      {children}
      {/* </WagmiConfig> */}
    </InternetIdentityContext.Provider>
  );
};

export const useInternetIdentity = () => useContext(InternetIdentityContext);
