import { createContext, useContext, useState, useEffect } from "react";
import { AuthClient } from "@dfinity/auth-client";

const InternetIdentityContext = createContext();

export const InternetIdentityProvider = ({ children }) => {
  const [authClient, setAuthClient] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Initialize auth client
  useEffect(() => {
    AuthClient.create().then(async (client) => {
      setAuthClient(client);
      if (await client.isAuthenticated()) {
        handleLoginSuccess(client);
      }
    });
  }, []);

  const login = async () => {
    setIsAuthenticating(true);
    authClient.login({
      identityProvider: import.meta.env.VITE_APP_BACKEND_CANISTER_ID
        ? `https://${import.meta.env.VITE_APP_BACKEND_CANISTER_ID}.ic0.app`
        : "https://identity.ic0.app",
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
    setIsAuthenticating(false);
  };

  const logout = async () => {
    await authClient?.logout();
    setIdentity(null);
    setPrincipal(null);
  };

  return (
    <InternetIdentityContext.Provider
      value={{
        identity,
        principal,
        isAuthenticating,
        login,
        logout,
      }}
    >
      {/* <WagmiConfig config={wagmiConfig}> */}
      {children}
      {/* </WagmiConfig> */}
    </InternetIdentityContext.Provider>
  );
};

export const useInternetIdentity = () => useContext(InternetIdentityContext);
