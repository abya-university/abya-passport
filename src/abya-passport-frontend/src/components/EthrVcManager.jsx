// src/components/EthrVcManager.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import * as ethers from "ethers";
import { storeCredential, fetchDidDocument } from "../services/ipfsService";
import { useEthr } from "../contexts/EthrContext";

const API_BASE = "http://localhost:3000";
const VC_ADDRESS = import.meta.env.VITE_VC_CONTRACT_ADDRESS || "0xE2ff8118Bc145F03410F46728BaE0bF3f1C6EF81";

const VC_ABI = [
  "function issueCredential(string studentDID,string credentialType,string metadata,string credentialHash,string signature,string mappingCID)",
  "function getCredentialsForStudent(string studentDID) view returns (uint256[])",
  "function credentialCount() view returns (uint256)",
  "function credentials(uint256) view returns (uint256,string,string,string,uint256,string,string,string,string,bool)"
];

const EthrVcManager = () => {
  const { walletAddress, walletDid, didLoading } = useEthr();

  const [formData, setFormData] = useState({
    issuerDid: "",
    subjectDid: "",
    name: "",
    role: "",
    organization: "",
    expirationDate: "",
  });

  const [credential, setCredential] = useState(null); // latest created via backend
  const [credentials, setCredentials] = useState([]); // displayed list (backend or on-chain+IPFS merged)
  const [jwtToVerify, setJwtToVerify] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [ipfsToken, setIpfsToken] = useState("");
  const [ipfsStatus, setIpfsStatus] = useState({});
  const [chainStatus, setChainStatus] = useState({});
  // debugging / diagnostics
  const [lastOnchainIds, setLastOnchainIds] = useState([]); // raw ids returned by getCredentialsForStudent
  const [lastOnchainRowsDebug, setLastOnchainRowsDebug] = useState([]); // raw row shapes for debugging

  // Prefill subjectDid with walletDid when available (don't overwrite user edits)
  useEffect(() => {
    if (didLoading) return;
    if (walletDid) {
      setFormData((f) => (f.subjectDid ? f : { ...f, subjectDid: walletDid }));
    }
  }, [walletDid, didLoading]);

  useEffect(() => {
    // re-fetch credentials when wallet DID changes (so UI shows on-chain entries for connected DID)
    fetchCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid, walletAddress]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const toISO = (datetimeLocal) => {
    if (!datetimeLocal) return undefined;
    return new Date(datetimeLocal).toISOString();
  };

  // ---------------- helpers for ethers / BigNumber handling ----------------
  const safeToString = (v) => {
    try {
      if (v === null || v === undefined) return "";
      // ethers BigNumber (v.toString should be safe)
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (typeof v === "bigint") return v.toString();
      if (v?.toString && typeof v.toString === "function") return v.toString();
      return String(v);
    } catch (e) {
      return String(v);
    }
  };

  // ---------------- provider helpers (works for ethers v6 & v5) ----------------
  // logs features to help debug environment
  useEffect(() => {
    console.log("ethers features:", {
      hasBrowserProvider: !!ethers?.BrowserProvider,
      hasV5Providers: !!ethers?.providers?.Web3Provider,
      hasGetDefault: typeof ethers.getDefaultProvider === "function",
    });
  }, []);

  const getContractWithSigner = async () => {
    if (typeof window === "undefined" || !window.ethereum) throw new Error("No Web3 provider found (window.ethereum)");

    // Ethers v6: BrowserProvider
    if (ethers?.BrowserProvider) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
      const signer = await provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }

    // Ethers v5: providers.Web3Provider
    if (ethers?.providers?.Web3Provider) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
      const signer = provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }

    // If neither exists, fail with helpful message
    throw new Error("Unsupported ethers version: no BrowserProvider or providers.Web3Provider found");
  };

  const getContractReadonly = async () => {
    // prefer injected provider for read operations if available
    if (typeof window !== "undefined" && window.ethereum) {
      if (ethers?.BrowserProvider) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
        return new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
      }
      if (ethers?.providers?.Web3Provider) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
        return new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
      }
    }

    // Fallback to a read-only RPC URL if provided via env (Vite or CRA)
    const rpcUrl =
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_READ_RPC) ||
      process.env.REACT_APP_READ_RPC ||
      process.env.VITE_READ_RPC ||
      null;

    if (rpcUrl) {
      // ethers v6 & v5 both expose JsonRpcProvider under ethers.providers.JsonRpcProvider
      if (ethers?.providers?.JsonRpcProvider) {
        const jsonProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
      if (typeof ethers.JsonRpcProvider === "function") {
        // some v6 builds expose JsonRpcProvider directly
        const jsonProvider = new ethers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
    }

    // Last resort: getDefaultProvider if available
    if (typeof ethers.getDefaultProvider === "function") {
      const defaultProvider = ethers.getDefaultProvider();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, defaultProvider);
    }

    throw new Error("No provider available for readonly operations");
  };

  // ---------------- DID/address normalization ----------------
  const extractHexAddressFromDid = (did) => {
    if (!did || typeof did !== "string") return null;
    const m = did.match(/0x[0-9a-fA-F]{40}/);
    return m ? m[0] : null;
  };

  const normalizeDidVariants = (did) => {
    const out = [];
    if (!did) return out;
    out.push(did);

    const hex = extractHexAddressFromDid(did);
    if (hex) {
      out.push(hex);
      out.push(hex.toLowerCase());
      try {
        const checksum = ethers.utils ? ethers.utils.getAddress(hex) : ethers.getAddress ? ethers.getAddress(hex) : null;
        if (checksum) out.push(checksum);
      } catch (e) {
        // ignore invalid checksum conversion
      }
    }

    // if did starts with "did:ethr:" try removing network part (e.g., did:ethr:sepolia:0x.. -> 0x..)
    if (did.startsWith("did:ethr:")) {
      const removed = did.replace(/^did:ethr:[^:]+:/, "");
      if (removed && !out.includes(removed)) out.push(removed);
    }

    // ensure uniqueness preserving order
    return out.filter((v, i) => v && out.indexOf(v) === i);
  };

  // ---------------- Create credential (backend) ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCredential(null);
    setVerificationResult(null);

    try {
      const payload = {
        issuerDid: formData.issuerDid,
        subjectDid: formData.subjectDid,
        credentialSubject: {
          id: formData.subjectDid,
          name: formData.name,
          role: formData.role,
          organization: formData.organization,
        },
        ...(formData.expirationDate && { expirationDate: toISO(formData.expirationDate) }),
      };

      const res = await axios.post(`${API_BASE}/credential/create`, payload);
      const cred = res.data.credential;
      setCredential(cred);

      // auto-fill verify field if JWT present
      const jwt = (cred && cred.proof && cred.proof.jwt) || (typeof cred === "string" ? cred : null);
      if (jwt) setJwtToVerify(jwt);

      // refresh list
      await fetchCredentials();
    } catch (err) {
      console.error("create error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to create credential");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Publish to IPFS & store mapping on-chain ----------------
  const publishCredentialToIpfsAndStoreOnChain = async (cred, idx = null) => {
    try {
      const statusKey = idx ?? "latest";
      setIpfsStatus((s) => ({ ...s, [statusKey]: { uploading: true } }));

      // canonical subject used for storing on-chain (respect DID if present)
      const subjectDidRaw = cred?.credentialSubject?.id || cred?.subject || cred?.subjectDid || "";
      let subjectToStore = subjectDidRaw;

      // If subject is not a DID but contains an address, prefer checksummed address to be consistent
      const hexMatch = extractHexAddressFromDid(subjectDidRaw);
      if (!subjectDidRaw?.startsWith("did:") && hexMatch) {
        try {
          subjectToStore = ethers.utils ? ethers.utils.getAddress(hexMatch) : hexMatch;
        } catch (e) {
          subjectToStore = hexMatch.toLowerCase();
        }
      }

      const profileData = { ...cred };

      const cid = await storeCredential(subjectToStore, profileData);
      setIpfsStatus((s) => ({ ...s, [statusKey]: { cid, uploading: false } }));

      let credentialHash = "";
      try {
        credentialHash = computeCredentialHash(cred);
      } catch (hashErr) {
        console.warn("hash error", hashErr);
        credentialHash = "";
      }
      const signature = cred?.proof?.jwt || cred?.proof?.signature || "";

      // send tx and capture txHash robustly
      try {
        setChainStatus((s) => ({ ...s, [statusKey]: { sending: true } }));
        const contract = await getContractWithSigner();
        const credentialType = Array.isArray(cred?.type) ? cred.type[0] : cred?.type || "VerifiableCredential";
        const metadata = JSON.stringify(cred?.credentialSubject || {});
        const txOrReceipt = await contract.issueCredential(
          subjectToStore,
          credentialType,
          metadata,
          credentialHash,
          signature,
          cid
        );

        let txHash = null;
        if (txOrReceipt?.hash) txHash = txOrReceipt.hash;
        if (!txHash && txOrReceipt?.transactionHash) txHash = txOrReceipt.transactionHash;
        if (!txHash && txOrReceipt?.request?.hash) txHash = txOrReceipt.request.hash;
        if (!txHash && txOrReceipt?.receipt?.transactionHash) txHash = txOrReceipt.receipt.transactionHash;

        setChainStatus((s) => ({ ...s, [statusKey]: { sending: true, txHash } }));

        if (typeof txOrReceipt?.wait === "function") {
          try {
            const receipt = await txOrReceipt.wait();
            if (!txHash && receipt?.transactionHash) txHash = receipt.transactionHash;
            setChainStatus((s) => ({ ...s, [statusKey]: { success: true, txHash } }));
          } catch (waitErr) {
            console.error("tx wait error:", waitErr);
            setChainStatus((s) => ({ ...s, [statusKey]: { error: waitErr?.message || String(waitErr), txHash } }));
          }
        } else {
          // no wait() - assume txHash is enough
          setChainStatus((s) => ({ ...s, [statusKey]: { sending: true, txHash } }));
        }
      } catch (chainErr) {
        console.error("On-chain error:", chainErr);
        const possibleHash = chainErr?.transactionHash || chainErr?.txHash || chainErr?.receipt?.transactionHash || null;
        setChainStatus((s) => ({ ...s, [statusKey]: { error: chainErr?.message || String(chainErr), txHash: possibleHash } }));
      }

      await fetchCredentials();
    } catch (err) {
      console.error("IPFS/store error:", err);
      setIpfsStatus((s) => ({ ...s, [idx ?? "latest"]: { error: err?.message || String(err), uploading: false } }));
      alert("IPFS upload / store failed: " + (err.message || "unknown"));
    }
  };

  const computeCredentialHash = (cred) => {
    if (!cred) return "";
    const sortedKeys = Object.keys(cred).sort();
    const json = JSON.stringify(cred, sortedKeys, 2);
    if (typeof ethers.keccak256 === "function" && typeof ethers.toUtf8Bytes === "function") {
      return ethers.keccak256(ethers.toUtf8Bytes(json));
    }
    if (ethers.utils && typeof ethers.utils.keccak256 === "function") {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json));
    }
    // fallback: non-cryptographic simple hash so code doesn't crash
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (h << 5) - h + json.charCodeAt(i);
    return "0x" + (h >>> 0).toString(16);
  };

  // ---------------- Fetch on-chain IDs for a DID (debuggable) ----------------
  const getIdsForDid = async (did) => {
    try {
      const readContract = await getContractReadonly();

      const variants = normalizeDidVariants(did);
      let ids = [];
      let usedVariant = null;

      for (const v of variants) {
        try {
          const res = await readContract.getCredentialsForStudent(v);
          const idStrings = Array.isArray(res) ? res.map((x) => safeToString(x)) : [];
          if (idStrings && idStrings.length > 0) {
            ids = idStrings;
            usedVariant = v;
            break;
          }
        } catch (inner) {
          // keep trying variants
        }
      }

      // if still empty, try walletAddress as last resort
      if ((!ids || ids.length === 0) && walletAddress) {
        try {
          const res2 = await readContract.getCredentialsForStudent(walletAddress);
          const idStrings2 = Array.isArray(res2) ? res2.map((x) => safeToString(x)) : [];
          if (idStrings2 && idStrings2.length > 0) {
            ids = idStrings2;
            usedVariant = walletAddress;
          }
        } catch (_) {}
      }

      setLastOnchainIds(ids);
      console.log("getCredentialsForStudent tried variant:", usedVariant, "->", ids);
      return ids;
    } catch (err) {
      console.error("getIdsForDid error", err);
      setLastOnchainIds([]);
      return [];
    }
  };

  // ---------------- Fetch & construct credential objects for a DID ----------------
  const fetchOnChainCredentialsForDid = async (did) => {
    try {
      const readContract = await getContractReadonly();

      const variants = normalizeDidVariants(did);
      let idsRaw = [];
      let usedVariant = null;

      for (const v of variants) {
        try {
          const res = await readContract.getCredentialsForStudent(v);
          const idList = Array.isArray(res) ? res.map((x) => safeToString(x)) : [];
          if (idList && idList.length > 0) {
            idsRaw = idList;
            usedVariant = v;
            break;
          }
        } catch (inner) {
          // try next variant
        }
      }

      // fallback to walletAddress
      if ((!idsRaw || idsRaw.length === 0) && walletAddress) {
        try {
          const res2 = await readContract.getCredentialsForStudent(walletAddress);
          const idList2 = Array.isArray(res2) ? res2.map((x) => safeToString(x)) : [];
          if (idList2 && idList2.length > 0) {
            idsRaw = idList2;
            usedVariant = walletAddress;
          }
        } catch (_) {}
      }

      const idList = idsRaw;
      setLastOnchainIds(idList);

      const results = [];
      const rowsDebug = [];

      for (const idStr of idList) {
        try {
          const row = await readContract.credentials(idStr);
          rowsDebug.push({ idStr, row });
          // row indexes: 0 id, 1 studentDID, 2 issuerDID, 3 credentialType, 4 issueDate, 5 metadata, 6 credentialHash, 7 signature, 8 mappingCID, 9 valid
          const mappingCID = row?.[8] ? safeToString(row[8]) : "";
          const issuerDID = row?.[2] ? safeToString(row[2]) : "";
          const issueDateRaw = row?.[4];
          const issueDate =
            issueDateRaw && typeof issueDateRaw?.toString === "function"
              ? (issueDateRaw.toNumber ? new Date(issueDateRaw.toNumber() * 1000).toISOString() : new Date(Number(issueDateRaw) * 1000).toISOString())
              : undefined;
          const valid = !!row?.[9];

          let ipfsJson = null;
          if (mappingCID) {
            try {
              ipfsJson = await fetchDidDocument(mappingCID); // your Pinata helper
            } catch (fetchErr) {
              console.warn("fetchDidDocument failed, will fallback to public gateway", fetchErr);
              const gateways = [
                `https://dweb.link/ipfs/${mappingCID}`,
                `https://ipfs.io/ipfs/${mappingCID}`,
                `https://cloudflare-ipfs.com/ipfs/${mappingCID}`,
              ];
              for (const g of gateways) {
                try {
                  const res = await fetch(g);
                  if (res.ok) {
                    ipfsJson = await res.json();
                    break;
                  }
                } catch (gerr) {
                  console.warn("gateway fetch failed", g, gerr);
                }
              }
            }
          }

          let displayed;
          if (ipfsJson) {
            // merge IPFS json into displayed object so UI can show credentialSubject, issuer, issuanceDate etc
            displayed = {
              ...ipfsJson,
              issuanceDate: ipfsJson.issuanceDate || issueDate,
              issuer: ipfsJson.issuer || { id: issuerDID },
            };
          } else {
            // fallback to metadata field (row[5]) if present
            let metadata = row?.[5] ?? "";
            try {
              metadata = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
            } catch (e) {
              // leave as string
            }
            displayed = {
              credentialSubject: (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0) ? metadata : { id: row?.[1] ?? did },
              issuer: { id: issuerDID },
              issuanceDate: issueDate,
            };
          }

          const credObj = {
            ...displayed,
            onchain: {
              id: safeToString(row?.[0] ?? idStr),
              mappingCID,
              issuerDID,
              issueDate,
              valid,
              usedVariant,
            },
          };
          results.push(credObj);
        } catch (inner) {
          console.warn("failed to load onchain id", idStr, inner);
        }
      }

      setLastOnchainRowsDebug(rowsDebug);
      return results;
    } catch (err) {
      console.warn("fetchOnChainCredentialsForDid error", err);
      setLastOnchainRowsDebug([]);
      return [];
    }
  };

  // ---------------- Fallback: read all on-chain credentials ----------------
  const fetchAllOnChainCredentials = async () => {
    try {
      const readContract = await getContractReadonly();
      const count = await readContract.credentialCount();
      const n = (count && typeof count?.toString === "function") ? Number(safeToString(count)) : Number(count || 0);
      const out = [];
      for (let i = 1; i <= n; i++) {
        try {
          const row = await readContract.credentials(i);
          const mappingCID = row?.[8] ? safeToString(row[8]) : "";
          let ipfsJson = null;
          if (mappingCID) {
            try {
              ipfsJson = await fetchDidDocument(mappingCID);
            } catch (err) {
              try {
                const res = await fetch(`https://dweb.link/ipfs/${mappingCID}`);
                if (res.ok) ipfsJson = await res.json();
              } catch (e) {}
            }
          }
          const issuerDID = row?.[2] ? safeToString(row[2]) : "";
          const issueDateRaw = row?.[4];
          const issueDate = issueDateRaw ? (issueDateRaw.toNumber ? new Date(issueDateRaw.toNumber() * 1000).toISOString() : new Date(Number(issueDateRaw) * 1000).toISOString()) : undefined;
          const credObj = {
            ...(ipfsJson || {}),
            issuanceDate: issueDate,
            onchain: { id: safeToString(row?.[0] ?? i), mappingCID, issuerDID, valid: !!row?.[9] },
          };
          out.push(credObj);
        } catch (inner) {
          // skip
        }
      }
      return out;
    } catch (err) {
      console.warn("fetchAllOnChainCredentials error", err);
      return [];
    }
  };

  // ---------------- Combined fetch flow ----------------
  const fetchCredentials = async () => {
    setListLoading(true);
    setError("");
    try {
      // If wallet DID is present, prefer on-chain mapping for that DID
      if (walletDid) {
        const onchainForWallet = await fetchOnChainCredentialsForDid(walletDid);
        if (onchainForWallet && onchainForWallet.length > 0) {
          setCredentials(onchainForWallet);
          setListLoading(false);
          return;
        }
        // Try DID/address variants
        const variants = normalizeDidVariants(walletDid);
        for (const v of variants) {
          const tryRes = await fetchOnChainCredentialsForDid(v);
          if (tryRes && tryRes.length > 0) {
            setCredentials(tryRes);
            setListLoading(false);
            return;
          }
        }
        // also try walletAddress explicitly
        if (walletAddress) {
          const tryAddr = await fetchOnChainCredentialsForDid(walletAddress);
          if (tryAddr && tryAddr.length > 0) {
            setCredentials(tryAddr);
            setListLoading(false);
            return;
          }
        }
        // If still nothing, continue to backend fallback
      }

      // Otherwise ask backend
      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];

      if (!creds || creds.length === 0) {
        // fallback: try read all on-chain
        const onchainAll = await fetchAllOnChainCredentials();
        setCredentials(onchainAll);
        setListLoading(false);
        return;
      }

      // If backend returned creds, show them
      setCredentials(creds);
    } catch (err) {
      console.error("fetchCredentials error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to fetch credentials");
    } finally {
      setListLoading(false);
    }
  };

  // ---------------- Retry fetching IPFS JSON for a credential ----------------
  const retryFetchIpfs = async (mappingCID, index) => {
    if (!mappingCID) return alert("No mapping CID");
    setIpfsStatus((s) => ({ ...s, ["retry-" + index]: { fetching: true } }));
    let ipfsJson = null;
    try {
      ipfsJson = await fetchDidDocument(mappingCID);
    } catch (err) {
      console.warn("Pinata fetch failed, trying public gateway", err);
      try {
        const res = await fetch(`https://dweb.link/ipfs/${mappingCID}`);
        if (res.ok) ipfsJson = await res.json();
      } catch (gerr) {
        console.warn("public gateway fetch failed", gerr);
      }
    }
    setIpfsStatus((s) => ({ ...s, ["retry-" + index]: { fetching: false, json: ipfsJson, mappingCID } }));
    // update credentials array to include fetched JSON if found
    if (ipfsJson) {
      setCredentials((prev) => prev.map((c, i) => (i === index ? { ...c, ...ipfsJson } : c)));
    } else {
      alert("Failed to fetch IPFS JSON for " + mappingCID + " — see console for details");
    }
  };

  // ---------------- QR / utils / downloads ----------------
  const generateQr = async (text) => {
    if (!text) return alert("No text to create QR for");
    try {
      const url = await QRCode.toDataURL(text, { errorCorrectionLevel: "M" });
      setQrDataUrl(url);
    } catch (err) {
      console.error("QR error:", err);
      alert("Failed to generate QR code");
    }
  };

  const copyToClipboard = async (text, label = "Text") => {
    if (!text) return alert(`${label} is empty`);
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied to clipboard`);
    } catch (err) {
      console.error("Clipboard error:", err);
      alert("Failed to copy");
    }
  };

  const downloadFile = (filename, content, mime = "application/json") => {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadJSON = (cred) => {
    if (!cred) return alert("No credential");
    downloadFile(`credential-${Date.now()}.json`, JSON.stringify(cred, null, 2), "application/json");
  };

  const downloadPDF = (cred) => {
    if (!cred) return alert("No credential");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Verifiable Credential", 20, 20);
    let y = 30;
    const cs = cred.credentialSubject || {};
    const lines = [
      `Name: ${cs.name ?? "N/A"}`,
      `Role: ${cs.role ?? "N/A"}`,
      `Organization: ${cs.organization ?? "N/A"}`,
      `Subject DID: ${cs.id ?? "N/A"}`,
      `Issuer DID: ${cred.issuer?.id ?? "N/A"}`,
      `Issuance Date: ${cred.issuanceDate ?? "N/A"}`,
      `Expiration Date: ${cred.expirationDate ?? "N/A"}`,
    ];
    lines.forEach((ln) => {
      doc.setFontSize(11);
      doc.text(ln, 20, y);
      y += 8;
    });

    const jwt = cred?.proof?.jwt;
    if (jwt) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text("JWT (compact):", 20, 20);
      doc.setFontSize(9);
      const chunk = 80;
      let pos = 28;
      for (let i = 0; i < jwt.length; i += chunk) {
        doc.text(jwt.slice(i, i + chunk), 20, pos);
        pos += 6;
        if (pos > 280) {
          doc.addPage();
          pos = 20;
        }
      }
    }
    doc.save(`credential-${Date.now()}.pdf`);
  };

  // ---------------- Verify JWT ----------------
  const handleJwtVerification = async () => {
    setVerificationResult(null);
    setError("");
    if (!jwtToVerify) {
      setVerificationResult({ verified: false, error: "No JWT provided" });
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/credential/verify`, {
        credential: jwtToVerify,
      });
      const ver = response.data?.verification ?? response.data;
      setVerificationResult(ver);
    } catch (err) {
      console.error(err);
      setVerificationResult({
        verified: false,
        error: err?.response?.data?.error || err?.message || "Verification failed",
      });
    }
  };

  // ---------------- Render ----------------
  return (
    <div className="max-w-4xl mx-auto p-6 shadow rounded bg-white">
      <h2 className="text-2xl font-bold mb-4">Ethr VC Manager</h2>

      {/* Create VC form */}
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        {["issuerDid", "subjectDid", "name", "role", "organization", "expirationDate"].map((field) => (
          <div key={field}>
            <label className="block font-medium capitalize">{field}</label>
            <input
              type={field === "expirationDate" ? "datetime-local" : "text"}
              name={field}
              value={formData[field]}
              onChange={handleChange}
              className="w-full border border-gray-300 p-2 rounded"
              disabled={field === "subjectDid" && didLoading}
              required
            />

            {field === "subjectDid" && (
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                {didLoading ? (
                  <span>Loading wallet DID…</span>
                ) : walletDid ? (
                  <span>Using wallet DID: <code className="bg-gray-100 px-1 rounded">{walletDid}</code></span>
                ) : (
                  <span className="italic">No wallet DID available — paste a subject DID.</span>
                )}
                {walletAddress && <span className="ml-2 text-xs text-gray-400">({walletAddress})</span>}
              </div>
            )}
          </div>
        ))}

        <div className="flex gap-2">
          <button type="submit" disabled={loading || didLoading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? "Creating..." : "Create Credential"}
          </button>

          <button type="button" onClick={fetchCredentials} className="bg-gray-200 px-4 py-2 rounded">
            {listLoading ? "Refreshing..." : "Refresh list"}
          </button>

          <button
            type="button"
            onClick={async () => {
              setListLoading(true);
              if (walletDid) {
                const ids = await getIdsForDid(walletDid);
                // also fetch details so you can inspect
                const onchain = await fetchOnChainCredentialsForDid(walletDid);
                setCredentials(onchain);
              } else {
                const all = await fetchAllOnChainCredentials();
                setCredentials(all);
              }
              setListLoading(false);
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Show on-chain credentials
          </button>
        </div>

        {error && <div className="text-red-600 mt-2">{error}</div>}
      </form>

      {/* Created credential preview */}
      {credential && (
        <section className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold">Latest created credential</h3>
          <pre className="text-sm whitespace-pre-wrap max-h-48 overflow-auto mt-2">{JSON.stringify(credential, null, 2)}</pre>

          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), "Credential JSON")} className="bg-green-600 text-white px-3 py-1 rounded">Copy JSON</button>
            <button onClick={() => credential?.proof?.jwt && copyToClipboard(credential.proof.jwt, "JWT")} className="bg-gray-600 text-white px-3 py-1 rounded">Copy JWT</button>
            <button onClick={() => credential?.proof?.jwt && generateQr(credential.proof.jwt)} className="bg-indigo-600 text-white px-3 py-1 rounded">QR (JWT)</button>
            <button onClick={() => downloadJSON(credential)} className="bg-yellow-600 text-white px-3 py-1 rounded">Download JSON</button>
            <button onClick={() => downloadPDF(credential)} className="bg-purple-600 text-white px-3 py-1 rounded">Download PDF</button>
            <button onClick={() => { if (credential?.proof?.jwt) setJwtToVerify(credential.proof.jwt); else alert('No JWT present'); }} className="bg-slate-700 text-white px-3 py-1 rounded">Use JWT for Verify</button>

            <button onClick={() => publishCredentialToIpfsAndStoreOnChain(credential, "latest")} className="bg-emerald-700 text-white px-3 py-1 rounded">
              {ipfsStatus["latest"]?.uploading ? "Uploading..." : chainStatus["latest"]?.sending ? "Storing on-chain..." : "Publish IPFS & Store On-chain"}
            </button>
          </div>

          {ipfsStatus["latest"]?.cid && (
            <div className="text-xs mt-2">
              IPFS CID: <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${ipfsStatus["latest"].cid}`} className="underline">{ipfsStatus["latest"].cid}</a>
            </div>
          )}
          {chainStatus["latest"]?.txHash && (
            <div className="text-xs mt-1">Tx: <a target="_blank" rel="noreferrer" href={`https://etherscan.io/tx/${chainStatus["latest"].txHash}`} className="underline">{chainStatus["latest"].txHash}</a></div>
          )}
          {chainStatus["latest"]?.error && <div className="text-xs text-red-600 mt-1">On-chain error: {chainStatus["latest"].error}</div>}
        </section>
      )}

      {/* QR viewer */}
      {qrDataUrl && (
        <section className="mb-6">
          <h4 className="font-semibold">QR Code</h4>
          <img src={qrDataUrl} alt="QR" className="mt-2" />
          <div className="mt-2">
            <button onClick={() => setQrDataUrl(null)} className="bg-red-500 text-white px-3 py-1 rounded">Close QR</button>
          </div>
        </section>
      )}

      {/* Credentials list */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Stored credentials</h3>

        {listLoading && <div>Loading credentials…</div>}

        {/* Diagnostics when no credentials */}
        {!listLoading && credentials.length === 0 && (
          <div className="text-sm text-gray-500 space-y-2">
            <div>No credentials found.</div>
            <div className="text-xs text-gray-600">
              <strong>Diagnostics:</strong>
              <div>Wallet DID: <code className="bg-gray-100 px-1 rounded">{walletDid ?? "—"}</code></div>
              <div>Wallet address: <code className="bg-gray-100 px-1 rounded">{walletAddress ?? "—"}</code></div>
              <div>Last on-chain IDs for DID: {lastOnchainIds.length > 0 ? lastOnchainIds.join(", ") : "none"}</div>
              {lastOnchainRowsDebug.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs underline">Show raw on-chain rows (debug)</summary>
                  <pre className="text-xs max-h-48 overflow-auto p-2 bg-gray-50 mt-1">{JSON.stringify(lastOnchainRowsDebug, null, 2)}</pre>
                </details>
              )}
              <div className="mt-2">
                <button
                  onClick={async () => {
                    if (!walletDid) return alert("Connect wallet / set walletDid first");
                    setListLoading(true);
                    const ids = await getIdsForDid(walletDid);
                    // keep existing credentials array empty — IDs will be shown in diagnostics
                    setListLoading(false);
                    if ((ids?.length ?? 0) === 0) alert("No on-chain IDs returned for this DID");
                  }}
                  className="bg-gray-200 px-2 py-1 rounded text-xs"
                >
                  Fetch IDs for wallet DID
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 mt-2">
          {credentials.map((cred, i) => {
            const jwt = cred?.proof?.jwt || cred?.jwt || (typeof cred === "string" ? cred : null);
            const subjectId = cred?.credentialSubject?.id || cred?.credentialSubject?.sub || cred?.onchain?.studentDID || cred?.subject || cred?.id || "N/A";
            return (
              <div key={i} className="p-3 border rounded flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm"><strong>Subject:</strong> {subjectId}</div>
                  <div className="text-sm"><strong>Name:</strong> {cred?.credentialSubject?.name ?? cred?.name ?? cred?.credentialSubject?.fullName ?? "N/A"}</div>
                  <div className="text-sm"><strong>Issuer:</strong> {cred?.issuer?.id ?? cred?.issuer ?? "N/A"}</div>
                  <div className="text-xs text-gray-500 mt-1">{cred?.issuanceDate ? `Issued: ${cred.issuanceDate}` : (cred?.issuanceDate ? `Issued: ${cred.issuanceDate}` : "")}</div>

                  {cred?.onchain?.mappingCID ? (
                    <div className="text-xs mt-1">
                      On-chain CID: <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${cred.onchain.mappingCID}`} className="underline">{cred.onchain.mappingCID}</a>
                      {cred.onchain?.id && <span className="ml-2">(id #{cred.onchain.id})</span>}
                      {cred.onchain?.valid === false && <span className="ml-2 text-red-600"> (revoked)</span>}
                    </div>
                  ) : (
                    cred?.onchain && (
                      <div className="text-xs mt-1">
                        On-chain: id {cred.onchain.id ?? "?"}, mappingCID: <span className="italic">none</span>
                      </div>
                    )
                  )}
                </div>

                <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    <button onClick={() => downloadJSON(cred)} className="bg-yellow-600 text-white px-3 py-1 rounded text-sm">JSON</button>
                    <button onClick={() => downloadPDF(cred)} className="bg-purple-600 text-white px-3 py-1 rounded text-sm">PDF</button>
                    <button onClick={() => jwt ? copyToClipboard(jwt, "JWT") : alert("No JWT for this credential")} className="bg-gray-600 text-white px-3 py-1 rounded text-sm">Copy JWT</button>
                    <button onClick={() => jwt ? generateQr(jwt) : alert("No JWT to generate QR")} className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">QR</button>
                  </div>

                  <div className="w-full">
                    <input
                      placeholder="web3.storage token (optional)"
                      value={ipfsToken}
                      onChange={(e) => setIpfsToken(e.target.value)}
                      className="border px-2 py-1 rounded text-xs w-full"
                    />
                    <div className="flex gap-2 mt-2 items-center">
                      <button onClick={() => publishCredentialToIpfsAndStoreOnChain(cred, i)} className="bg-green-600 text-white px-3 py-1 rounded text-xs">
                        {ipfsStatus[i]?.uploading ? "Uploading..." : chainStatus[i]?.sending ? "Storing..." : "Publish IPFS & Store On-chain"}
                      </button>

                      {cred?.onchain?.mappingCID && (
                        <button onClick={() => retryFetchIpfs(cred.onchain.mappingCID, i)} className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs">
                          {ipfsStatus["retry-" + i]?.fetching ? "Fetching..." : "Retry IPFS"}
                        </button>
                      )}

                      {ipfsStatus[i]?.cid && (
                        <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${ipfsStatus[i].cid}`} className="text-xs underline ml-1">View ({ipfsStatus[i].cid})</a>
                      )}
                      {ipfsStatus[i]?.error && <div className="text-xs text-red-600">{ipfsStatus[i].error}</div>}
                      {chainStatus[i]?.txHash && <div className="text-xs ml-2">Tx: <a className="underline" target="_blank" rel="noreferrer" href={`https://etherscan.io/tx/${chainStatus[i].txHash}`}>{chainStatus[i].txHash}</a></div>}
                      {chainStatus[i]?.error && <div className="text-xs text-red-600 ml-2">{chainStatus[i].error}</div>}
                    </div>
                    {/* show result of retry fetch if present */}
                    {ipfsStatus["retry-" + i]?.json && (
                      <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                        <strong>Fetched IPFS JSON (preview):</strong>
                        <pre className="text-xs max-h-40 overflow-auto">{JSON.stringify(ipfsStatus["retry-" + i].json, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* JWT verification */}
      <section>
        <h3 className="text-lg font-semibold">Verify JWT</h3>
        <textarea value={jwtToVerify} onChange={(e) => setJwtToVerify(e.target.value.trim())} rows={4} className="w-full border p-2 rounded mt-2" placeholder="Paste JWT here..." />
        <div className="flex gap-2 mt-2">
          <button onClick={handleJwtVerification} className="bg-indigo-600 text-white px-4 py-2 rounded">Verify JWT</button>
          <button onClick={() => { setJwtToVerify(""); setVerificationResult(null); }} className="bg-red-500 text-white px-4 py-2 rounded">Clear</button>
        </div>

        {verificationResult && (
          <div className="mt-4 p-3 rounded bg-gray-50">
            <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(verificationResult, null, 2)}</pre>
            <div className="mt-2">
              {verificationResult.verified ? (
                <span className="text-green-700 font-semibold">Verified ✅</span>
              ) : (
                <span className="text-red-700 font-semibold">Not verified — {verificationResult.error ?? "unknown"}</span>
              )}
            </div>

            {verificationResult.payload && (
              <div className="mt-2 text-sm">
                <div><strong>Issuer:</strong> {verificationResult.payload?.iss ?? "N/A"}</div>
                <div><strong>Subject:</strong> {verificationResult.payload?.sub ?? "N/A"}</div>
                <div><strong>Expiry:</strong> {verificationResult.payload?.exp ? new Date(verificationResult.payload.exp * 1000).toUTCString() : "N/A"}</div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default EthrVcManager;
