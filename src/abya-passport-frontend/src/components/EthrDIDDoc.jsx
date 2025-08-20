// src/components/EthrDIDDoc.jsx
import React, { useState, useEffect } from "react";
import { useEthr } from "../contexts/EthrContext";
import { storeDidDocument, registerDidOnIpfs } from "../services/ipfsService";

const API_URL = process.env.VITE_APP_VERAMO_API_URL || "http://localhost:3000";

export default function EthrDIDDoc() {
  const [didInput, setDidInput] = useState("");
  const [didDoc, setDidDoc] = useState(null);
  const [ipfsCid, setIpfsCid] = useState("");
  const [registryCid, setRegistryCid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { walletAddress, walletDid, didLoading } = useEthr();

  // Debug environment variables on mount
  useEffect(() => {
    console.log("Environment check:", {
      API_URL,
      PINATA_JWT: import.meta.env.VITE_APP_PINATA_JWT ? "✓ Set" : "✗ Missing",
      PINATA_GATEWAY: import.meta.env.VITE_APP_PINATA_GATEWAY
        ? "✓ Set"
        : "✗ Missing",
    });
  }, []);

  useEffect(() => {
    if (walletDid) setDidInput(walletDid);
  }, [walletDid]);

  const handleResolve = async () => {
    if (!didInput) return;
    setLoading(true);
    setError(null);
    setDidDoc(null);
    setIpfsCid("");
    setRegistryCid("");

    try {
      // 1. Resolve via Veramo
      console.log("Resolving DID via Veramo:", didInput);
      const res = await fetch(
        `${API_URL}/did/${encodeURIComponent(didInput)}/resolve`
      );

      if (!res.ok) {
        const errText = await res.text();
        let errJson;
        try {
          errJson = JSON.parse(errText);
        } catch {
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        throw new Error(errJson.error || "Failed to resolve DID");
      }

      const json = await res.json();
      console.log("DID resolution response:", json);

      const doc = json.resolution || json;
      setDidDoc(doc);

      // 2. Store resolved document on IPFS (with error handling)
      try {
        console.log("Storing DID document on IPFS...", doc);
        const cid = await storeDidDocument(didInput, doc);
        console.log("Received IPFS CID:", cid);
        setIpfsCid(cid);
      } catch (ipfsError) {
        console.error("IPFS storage failed:", ipfsError);
        setError(`DID resolved but IPFS storage failed: ${ipfsError.message}`);
        return; // Don't continue to registry if IPFS storage failed
      }

      // 3. Register DID + CID in a global registry (with error handling)
      try {
        console.log("Registering DID on IPFS:", didInput);
        const regCid = await registerDidOnIpfs(didInput, ipfsCid);
        console.log("Received registry CID:", regCid);
        setRegistryCid(regCid);
      } catch (registryError) {
        console.error("Registry registration failed:", registryError);
        console.warn(
          "DID resolved and stored on IPFS, but registry registration failed"
        );
        // Don't set error here as the main functionality (resolve + store) succeeded
      }
    } catch (err) {
      console.error("DID resolution error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (didLoading) return <p>Loading your DID…</p>;
  if (!walletAddress) return <p>Please connect your wallet.</p>;

  return (
    <div className="relative group bg-transparent border border-blue-200 rounded-2xl max-w-2xl mx-auto p-8 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card backdrop-blur-xl mt-12">
      <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24">
          <polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" />
          <polygon points="12,2 12,22 19,12" fill="#f0ce00" />
        </svg>
      </div>
      <div className="mt-4 mb-4 flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
        <svg width="48" height="48" fill="none" viewBox="0 0 24 24" className="inline-block">
          <polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" />
          <polygon points="12,2 12,22 19,12" fill="#f0ce00" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-blue-900 dark-text-yellow mb-6 text-center">
        Ethereum DID Resolver
      </h2>
      <p className="text-xl text-gray-600 mb-8 text-center">
        Resolve your Ethereum DID and store it on IPFS.
      </p>
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-blue-900 dark-text-yellow text-base text-center w-full">
          <span className="font-semibold">Wallet Address:</span>
          <span className="ml-2 break-all">{walletAddress}</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6 border border-blue-200 rounded-2xl p-4 bg-white/60 darkcard">
        <input
          type="text"
          placeholder="Enter DID (e.g. did:ethr:sepolia:0x...)"
          value={didInput}
          onChange={(e) => setDidInput(e.target.value)}
          className="flex-1 border border-blue-200 bg-white text-blue-900 dark-text-yellow px-4 py-3 rounded-3xl focus:ring-2 focus:ring-blue-400 transition-colors"
        />
        <button
          onClick={handleResolve}
          disabled={loading}
          className={`
            px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 disabled:opacity-50 border
            ${
              window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'bg-yellow-400 border-yellow-400 text-blue-900 hover:bg-yellow-500 hover:border-yellow-500 hover:text-blue-900'
                : 'bg-blue-900 border-blue-400 text-gray-100 hover:bg-blue-700 hover:border-blue-500 hover:text-yellow-300'
            }
          `}
        >
          {loading ? "Processing…" : "Resolve & Store"}
        </button>
      </div>

      {error && (
        <div className="text-red-600 mb-4 text-center font-semibold">
          Error: {error}
        </div>
      )}

      {didDoc && (
        <div className="space-y-4 mt-6">
          <div className="bg-gray-200 darkcard p-4 rounded-xl overflow-auto shadow-inner">
            <h3 className="font-semibold text-blue-900 dark-text-yellow mb-16 text-center">DID Document</h3>
            <pre className="text-xs font-mono whitespace-pre-wrap text-blue-950 dark-text-white">
              {JSON.stringify(didDoc, null, 2)}
            </pre>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8 gap-2">
            <span className="font-semibold text-blue-900 dark-text-white">
              DID Doc: CID
            </span>
            <span className="break-all text-blue-900 dark:text-yellow-200">{ipfsCid || "–"}</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8 gap-2">
            <span className="font-semibold text-blue-900 dark-text-white">
              Registry: CID
            </span>
            <span className="break-all text-blue-900 dark:text-yellow-200">{registryCid || "–"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
