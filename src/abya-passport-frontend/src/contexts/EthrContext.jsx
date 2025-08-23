// src/contexts/EthrContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";

const API_URL =
  import.meta.env.VITE_APP_VERAMO_API_URL || "http://localhost:3000";

const EthrContext = createContext({
  walletAddress: null,
  walletDid: null,
  didLoading: false,
  refreshDid: () => {},
  setWalletAddress: () => {},
  setWalletDid: () => {},
});

export function EthrProvider({ children }) {
  const [walletAddress, _setWalletAddress] = useState(null);
  const [walletDid, _setWalletDid] = useState(null);
  const [didLoading, setDidLoading] = useState(false);

  const { user, primaryWallet } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();

  const smartWallet = user?.verifiedCredentials?.find(
    (cred) => cred.walletName === "zerodev" || primaryWallet?.address
  );

  // whenever the connected address changes, reset state
  useEffect(() => {
    _setWalletAddress(isLoggedIn ? smartWallet?.address : null);
    _setWalletDid(null);
  }, [smartWallet?.address, isLoggedIn]);

  const setWalletAddress = (addr) => _setWalletAddress(addr);
  const setWalletDid = (did) => _setWalletDid(did);

  const refreshDid = async () => {
    if (!isLoggedIn || !smartWallet?.address) return;
    setDidLoading(true);
    const alias = `issuer-wallet-${smartWallet?.address}`;
    try {
      // 1) list
      const listRes = await fetch(`${API_URL}/did/list`);
      const { success, identifiers = [] } = await listRes.json();
      if (success) {
        const found = identifiers.find((i) =>
          i.did.toLowerCase().endsWith(smartWallet?.address.toLowerCase())
        );
        if (found) {
          setWalletDid(found.did);
          return;
        }
      }
      // 2) create
      const createRes = await fetch(`${API_URL}/did/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "did:ethr",
          walletAddress: smartWallet?.address,
          alias,
        }),
      });
      const createJson = await createRes.json();
      if (createJson.success && createJson.identifier?.did) {
        setWalletDid(createJson.identifier.did);
      } else if (
        !createJson.success &&
        createJson.error?.includes("already exists")
      ) {
        // retry list to pull it down
        const retryList = await fetch(`${API_URL}/did/list`);
        const { identifiers: retryIds = [] } = await retryList.json();
        const retryFound = retryIds.find((i) => i.alias === alias);
        if (retryFound) setWalletDid(retryFound.did);
      } else {
        console.error("Unexpected DID create response:", createJson);
      }
    } catch (err) {
      console.error("Error fetching/creating DID:", err);
    } finally {
      setDidLoading(false);
    }
  };

  // automatically run refreshDid once when address appears
  useEffect(() => {
    if ((isLoggedIn && smartWallet?.address) || primaryWallet?.address) {
      refreshDid();
    }
  }, [isLoggedIn, smartWallet?.address || primaryWallet?.address]);

  return (
    <EthrContext.Provider
      value={{
        walletAddress,
        walletDid,
        didLoading,
        refreshDid,
        setWalletAddress,
        setWalletDid,
      }}
    >
      {children}
    </EthrContext.Provider>
  );
}

export function useEthr() {
  return useContext(EthrContext);
}
