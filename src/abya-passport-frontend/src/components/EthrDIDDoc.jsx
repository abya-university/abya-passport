// src/abya-passport-frontend/src/components/EthrDIDDoc.jsx

import React, { useState, useEffect } from 'react';
import { useEthr } from "../contexts/EthrContext";

const API_URL = process.env.REACT_APP_VERAMO_API_URL || 'http://localhost:3000';

/**
 * EthrDIDDoc
 * A component to resolve and display the DID Document for a given Ethereum-based DID.
 *
 * Usage:
 * <EthrDIDDoc />
 */
export default function EthrDIDDoc() {
  const [didInput, setDidInput]     = useState('');
  const [didDoc, setDidDoc]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // pull in everything from context
  const ethrContext = useEthr();
  const { walletAddress, walletDid, didLoading } = ethrContext;

  // Optional: when ethrDid arrives, auto-fill the input
  useEffect(() => {
    if (walletDid) {
      setDidInput(walletDid);
    }
  }, [walletDid]);

  const handleResolve = async () => {
    if (!didInput) return;
    setLoading(true);
    setError(null);
    setDidDoc(null);

    try {
      const res = await fetch(
        `${API_URL}/did/${encodeURIComponent(didInput)}/resolve`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to resolve DID');
      }
      const json = await res.json();
      setDidDoc(json.resolution || json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (didLoading) return <p>Loading your DID…</p>;
  if (!walletAddress) return <p>Please connect your wallet.</p>;

  return (
    <div className="max-w-xl mx-auto p-4 bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg">
      <h2 className="text-xl font-semibold mb-4">Resolve Ethereum DID</h2>

      {/* 1. Display basic pieces */}
      <div className="mb-4">
        <p><strong>Wallet Address:</strong> {walletAddress || '–'}</p>
        {/* <p><strong>Ethereum DID:</strong> {walletDid || '–'}</p> */}
      </div>

      {/* 2. (Optional) Show entire context as JSON */}
      <details className="mb-4 bg-gray-50 p-3 rounded-lg">
        <summary className="cursor-pointer text-sm font-medium">
          Show full EthrContext
        </summary>
        <pre className="text-xs font-mono mt-2 overflow-auto">
          {JSON.stringify(ethrContext, null, 2)}
        </pre>
      </details>

      {/* 3. Resolve form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Enter your DID (e.g. did:ethr:sepolia:0x...)"
          value={didInput}
          onChange={(e) => setDidInput(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleResolve}
          disabled={loading}
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Resolving…' : 'Resolve'}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-600 font-medium">
          Error: {error}
        </div>
      )}

      {didDoc && (
        <div className="bg-gray-50 p-4 rounded-lg overflow-auto">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {JSON.stringify(didDoc, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
