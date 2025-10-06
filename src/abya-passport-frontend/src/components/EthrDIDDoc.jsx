// src/components/EthrDIDDoc.jsx
import React, { useState, useEffect } from "react";
import { useEthr } from "../contexts/EthrContext";
import { storeDidDocument, registerDidOnIpfs } from "../services/ipfsService";
import { useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { ethers } from "ethers";

const API_URL =
  import.meta.env.VITE_APP_VERAMO_API_URL ||
  "https://veramo-backend-service.onrender.com";

const parseRegistryMap = () => {
  try {
    const raw = import.meta.env.VITE_DID_REGISTRIES || "{}";
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed parsing VITE_DID_REGISTRIES:", e);
    return {};
  }
};

// Minimal ABI for a simple registry contract that has registerDid(did, cid)
const registryAbi = [
  "function registerDid(string did, string cid) external",
];

export default function EthrDIDDoc() {
  const [didInput, setDidInput] = useState("");
  const [didDoc, setDidDoc] = useState(null);
  const [ipfsCid, setIpfsCid] = useState("");
  const [registryCid, setRegistryCid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [anchorStatus, setAnchorStatus] = useState(null);

  // EthrContext holds walletAddress and walletDid
  const { walletAddress, walletDid, didLoading } = useEthr();

  // thirdweb hooks
  const account = useActiveAccount();
  const activeChain = useActiveWalletChain();

  const registryMap = parseRegistryMap();
  const networkSlug =
    activeChain?.slug ||
    (activeChain?.name && activeChain.name.toLowerCase().replace(/\s+/g, "-")) ||
    "unknown";
  const registryAddress = registryMap[networkSlug] || null;

  useEffect(() => {
    console.log("Thirdweb account:", account?.address);
    console.log("Active chain:", activeChain);
    console.log("Registry map:", registryMap);
    console.log("Registry address for chain:", registryAddress);
  }, [account, activeChain, registryAddress]);

  // Sync did input when EthrContext updates
  useEffect(() => {
    if (walletDid) setDidInput(walletDid);
  }, [walletDid]);

  const buildChainAwareDid = (addr) => {
    if (!addr) return null;
    const a = addr.toLowerCase();
    const slug = networkSlug || "eth";
    return `did:ethr:${slug}:${a}`;
  };

  // Try to obtain an ethers.js Signer from available providers
  const getSigner = async () => {
    // 1) Prefer window.ethereum (MetaMask / injected providers)
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        // If using walletconnect / injected it might require enabling
        try {
          // request accounts if not already enabled - it's safe since user is connected
          await provider.send("eth_requestAccounts", []);
        } catch (e) {
          // ignore request error; signer may still be usable
        }
        return provider.getSigner();
      } catch (e) {
        console.warn("window.ethereum provider failed:", e);
      }
    }

    // 2) Try to use thirdweb account connector provider (best-effort)
    try {
      // account?.connector may expose getProvider (depends on connector)
      const connector = account?.connector;
      if (connector && typeof connector.getProvider === "function") {
        const proxied = await connector.getProvider();
        if (proxied) {
          const provider = new ethers.providers.Web3Provider(proxied);
          return provider.getSigner();
        }
      }
    } catch (err) {
      console.warn("Failed to get provider from account.connector:", err);
    }

    // 3) No signer available
    return null;
  };

  // Attempt to call the registry contract's registerDid(did, cid)
  const anchorOnChain = async (registryAddr, canonicalDid, cid) => {
    if (!registryAddr) throw new Error("No registry address provided");
    const signer = await getSigner();
    if (!signer) throw new Error("No signer/provider available for on-chain anchoring");

    const contract = new ethers.Contract(registryAddr, registryAbi, signer);

    // Call contract function (transaction)
    const tx = await contract.registerDid(canonicalDid, cid);
    // wait for confirmation
    const receipt = await tx.wait();
    const hash = receipt?.transactionHash || tx.hash;
    return { hash, receipt };
  };

  const handleResolve = async () => {
    setError(null);
    setLoading(true);
    setDidDoc(null);
    setIpfsCid("");
    setRegistryCid("");
    setTxHash(null);
    setAnchorStatus(null);

    try {
      const didToResolve = didInput || buildChainAwareDid(walletAddress) || buildChainAwareDid(account?.address);
      if (!didToResolve) throw new Error("No DID available to resolve");

      // 1) Resolve via Veramo
      const res = await fetch(`${API_URL}/did/${encodeURIComponent(didToResolve)}/resolve`);
      if (!res.ok) {
        const txt = await res.text();
        let parsed;
        try { parsed = JSON.parse(txt); } catch {}
        throw new Error(parsed?.error || `Failed to resolve DID: ${txt}`);
      }
      const json = await res.json();
      const doc = json.resolution || json;
      setDidDoc(doc);

      // 2) Store DID Doc on IPFS
      let cid;
      try {
        cid = await storeDidDocument(didToResolve, doc);
        setIpfsCid(cid);
      } catch (ipfsErr) {
        console.error("IPFS store failed:", ipfsErr);
        setError(`DID resolved but IPFS storage failed: ${ipfsErr.message}`);
        setLoading(false);
        return;
      }

      // canonical DID to anchor
      const canonicalDid = didToResolve.startsWith("did:") ? didToResolve : buildChainAwareDid(walletAddress || account?.address);

      // 3) On-chain anchor if registry available
      if (registryAddress) {
        try {
          setAnchorStatus("onchain");
          const result = await anchorOnChain(registryAddress, canonicalDid, cid);
          setRegistryCid(cid);
          setTxHash(result.hash);
        } catch (onchainErr) {
          console.error("On-chain anchor failed:", onchainErr);
          setAnchorStatus(null);
          // fall through to IPFS registry fallback
        }
      }

      // 4) Fallback to IPFS registry if no on-chain success
      if (!txHash) {
        try {
          const regCid = await registerDidOnIpfs(canonicalDid, cid);
          setRegistryCid(regCid);
          setAnchorStatus("ipfs");
        } catch (regErr) {
          console.error("IPFS registry registration failed:", regErr);
          // don't throw; main path succeeded (resolve+store)
        }
      }
    } catch (err) {
      console.error("DID resolution error:", err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  if (didLoading) return <p>Loading your DID…</p>;
  if (!account || !walletAddress) return <p>Please connect your wallet in the Navbar.</p>;

  const chainLabel = activeChain?.name || activeChain?.slug || networkSlug || "unknown";

  return (
    <div className="relative group bg-transparent border border-blue-200 rounded-2xl max-w-2xl mx-auto p-8 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card backdrop-blur-xl mt-12">
      <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24">
          <polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" />
          <polygon points="12,2 12,22 19,12" fill="#f0ce00" />
        </svg>
      </div>

      <h2 className="text-3xl font-bold text-blue-900 dark-text-yellow mb-6 text-center">
        Ethereum DID Resolver
      </h2>
      <p className="text-xl text-gray-600 mb-8 text-center">
        Resolve your DID and store/anchor it.
      </p>

      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-blue-900 dark-text-yellow text-base text-center w-full">
          <span className="font-semibold">Wallet Address:</span>
          <span className="ml-2 break-all">{walletAddress}</span>
          <span className="ml-4 px-2 py-0.5 text-xs text-gray-100 border border-blue-200 rounded-full bg-slate-800">
            {chainLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6 border border-blue-200 rounded-2xl p-4 bg-white/60 darkcard">
        <input
          type="text"
          placeholder={`Enter DID (or leave to use ${buildChainAwareDid(walletAddress)})`}
          value={didInput}
          onChange={(e) => setDidInput(e.target.value)}
          className="flex-1 border border-blue-200 bg-white text-blue-900 dark-text-yellow px-4 py-3 rounded-3xl focus:ring-2 focus:ring-blue-400 transition-colors"
        />
        <button
          onClick={handleResolve}
          disabled={loading}
          className={`px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 disabled:opacity-50 border ${
            window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "bg-yellow-400 border-yellow-400 text-blue-900 hover:bg-yellow-500"
              : "bg-blue-900 border-blue-400 text-gray-100 hover:bg-blue-700"
          }`}
        >
          {loading ? "Processing…" : "Resolve & Store"}
        </button>
      </div>

      {error && <div className="text-red-600 mb-4 text-center font-semibold">Error: {error}</div>}

      {didDoc && (
        <div className="space-y-4 mt-6">
          <div className="bg-gray-200 darkcard p-4 rounded-xl overflow-auto shadow-inner">
            <h3 className="font-semibold text-blue-900 dark-text-yellow mb-4 text-center">DID Document</h3>
            <pre className="text-xs font-mono whitespace-pre-wrap text-blue-950 dark-text-white">{JSON.stringify(didDoc, null, 2)}</pre>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:gap-8 gap-2 text-blue-900 dark-text-yellow">
            <span className="font-semibold">DID Doc: CID</span>
            <span className="break-all">{ipfsCid || "–"}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:gap-8 gap-2 text-blue-900 dark-text-yellow">
            <span className="font-semibold">Registry Result</span>
            <div className="flex flex-col gap-1">
              <span className="break-all">{registryCid || "–"}</span>
              {anchorStatus === "onchain" && txHash && (
                <a className="text-sm underline" href={`${activeChain?.explorer?.url || ""}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  View on {chainLabel} explorer
                </a>
              )}
              {anchorStatus === "ipfs" && <span className="text-xs text-gray-600">Registered in IPFS registry</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
