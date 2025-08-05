// src/abya-passport-frontend/src/components/EthrDIDDoc.jsx

import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_VERAMO_API_URL || 'http://localhost:3000';

/**
 * EthrDIDDoc
 * A component to resolve and display the DID Document for a given Ethereum-based DID.
 *
 * Usage:
 * <EthrDIDDoc />
 */
export default function EthrDIDDoc() {
  const [didInput, setDidInput] = useState('');
  const [didDoc, setDidDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleResolve = async () => {
    if (!didInput) return;
    setLoading(true);
    setError(null);
    setDidDoc(null);
    try {
      const response = await fetch(`${API_URL}/did/${encodeURIComponent(didInput)}/resolve`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to resolve DID');
      }
      const json = await response.json();
      setDidDoc(json.resolution || json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg">
      <h2 className="text-xl font-semibold mb-4">Resolve Ethereum DID</h2>

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
          {loading ? 'Resolving...' : 'Resolve'}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-600 font-medium">Error: {error}</div>
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
