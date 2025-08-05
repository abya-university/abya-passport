// src/contexts/EthrContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

const API_URL = process.env.REACT_APP_VERAMO_API_URL || 'http://localhost:3000';

const EthrContext = createContext({
  walletAddress: null,
  walletDid: null,
  didLoading: false,
  refreshDid: () => {},
  setWalletAddress: () => {},
  setWalletDid: () => {},
});

export function EthrProvider({ children }) {
  const { address, isConnected } = useAccount();
  const [walletAddress, _setWalletAddress] = useState(null);
  const [walletDid, _setWalletDid] = useState(null);
  const [didLoading, setDidLoading] = useState(false);

  // whenever the connected address changes, reset state
  useEffect(() => {
    _setWalletAddress(isConnected ? address : null);
    _setWalletDid(null);
  }, [address, isConnected]);

  const setWalletAddress = (addr) => _setWalletAddress(addr);
  const setWalletDid     = (did)  => _setWalletDid(did);

  const refreshDid = async () => {
    if (!isConnected || !address) return;
    setDidLoading(true);
    const alias = `issuer-wallet-${address}`;
    try {
      // 1) list
      const listRes = await fetch(`${API_URL}/did/list`);
      const { success, identifiers = [] } = await listRes.json();
      if (success) {
        const found = identifiers.find(i =>
          i.did.toLowerCase().endsWith(address.toLowerCase())
        );
        if (found) {
          setWalletDid(found.did);
          return;
        }
      }
      // 2) create
      const createRes = await fetch(`${API_URL}/did/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'did:ethr', walletAddress: address, alias }),
      });
      const createJson = await createRes.json();
      if (createJson.success && createJson.identifier?.did) {
        setWalletDid(createJson.identifier.did);
      } else if (
        !createJson.success &&
        createJson.error?.includes('already exists')
      ) {
        // retry list to pull it down
        const retryList = await fetch(`${API_URL}/did/list`);
        const { identifiers: retryIds = [] } = await retryList.json();
        const retryFound = retryIds.find(i => i.alias === alias);
        if (retryFound) setWalletDid(retryFound.did);
      } else {
        console.error('Unexpected DID create response:', createJson);
      }
    } catch (err) {
      console.error('Error fetching/creating DID:', err);
    } finally {
      setDidLoading(false);
    }
  };

  // automatically run refreshDid once when address appears
  useEffect(() => {
    if (isConnected && address) {
      refreshDid();
    }
  }, [isConnected, address]);

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
