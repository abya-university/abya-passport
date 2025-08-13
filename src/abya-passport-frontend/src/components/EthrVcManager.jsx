// src/components/EthrVcManager.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import * as ethers from "ethers";
import { storeCredential, fetchDidDocument } from "../services/ipfsService";
import { useEthr } from "../contexts/EthrContext";
import EthrPresentation from "./VcPresentationManager";

// Small icons to make the UI compact and scannable
import {
  RefreshCw,
  PlusSquare,
  FileText,
  Download,
  QrCode,
  Copy,
  UploadCloud,
  Link2,
  CheckCircle,
  AlertCircle,
  Database,
} from "lucide-react";

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

  // navigation state for showing presentation page
  const [currentPage, setCurrentPage] = useState("home");

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
  const [lastOnchainIds, setLastOnchainIds] = useState([]);
  const [lastOnchainRowsDebug, setLastOnchainRowsDebug] = useState([]);

  useEffect(() => {
    if (didLoading) return;
    if (walletDid) {
      setFormData((f) => (f.subjectDid ? f : { ...f, subjectDid: walletDid }));
    }
  }, [walletDid, didLoading]);

  useEffect(() => {
    fetchCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid, walletAddress]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const toISO = (datetimeLocal) => {
    if (!datetimeLocal) return undefined;
    return new Date(datetimeLocal).toISOString();
  };

  // ---------------- helpers & provider functions (unchanged logic) ----------------
  const safeToString = (v) => {
    try {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (typeof v === "bigint") return v.toString();
      if (v?.toString && typeof v.toString === "function") return v.toString();
      return String(v);
    } catch (e) {
      return String(v);
    }
  };

  useEffect(() => {
    console.log("ethers features:", {
      hasBrowserProvider: !!ethers?.BrowserProvider,
      hasV5Providers: !!ethers?.providers?.Web3Provider,
      hasGetDefault: typeof ethers.getDefaultProvider === "function",
    });
  }, []);

  const getContractWithSigner = async () => {
    if (typeof window === "undefined" || !window.ethereum) throw new Error("No Web3 provider found (window.ethereum)");

    if (ethers?.BrowserProvider) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
      const signer = await provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }

    if (ethers?.providers?.Web3Provider) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      try { await provider.send?.("eth_requestAccounts", []); } catch (_) {}
      const signer = provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }

    throw new Error("Unsupported ethers version: no BrowserProvider or providers.Web3Provider found");
  };

  const getContractReadonly = async () => {
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

    const rpcUrl =
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_READ_RPC) ||
      process.env.REACT_APP_READ_RPC ||
      process.env.VITE_READ_RPC ||
      null;

    if (rpcUrl) {
      if (ethers?.providers?.JsonRpcProvider) {
        const jsonProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
      if (typeof ethers.JsonRpcProvider === "function") {
        const jsonProvider = new ethers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
    }

    if (typeof ethers.getDefaultProvider === "function") {
      const defaultProvider = ethers.getDefaultProvider();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, defaultProvider);
    }

    throw new Error("No provider available for readonly operations");
  };

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
      } catch (e) {}
    }

    if (did.startsWith("did:ethr:")) {
      const removed = did.replace(/^did:ethr:[^:]+:/, "");
      if (removed && !out.includes(removed)) out.push(removed);
    }

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

      const jwt = (cred && cred.proof && cred.proof.jwt) || (typeof cred === "string" ? cred : null);
      if (jwt) setJwtToVerify(jwt);

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

      const subjectDidRaw = cred?.credentialSubject?.id || cred?.subject || cred?.subjectDid || "";
      let subjectToStore = subjectDidRaw;

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
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (h << 5) - h + json.charCodeAt(i);
    return "0x" + (h >>> 0).toString(16);
  };

  // ---------------- on-chain fetch helpers (unchanged) ----------------
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
        } catch (inner) {}
      }

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
        } catch (inner) {}
      }

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
              ipfsJson = await fetchDidDocument(mappingCID);
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
            displayed = {
              ...ipfsJson,
              issuanceDate: ipfsJson.issuanceDate || issueDate,
              issuer: ipfsJson.issuer || { id: issuerDID },
            };
          } else {
            let metadata = row?.[5] ?? "";
            try {
              metadata = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
            } catch (e) {}
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
        } catch (inner) {}
      }
      return out;
    } catch (err) {
      console.warn("fetchAllOnChainCredentials error", err);
      return [];
    }
  };

  const fetchCredentials = async () => {
    setListLoading(true);
    setError("");
    try {
      if (walletDid) {
        const onchainForWallet = await fetchOnChainCredentialsForDid(walletDid);
        if (onchainForWallet && onchainForWallet.length > 0) {
          setCredentials(onchainForWallet);
          setListLoading(false);
          return;
        }
        const variants = normalizeDidVariants(walletDid);
        for (const v of variants) {
          const tryRes = await fetchOnChainCredentialsForDid(v);
          if (tryRes && tryRes.length > 0) {
            setCredentials(tryRes);
            setListLoading(false);
            return;
          }
        }
        if (walletAddress) {
          const tryAddr = await fetchOnChainCredentialsForDid(walletAddress);
          if (tryAddr && tryAddr.length > 0) {
            setCredentials(tryAddr);
            setListLoading(false);
            return;
          }
        }
      }

      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];

      if (!creds || creds.length === 0) {
        const onchainAll = await fetchAllOnChainCredentials();
        setCredentials(onchainAll);
        setListLoading(false);
        return;
      }

      setCredentials(creds);
    } catch (err) {
      console.error("fetchCredentials error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to fetch credentials");
    } finally {
      setListLoading(false);
    }
  };

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
    if (ipfsJson) {
      setCredentials((prev) => prev.map((c, i) => (i === index ? { ...c, ...ipfsJson } : c)));
    } else {
      alert("Failed to fetch IPFS JSON for " + mappingCID + " — see console for details");
    }
  };

  // ---------------- QR / clipboard / downloads (unchanged) ----------------
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

  // ---------- Small visual helper: status dot ----------
  const StatusDot = ({ status }) => {
    if (!status) return null;
    const cls = status.error ? "bg-red-500" : status.success ? "bg-emerald-500" : status.sending || status.uploading ? "bg-yellow-400" : "bg-slate-300";
    return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2`} />;
  };

  // ---------------- Navigation: render EthrPresentation when requested ----------------
  if (currentPage === "ethrpresent") {
    return <EthrPresentation onBack={() => setCurrentPage("home")} />;
  }

  // ---------------- Render (only UI changed) ----------------
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-blue-900 font-semibold">Ethr Credential Manager</h2>
          <p className="text-sm text-slate-500 mt-1">Create, publish, and verify verifiable credentials (keeps existing logic).</p>
        </div>

        {/* right side */}
        <div className="flex items-center gap-3">
          {/* connection + network */}
          <div className="flex flex-col items-end text-right">
            <div className="flex items-center gap-2">
              {/* status dot */}
              <span
                className={`inline-block w-2 h-2 rounded-full ${walletDid ? "bg-emerald-500" : "bg-slate-300"}`}
                title={walletDid ? "Wallet connected" : "No wallet DID"}
              />
              <span className="text-xs text-slate-500">{walletDid ? "Connected" : "Disconnected"}</span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              {/* network badge (parsed from DID if possible) */}
              <span className="text-xs bg-green-100 px-2 py-0.5 rounded font-medium text-slate-700">
                {(() => {
                  try {
                    if (!walletDid) return "—";
                    const parts = walletDid.split(":"); // e.g. did:ethr:sepolia:0x...
                    return (parts[2] && parts[2].toUpperCase()) || "ETHR";
                  } catch {
                    return "ETHR";
                  }
                })()}
              </span>

              {/* truncated DID with copy */}
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-slate-50 px-2 py-1 rounded max-w-[28ch] truncate block">
                  {walletDid ?? "—"}
                </code>
                <button
                  onClick={() => {
                    if (!walletDid) return alert("No wallet DID to copy");
                    copyToClipboard(walletDid, "Wallet DID");
                  }}
                  className="bg-slate-100 px-2 py-1 rounded text-sm hover:bg-slate-200"
                  title="Copy wallet DID"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Refresh button (keeps existing handler) */}
          <button
            onClick={fetchCredentials}
            className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded text-sm hover:bg-slate-200"
            title="Refresh list"
          >
            <RefreshCw size={18} />  {/*Refresh*/}
          </button>
        </div>
      </header>


      {/* Create VC form - compact card */}
      <section className="bg-white shadow-sm rounded border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg text-gray-700 font-medium">Create Credential</h3>
          <div className="text-sm text-slate-500">Compact form · required fields</div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {["issuerDid", "subjectDid", "name", "role", "organization"].map((field) => (
            <div key={field} className="flex flex-col">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-2">
                <span className="capitalize">{field}</span>
                <span className="text-[10px] text-slate-400">required</span>
              </label>
              <input
                type="text"
                name={field}
                value={formData[field]}
                onChange={handleChange}
                className="mt-1 px-2 py-2 border border-slate-200 rounded text-sm bg-slate-50"
                disabled={field === "subjectDid" && didLoading}
                required
              />

              {field === "subjectDid" && (
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                  {didLoading ? (
                    <span className="italic">Loading wallet DID…</span>
                  ) : walletDid ? (
                    <span className="text-ellipsis overflow-hidden whitespace-nowrap">Using wallet DID: <code className="bg-slate-100 px-1 rounded ml-1">{walletDid}</code></span>
                  ) : (
                    <span className="italic">No wallet DID available — paste a subject DID.</span>
                  )}
                  {walletAddress && <span className="ml-auto text-xs text-slate-400 font-mono">({walletAddress})</span>}
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-col">
            <label className="text-xs font-medium text-slate-700">expirationDate</label>
            <input
              type="datetime-local"
              name="expirationDate"
              value={formData.expirationDate}
              onChange={handleChange}
              className="mt-1 px-2 py-2 border border-slate-200 rounded text-sm bg-slate-50"
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-2 items-center mt-1">
            <button type="submit" disabled={loading || didLoading} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">
              <PlusSquare size={16} /> {loading ? "Creating..." : "Create"}
            </button>

            <button
              type="button"
              onClick={async () => {
                setListLoading(true);
                if (walletDid) {
                  const ids = await getIdsForDid(walletDid);
                  const onchain = await fetchOnChainCredentialsForDid(walletDid);
                  setCredentials(onchain);
                } else {
                  const all = await fetchAllOnChainCredentials();
                  setCredentials(all);
                }
                setListLoading(false);
              }}
              className="flex items-center gap-2 border border-blue-900 bg-transparent hover:bg-blue-900 text-blue-900 hover:text-white px-3 py-1.5 rounded text-sm"
            >
              <Database size={14} /> Show on-chain
            </button>

            {error && <div className="text-red-600 text-sm ml-2">{error}</div>}
          </div>
        </form>
      </section>

      {/* Latest created credential card */}
      {credential && (
        <section className="bg-gradient-to-r from-slate-50 to-white border border-slate-100 rounded p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold text-slate-800">Latest created credential</h4>
              <div className="text-xs text-slate-500 mt-1">Preview (JSON)</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot status={ipfsStatus["latest"] || chainStatus["latest"]} />
              <div className="text-xs text-slate-500">{ipfsStatus["latest"]?.cid ? "Published" : chainStatus["latest"]?.txHash ? "On-chain" : "Draft"}</div>
            </div>
          </div>

          <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto mt-3 bg-slate-100 p-2 rounded">{JSON.stringify(credential, null, 2)}</pre>

          <div className="flex flex-wrap gap-2 mt-3">
            {/* <button onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), "Credential JSON")} className="flex items-center gap-2 bg-blue-900 hover:bg-emerald-600 text-white px-3 py-1 rounded text-sm">
              <Copy size={14} /> Copy JSON
            </button> */}
            <button onClick={() => credential?.proof?.jwt && copyToClipboard(credential.proof.jwt, "JWT")} className="flex items-center gap-2 bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-800 px-3 py-1 rounded text-sm">
              <Copy size={14} /> Copy JWT
            </button>
            <button onClick={() => credential?.proof?.jwt && generateQr(credential.proof.jwt)} className="flex items-center gap-2 bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-800 px-3 py-1 rounded text-sm">
              <QrCode size={14} /> QR (JWT)
            </button>
            <button onClick={() => downloadJSON(credential)} className="flex items-center gap-2 bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-800 px-3 py-1 rounded text-sm">
              <Download size={14} /> JSON
            </button>
            <button onClick={() => downloadPDF(credential)} className="flex items-center gap-2 bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-800 px-3 py-1 rounded text-sm">
              <Download size={14} /> PDF
            </button>
            <button onClick={() => { if (credential?.proof?.jwt) setJwtToVerify(credential.proof.jwt); else alert('No JWT present'); }} className="flex items-center gap-2 bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-800 px-3 py-1 rounded text-sm">
              <Link2 size={14} /> Use for Verify
            </button>

            <button onClick={() => publishCredentialToIpfsAndStoreOnChain(credential, "latest")} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1 rounded text-sm">
              <UploadCloud size={14} /> {ipfsStatus["latest"]?.uploading ? "Uploading..." : chainStatus["latest"]?.sending ? "Storing..." : "Publish & Store"}
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500 flex flex-col gap-1">
            {ipfsStatus["latest"]?.cid && <div>IPFS CID: <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${ipfsStatus["latest"].cid}`} className="underline">{ipfsStatus["latest"].cid}</a></div>}
            {chainStatus["latest"]?.txHash && <div>Tx: <a target="_blank" rel="noreferrer" href={`https://etherscan.io/tx/${chainStatus["latest"].txHash}`} className="underline">{chainStatus["latest"].txHash}</a></div>}
            {chainStatus["latest"]?.error && <div className="text-red-600">On-chain error: {chainStatus["latest"].error}</div>}
          </div>
        </section>
      )}

      {/* QR viewer */}
      {qrDataUrl && (
        <section className="bg-white border border-slate-100 p-3 rounded shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">QR Code</h4>
            <button onClick={() => setQrDataUrl(null)} className="text-sm text-red-500 flex items-center gap-2">
              <AlertCircle size={14} /> Close
            </button>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <img src={qrDataUrl} alt="QR" className="w-36 h-36" />
            <div className="text-sm text-slate-600">Scan to view JWT.</div>
          </div>
        </section>
      )}

      {/* Credentials list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg text-blue-900 font-medium">Stored credentials</h3>
          <div className="text-sm text-slate-500">{credentials.length} items</div>
        </div>

        {listLoading && <div className="text-sm text-slate-500">Loading credentials…</div>}

        {!listLoading && credentials.length === 0 && (
          <div className="p-3 bg-gray-100 border border-slate-100 rounded text-sm text-slate-600">
            <div>No credentials found.</div>
            <div className="mt-2 text-xs">
              <strong>Diagnostics</strong>
              <div className="mt-1">Wallet DID: <code className="bg-slate-100 px-1 rounded">{walletDid ?? "—"}</code></div>
              <div className="mt-1">Wallet address: <code className="bg-slate-100 px-1 rounded">{walletAddress ?? "—"}</code></div>
              <div className="mt-1">Last on-chain IDs: {lastOnchainIds.length > 0 ? lastOnchainIds.join(", ") : "none"}</div>
              {lastOnchainRowsDebug.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer underline">Show raw on-chain rows (debug)</summary>
                  <pre className="text-xs max-h-40 overflow-auto p-2 bg-white mt-1 rounded">{JSON.stringify(lastOnchainRowsDebug, null, 2)}</pre>
                </details>
              )}
              <div className="mt-2">
                <button
                  onClick={async () => {
                    if (!walletDid) return alert("Connect wallet / set walletDid first");
                    setListLoading(true);
                    const ids = await getIdsForDid(walletDid);
                    setListLoading(false);
                    if ((ids?.length ?? 0) === 0) alert("No on-chain IDs returned for this DID");
                  }}
                  className="bg-slate-100 px-2 py-1 rounded text-xs"
                >
                  <RefreshCw size={12} /> Fetch IDs
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {credentials.map((cred, i) => {
            const jwt = cred?.proof?.jwt || cred?.jwt || (typeof cred === "string" ? cred : null);
            const subjectId = cred?.credentialSubject?.id || cred?.credentialSubject?.sub || cred?.onchain?.studentDID || cred?.subject || cred?.id || "N/A";
            return (
              <div key={i} className="bg-slate-100 border border-slate-100 rounded p-3 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 truncate"><strong>Subject:</strong> <span className="font-mono ml-1">{subjectId}</span></div>
                  <div className="text-sm text-slate-600 mt-1 truncate"><strong>Name:</strong> {cred?.credentialSubject?.name ?? cred?.name ?? cred?.credentialSubject?.fullName ?? "N/A"}</div>
                  <div className="text-sm text-slate-600 mt-1 truncate"><strong>Issuer:</strong> {cred?.issuer?.id ?? cred?.issuer ?? "N/A"}</div>
                  <div className="text-xs text-slate-400 mt-1">{cred?.issuanceDate ? `Issued: ${cred.issuanceDate}` : ""}</div>

                  {cred?.onchain?.mappingCID ? (
                    <div className="text-xs mt-2 text-slate-500">
                      <StatusDot status={cred.onchain?.valid === false ? { error: true } : { success: cred.onchain?.valid }} />
                      On-chain CID: <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${cred.onchain.mappingCID}`} className="underline ml-1">{cred.onchain.mappingCID}</a>
                      {cred.onchain?.id && <span className="ml-2">(id #{cred.onchain.id})</span>}
                      {cred.onchain?.valid === false && <span className="ml-2 text-red-600"> (revoked)</span>}
                    </div>
                  ) : (
                    cred?.onchain && (
                      <div className="text-xs mt-2 text-slate-500">
                        On-chain: id {cred.onchain.id ?? "?"}, mappingCID: <span className="italic">none</span>
                      </div>
                    )
                  )}
                </div>

                <div className="flex-shrink-0 w-full md:w-auto flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    <button onClick={() => downloadJSON(cred)} className="flex items-center gap-2 bg-blue-100 text-gray px-2 py-1 rounded text-xs " title="JSON">
                      <FileText size={14} /> {/* JSON */}
                    </button>
                    <button onClick={() => downloadPDF(cred)} className="flex items-center gap-2 bg-blue-100 text-gray px-2 py-1 rounded text-xs" title="PDF">
                      <Download size={14} /> {/* PDF */}
                    </button>
                    <button onClick={() => jwt ? copyToClipboard(jwt, "JWT") : alert("No JWT for this credential")} className="flex items-center gap-2 bg-blue-100 text-gray px-2 py-1 rounded text-xs" title="JWT">
                      <Copy size={14} /> {/* JWT */}
                    </button>
                    <button onClick={() => jwt ? generateQr(jwt) : alert("No JWT to generate QR")} className="flex items-center gap-2 bg-blue-100 text-gray px-2 py-1 rounded text-xs" title="QR">
                      <QrCode size={14} />
                    </button>
                  </div>

                  <div className="w-full mt-1">
                    <input
                      placeholder="web3.storage token (optional)"
                      value={ipfsToken}
                      onChange={(e) => setIpfsToken(e.target.value)}
                      className="border px-2 py-1 rounded text-xs w-full bg-slate-50"
                    />
                    <div className="flex gap-2 mt-2 items-center">
                      <button onClick={() => publishCredentialToIpfsAndStoreOnChain(cred, i)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs">
                        <UploadCloud size={14} /> {ipfsStatus[i]?.uploading ? "Uploading..." : chainStatus[i]?.sending ? "Storing..." : "Publish"}
                      </button>

                      {cred?.onchain?.mappingCID && (
                        <button onClick={() => retryFetchIpfs(cred.onchain.mappingCID, i)} className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs">
                          <RefreshCw size={12} /> {/* Retry IPFS */}
                        </button>
                      )}

                      {ipfsStatus[i]?.cid && (
                        <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${ipfsStatus[i].cid}`} className="text-xs underline ml-1">View</a>
                      )}
                      {ipfsStatus[i]?.error && <div className="text-xs text-red-600">{ipfsStatus[i].error}</div>}
                      {chainStatus[i]?.txHash && <div className="text-xs ml-2">Tx: <a className="underline" target="_blank" rel="noreferrer" href={`https://etherscan.io/tx/${chainStatus[i].txHash}`}>{chainStatus[i].txHash}</a></div>}
                      {chainStatus[i]?.error && <div className="text-xs text-red-600 ml-2">{chainStatus[i].error}</div>}
                    </div>

                    {ipfsStatus["retry-" + i]?.json && (
                      <div className="mt-2 text-xs bg-slate-50 p-2 rounded">
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
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg text-blue-900 font-medium">Verify JWT</h3>
            <div className="text-xs text-slate-500">Paste a JWT and verify its signature / claims</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleJwtVerification}
              className="flex items-center gap-2 border border:blue-900 hover:bg-blue-900 text-blue-900 hover:text-white px-3 py-1.5 rounded text-sm"
            >
              <CheckCircle size={14} /> Verify
            </button>

            <button
              onClick={() => { setJwtToVerify(""); setVerificationResult(null); }}
              className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded text-sm"
            >
              <AlertCircle size={14} /> Clear
            </button>
          </div>
        </div>

        <textarea
          value={jwtToVerify}
          onChange={(e) => setJwtToVerify(e.target.value.trim())}
          rows={4}
          className="w-full bg-slate-100 border border:gray-50 p-2 rounded text-sm"
          placeholder="Paste JWT here..."
        />

        {/* RESULT PANEL */}
        {verificationResult && (
          <div className="mt-4 p-3 rounded bg-slate-50">
            {/* Top banner: Verified / Not verified */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {verificationResult.verified ? (
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <CheckCircle size={18} /> Verified ✅
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-700 font-semibold">
                    <AlertCircle size={18} /> Not verified
                  </div>
                )}

                {/* optional short error message */}
                {!verificationResult.verified && verificationResult.error && (
                  <div className="text-xs text-red-600 ml-2">({verificationResult.error})</div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                <span className="font-semibold">Status:</span>{" "}
                {verificationResult.verified ? "Signature OK" : "Signature failed"}
              </div>
            </div>

            {/* META GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {/* Issuer */}
              <div className="flex flex-col">
                <div className="text-xs text-slate-500">Issuer</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-xs px-2 py-1 bg-white border border-slate-100 rounded truncate max-w-full">{verificationResult.payload?.iss ?? "N/A"}</code>
                  <button
                    onClick={() => copyToClipboard(verificationResult.payload?.iss ?? "", "Issuer DID")}
                    className="bg-slate-100 px-2 py-1 rounded text-xs hover:bg-slate-200"
                    title="Copy issuer DID"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div className="flex flex-col">
                <div className="text-xs text-slate-500">Subject</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-xs px-2 py-1 bg-white border border-slate-100 rounded truncate max-w-full">{verificationResult.payload?.sub ?? "N/A"}</code>
                  <button
                    onClick={() => copyToClipboard(verificationResult.payload?.sub ?? "", "Subject DID")}
                    className="bg-slate-100 px-2 py-1 rounded text-xs hover:bg-slate-200"
                    title="Copy subject DID"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {/* Expiry */}
              <div className="flex flex-col">
                <div className="text-xs text-slate-500">Expiry</div>
                <div className="mt-1 text-sm">
                  {(() => {
                    const exp = verificationResult.payload?.exp;
                    if (!exp) return <span className="text-slate-600">N/A</span>;
                    const expDate = new Date(exp * 1000);
                    const now = Date.now();
                    const diff = expDate.getTime() - now;
                    const days = Math.ceil(Math.abs(diff) / (1000 * 60 * 60 * 24));
                    const relative = diff > 0 ? `in ${days} day${days > 1 ? "s" : ""}` : `${days} day${days > 1 ? "s" : ""} ago`;
                    const expired = diff <= 0;
                    return (
                      <div className="flex flex-col">
                        <div className={`font-mono text-xs px-2 py-1 rounded ${expired ? "text-red-700" : "text-emerald-700"}`}>
                          {expired ? "Expired" : "Valid"} · {relative}
                        </div>
                        <div className={`text-xs mt-1 ${expired ? "text-red-600" : "text-slate-600"}`}>{expDate.toUTCString()}</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* small summary rows (optional) */}
            <div className="mt-3 text-xs text-slate-600 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div><strong>Verified:</strong> {verificationResult.verified ? "true" : "false"}</div>
              {verificationResult.payload?.iat && (<div><strong>Issued:</strong> {new Date(verificationResult.payload.iat * 1000).toUTCString()}</div>)}
            </div>

            {/* payload preview toggle */}
            <details className="mt-3 bg-white border border-slate-100 rounded p-2">
              <summary className="text-sm cursor-pointer">View full payload (JSON)</summary>
              <pre className="text-xs whitespace-pre-wrap mt-2 max-h-56 overflow-auto bg-slate-50 p-2 rounded">{JSON.stringify(verificationResult.payload ?? verificationResult, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>

      {/* Divider */}
      <hr className="my-8 border-slate-200" />

      {/* Presentation creation section */}
      {/* Presentation creation section (improved UI) */}
      <section className="mt-6">
        <div className="bg-white border border-slate-100 rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Left: explanation */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow">
                  <CheckCircle size={20} className="text-white" />
                </div>
              </div>

              <div>
                <h3 className="text-lg text-gray-600 font-semibold">Create a Verifiable Presentation</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-prose">
                  A Verifiable Presentation lets you prove ownership of your Verifiable Credential
                  while disclosing only the claims a verifier needs. Use it to share proofs safely
                  and selectively.
                </p>

                <ul className="mt-3 text-sm text-slate-600 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mt-2" />
                    Share proofs without revealing full credential details.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mt-2" />
                    Create presentations for verifiers, OTC onboarding, or selective disclosure.
                  </li>
                </ul>

                <div className="mt-3 text-xs text-slate-500">
                  Tip: It’s best to <strong>verify the credential JWT</strong> before creating a presentation.
                </div>
              </div>
            </div>

            {/* Right: actions & preview */}
            <div className="flex flex-col gap-3">
              {/* Primary CTA */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage("ethrpresent")}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white transition-all duration-150 shadow-md transform
                    bg-gradient-to-r from-green-600 to-blue-600 hover:from-blue-700 hover:to-green-700 hover:scale-[1.02]"
                  title="Go to Ethr VC Presentation"
                >
                  <QrCode size={18} /> Ethr VC Presentation
                </button>
              </div>

              {/* Extra small guidance */}
              <div className="text-xs text-slate-500">
                <strong>When to use</strong>: present a credential when a verifier asks for proof (e.g. onboarding).
              </div>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
};

export default EthrVcManager;
