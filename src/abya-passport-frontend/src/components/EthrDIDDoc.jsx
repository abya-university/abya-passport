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
    <div className="max-w-xl mx-auto p-4 bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg">
      <h2 className="text-xl font-semibold mb-4">
        Resolve & Store Ethereum DID
      </h2>

      <div className="mb-4">
        <p>
          <strong>Wallet Address:</strong> {walletAddress}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Enter DID (e.g. did:ethr:sepolia:0x...)"
          value={didInput}
          onChange={(e) => setDidInput(e.target.value)}
          className="flex-1 border px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleResolve}
          disabled={loading}
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? "Processing…" : "Resolve & Store"}
        </button>
      </div>

      {error && <div className="text-red-600 mb-4">Error: {error}</div>}

      {didDoc && (
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg overflow-auto">
            <h3 className="font-semibold">DID Document</h3>
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {JSON.stringify(didDoc, null, 2)}
            </pre>
          </div>
          <p>
            <strong>IPFS CID:</strong> {ipfsCid || "–"}
          </p>
          <p>
            <strong>Registry CID:</strong> {registryCid || "–"}
          </p>
        </div>
      )}
    </div>
  );
}
