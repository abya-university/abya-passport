// src/components/VcPresentationManager.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import QRCode from "qrcode";
import * as ethers from "ethers";
import { fetchDidDocument } from "../services/ipfsService";
import { useEthr } from "../contexts/EthrContext";
import {
  RefreshCw,
  Copy,
  QrCode as QrIcon,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const API_BASE = "http://localhost:3000";
const VC_ADDRESS = import.meta.env.VITE_VC_CONTRACT_ADDRESS || "0xE2ff8118Bc145F03410F46728BaE0bF3f1C6EF81";
const VC_ABI = [
  "function getCredentialsForStudent(string studentDID) view returns (uint256[])",
  "function credentialCount() view returns (uint256)",
  "function credentials(uint256) view returns (uint256,string,string,string,uint256,string,string,string,string,bool)",
];

const isLikelyCid = (s) => {
  if (!s || typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44,}$/.test(trimmed)) return true;
  if (/^[bB][a-z2-7]{40,}$/.test(trimmed)) return true;
  if (/^[A-Za-z0-9\-_.:]{20,128}$/.test(trimmed) && !/\s/.test(trimmed)) return true;
  return false;
};

const base64UrlDecode = (str) => {
  try {
    let s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(
      atob(s)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (e) {
    return null;
  }
};

const parseJwtPayload = (jwt) => {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const VcPresentationManager = ({ onBack = null }) => {
  const { walletDid } = useEthr();

  const [allCredentials, setAllCredentials] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [ipfsCredentials, setIpfsCredentials] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [manualJwt, setManualJwt] = useState("");
  const [presentationJwt, setPresentationJwt] = useState("");
  const [presentLoading, setPresentLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [presentations, setPresentations] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [error, setError] = useState("");
  const [ipfsToken, setIpfsToken] = useState("");
  const [extractedCids, setExtractedCids] = useState([]);
  const [ipfsDiagnostics, setIpfsDiagnostics] = useState([]);
  const [showAll, setShowAll] = useState(false);

  const cidCacheRef = useRef(new Map());

  const safeToString = (v) => {
    try {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (typeof v === "bigint") return v.toString();
      if (v?.toString && typeof v.toString === "function") return v.toString();
      return String(v);
    } catch {
      return String(v);
    }
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
        const checksum = ethers.utils ? ethers.utils.getAddress(hex) : null;
        if (checksum) out.push(checksum);
      } catch {}
    }
    if (did.startsWith("did:ethr:")) {
      const removed = did.replace(/^did:ethr:[^:]+:/, "");
      if (removed && !out.includes(removed)) out.push(removed);
    }
    return out.filter((v, i) => v && out.indexOf(v) === i);
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

  const tryFetchFromGateways = async (cid) => {
    const gateways = [`https://dweb.link/ipfs/${cid}`, `https://ipfs.io/ipfs/${cid}`, `https://cloudflare-ipfs.com/ipfs/${cid}`];
    const fetchPromises = gateways.map((g) =>
      fetch(g).then(async (r) => {
        if (!r.ok) throw new Error(`gateway ${g} returned ${r.status}`);
        return { source: g, json: await r.json() };
      })
    );
    try {
      const res = await Promise.any(fetchPromises);
      return { doc: res.json, source: res.source };
    } catch (aggregateErr) {
      const reason = aggregateErr?.errors?.map((e) => e?.message).join(" | ") || String(aggregateErr);
      throw new Error(`Gateways failed: ${reason}`);
    }
  };

  const fetchIpfsDocsForCids = async (cids) => {
    if (!Array.isArray(cids) || cids.length === 0) return [];
    const promises = cids.map(async (cid) => {
      if (cidCacheRef.current.has(cid)) {
        return { cid, doc: cidCacheRef.current.get(cid), source: "cache", error: null };
      }
      try {
        const maybeDoc = ipfsToken ? await fetchDidDocument(cid, { token: ipfsToken }) : await fetchDidDocument(cid);
        if (maybeDoc) {
          cidCacheRef.current.set(cid, maybeDoc);
          return { cid, doc: maybeDoc, source: "primary", error: null };
        }
      } catch (primaryErr) {
        // fallback
      }
      try {
        const gwRes = await tryFetchFromGateways(cid);
        cidCacheRef.current.set(cid, gwRes.doc);
        return { cid, doc: gwRes.doc, source: gwRes.source, error: null };
      } catch (gwErr) {
        return { cid, doc: null, source: "gateways", error: gwErr?.message ?? String(gwErr) };
      }
    });

    const settled = await Promise.allSettled(promises);
    return settled.map((s) => (s.status === "fulfilled" ? s.value : { cid: null, doc: null, source: "error", error: String(s.reason) }));
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

      if ((!idsRaw || idsRaw.length === 0) && did) {
        const hex = extractHexAddressFromDid(did);
        if (hex) {
          try {
            const res2 = await readContract.getCredentialsForStudent(hex);
            const idList2 = Array.isArray(res2) ? res2.map((x) => safeToString(x)) : [];
            if (idList2 && idList2.length > 0) {
              idsRaw = idList2;
              usedVariant = hex;
            }
          } catch (_) {}
        }
      }

      const idList = idsRaw;
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
              try {
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
                  } catch (gerr) {}
                }
              } catch (e) {}
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
        } catch (inner) {}
      }

      console.debug("fetchOnChainCredentialsForDid rows:", rowsDebug);
      return results;
    } catch (err) {
      console.warn("fetchOnChainCredentialsForDid error", err);
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

  const extractCids = (creds) => {
    const setCids = new Set();
    if (!Array.isArray(creds)) return [];
    creds.forEach((c) => {
      const candidates = [
        c?.onchain?.mappingCID,
        c?.mappingCID,
        c?.cid,
        c?.ipfsCid,
        c?.id,
        c?.meta?.mappingCID,
      ];
      candidates.forEach((cand) => {
        if (cand && typeof cand === "string" && isLikelyCid(cand)) setCids.add(cand.trim());
      });
      if (c?.metadata && typeof c.metadata === "string") {
        try {
          const parsed = JSON.parse(c.metadata);
          if (parsed?.mappingCID && isLikelyCid(parsed.mappingCID)) setCids.add(parsed.mappingCID.trim());
        } catch (e) {}
      }
    });
    return Array.from(setCids);
  };

  const buildIpfsCredentials = async (creds) => {
    setIpfsCredentials([]);
    setIpfsDiagnostics([]);
    if (!Array.isArray(creds) || creds.length === 0) {
      setIpfsCredentials([]);
      setExtractedCids([]);
      return;
    }

    const cidsFromBackend = extractCids(creds);
    setExtractedCids(cidsFromBackend);

    let docs = [];
    if (cidsFromBackend.length > 0) {
      try {
        docs = await fetchIpfsDocsForCids(cidsFromBackend);
      } catch (err) {
        console.warn("fetchIpfsDocsForCids failed", err);
      }
    }

    const merged = creds.map((c) => {
      const mappingCID = c?.onchain?.mappingCID || c?.mappingCID || c?.cid || c?.ipfsCid || null;
      if (mappingCID) {
        const match = docs.find((d) => d.cid === mappingCID);
        if (match) {
          return { original: c, cid: mappingCID, doc: match.doc ?? null, ipfsStatus: { source: match.source ?? null, error: match.error ?? null } };
        }
      }
      return { original: c, cid: null, doc: c, ipfsStatus: { source: "inline", error: null } };
    });

    const diag = docs.map((d) => ({ cid: d.cid, fetched: !!d.doc, source: d.source, error: d.error }));
    setIpfsDiagnostics(diag);
    setIpfsCredentials(merged);
  };

  const fetchCredentials = async () => {
    setCredsLoading(true);
    setError("");
    try {
      if (walletDid) {
        try {
          const onchain = await fetchOnChainCredentialsForDid(walletDid);
          if (onchain && onchain.length > 0) {
            const mapped = onchain.map((c) => ({
              original: null,
              cid: c?.onchain?.mappingCID || null,
              doc: c,
              ipfsStatus: { source: "onchain", error: null },
            }));
            setAllCredentials(onchain);
            setCredentials(onchain);
            setIpfsCredentials(mapped);
            setCredsLoading(false);
            return;
          }
        } catch (err) {
          console.warn("on-chain fetch failed; will fallback to backend", err);
        }
      }

      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];
      setAllCredentials(Array.isArray(creds) ? creds : []);
      if (walletDid && Array.isArray(creds) && creds.length > 0) {
        const filtered = creds.filter((c) => {
          const subj =
            c?.credentialSubject?.id ||
            c?.subjectDid ||
            c?.subject ||
            c?.credentialSubject?.sub ||
            c?.onchain?.usedVariant ||
            null;
          if (!subj) return false;
          if (subj === walletDid) return true;
          if (typeof subj === "string" && (subj.includes(walletDid) || walletDid.includes(subj))) return true;
          try {
            const hexMatch = subj.match(/0x[0-9a-fA-F]{40}/);
            if (hexMatch && walletDid.toLowerCase().includes(hexMatch[0].toLowerCase())) return true;
          } catch (e) {}
          return false;
        });
        setCredentials(filtered.length > 0 ? filtered : creds);
        setShowAll(filtered.length === 0);
      } else {
        setCredentials(creds);
      }

      await buildIpfsCredentials(Array.isArray(creds) ? creds : []);
    } catch (err) {
      console.error("fetchCredentials error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to fetch credentials");
      setAllCredentials([]);
      setCredentials([]);
      setIpfsCredentials([]);
    } finally {
      setCredsLoading(false);
    }
  };

  const fetchPresentations = async () => {
    setListLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/presentation/list`);
      const list = res.data?.presentations ?? res.data ?? [];
      setPresentations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("fetch presentations error", err);
    } finally {
      setListLoading(false);
    }
  };

  // --- FIXED: prefer vp.proof.jwt when backend returns presentation object ---
  const handleCreatePresentation = async () => {
    setPresentLoading(true);
    setError("");
    setPresentationJwt("");
    try {
      let holderDid = walletDid || null;
      if (!holderDid && manualJwt) {
        const payload = parseJwtPayload(manualJwt);
        if (payload?.sub) holderDid = payload.sub;
      }
      if (!holderDid && selectedIdx !== null) {
        const selDoc = ipfsCredentials[selectedIdx]?.doc;
        holderDid = selDoc?.credentialSubject?.id || selDoc?.subject || null;
      }
      if (!holderDid) {
        alert("Missing holder DID. Connect your wallet or ensure selected credential contains a subject DID, or paste a JWT that contains 'sub'.");
        setPresentLoading(false);
        return;
      }

      let credsArray = [];
      if (manualJwt && manualJwt.trim()) {
        credsArray = [manualJwt.trim()];
      } else if (selectedIdx !== null) {
        const sel = ipfsCredentials[selectedIdx];
        const compactJwt = sel?.doc?.proof?.jwt || sel?.doc?.jwt || null;
        if (compactJwt) {
          credsArray = [compactJwt];
        } else if (sel?.doc) {
          credsArray = [sel.doc];
        } else {
          alert("Selected credential does not contain a JWT or document to present.");
          setPresentLoading(false);
          return;
        }
      } else {
        alert("Select a credential or paste a JWT to create a presentation.");
        setPresentLoading(false);
        return;
      }

      const body = {
        holderDid,
        verifiableCredentials: credsArray,
      };

      const res = await axios.post(`${API_BASE}/presentation/create`, body);
      const vp = res.data?.presentation ?? res.data;

      // prefer proof.jwt inside the returned presentation object
      const jwt =
        vp?.proof?.jwt ??
        vp?.jwt ??
        (typeof vp === "string" ? vp : JSON.stringify(vp));

      setPresentationJwt(jwt);
      await fetchPresentations();
    } catch (err) {
      console.error("create presentation error", err);
      setError(err?.response?.data?.error || err?.message || "Failed to create presentation");
    } finally {
      setPresentLoading(false);
    }
  };

  const handleVerifyPresentation = async (jwtToVerifyParam = null) => {
    setVerifyResult(null);
    setError("");
    const jwt = jwtToVerifyParam ?? presentationJwt;
    if (!jwt) return alert("Provide a presentation JWT");
    try {
      const res = await axios.post(`${API_BASE}/presentation/verify`, { presentation: jwt });
      const ver = res.data?.verification ?? res.data;
      setVerifyResult(ver);
    } catch (err) {
      console.error("verify presentation error", err);
      setVerifyResult({ verified: false, error: err?.response?.data?.error || err?.message || "Verification failed" });
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

  const handleCopyCredentialJwt = (idx) => {
    const sel = ipfsCredentials[idx];
    const jwt = sel?.doc?.proof?.jwt || sel?.doc?.jwt || null;
    if (!jwt) return alert("No JWT found in this credential");
    copyToClipboard(jwt, "Credential JWT");
  };

  const handleToggleShowAll = () => setShowAll((s) => !s);

  useEffect(() => {
    (async () => {
      await fetchCredentials();
      await fetchPresentations();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid]);

  useEffect(() => {
    const toUse = showAll ? allCredentials : credentials;
    buildIpfsCredentials(toUse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCredentials, credentials, showAll, ipfsToken]);

  useEffect(() => {
    if (allCredentials.length > 0 && credentials.length === 0) {
      setCredentials(allCredentials);
    }
  }, [allCredentials, credentials.length]);

  const credentialOptions = useMemo(() => {
    return ipfsCredentials.map((c, i) => {
      const doc = c.doc || {};
      const name = doc?.credentialSubject?.name || doc?.name || doc?.title || (c.cid ? `IPFS ${c.cid}` : `Credential ${i + 1}`);
      const subject = doc?.credentialSubject?.id || doc?.subject || "—";
      return { label: `${name} — ${subject}`, idx: i };
    });
  }, [ipfsCredentials]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Verifiable Presentation Manager</h2>
          <p className="text-sm text-slate-500 mt-1">Create, verify and manage verifiable presentations derived from your credentials (fetches IPFS itself).</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onBack?.()} className="text-sm bg-slate-100 px-3 py-1 rounded hover:bg-slate-200">Back</button>
          <button onClick={() => { fetchCredentials(); fetchPresentations(); }} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded hover:bg-slate-200">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* DID card */}
      <section className="bg-white border border-slate-100 rounded p-3 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`inline-block w-3 h-3 rounded-full ${walletDid ? "bg-emerald-500" : "bg-slate-300"}`} title={walletDid ? "Wallet DID available" : "No wallet DID"} />
          <div>
            <div className="text-xs text-slate-500">Connected DID</div>
            <div className="font-mono text-sm text-slate-800 max-w-[60ch] truncate">{walletDid ?? "No wallet DID (connect wallet)"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!walletDid) return alert("No wallet DID to copy");
              copyToClipboard(walletDid, "Wallet DID");
            }}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm flex items-center gap-2"
          >
            <Copy size={14} /> Copy DID
          </button>
        </div>
      </section>

      {/* Optional: IPFS token entry */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600">Optional IPFS token (web3.storage / Pinata)</label>
          <input value={ipfsToken} onChange={(e) => setIpfsToken(e.target.value)} placeholder="Enter API token (optional)" className="ml-2 px-2 py-1 border rounded text-sm w-72 bg-slate-50" />
          <button onClick={() => { cidCacheRef.current.clear(); buildIpfsCredentials(showAll ? allCredentials : credentials); }} className="px-2 py-1 bg-slate-100 rounded text-sm">Apply token & refresh</button>
          <div className="ml-auto text-xs text-slate-500">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={handleToggleShowAll} /> Show all credentials</label>
          </div>
        </div>
      </section>

      {/* Available credentials */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Available credentials (from IPFS)</h3>
          <div className="text-xs text-slate-500">{ipfsCredentials.length} items</div>
        </div>

        {credsLoading ? (
          <div className="text-sm text-slate-500">Loading credentials…</div>
        ) : ipfsCredentials.length === 0 ? (
          <div className="text-sm text-slate-500">No credentials found for this DID. Try toggling "Show all credentials" or check backend.</div>
        ) : (
          <div className="grid gap-3">
            {ipfsCredentials.map((c, i) => {
              const doc = c.doc || {};
              const title = doc?.credentialSubject?.name || doc?.name || `Credential ${i + 1}`;
              const subject = doc?.credentialSubject?.id || doc?.subject || "—";
              const hasJwt = !!(doc?.proof?.jwt || doc?.jwt);
              const selectedClass = selectedIdx === i ? "ring-2 ring-blue-200" : "";
              return (
                <div key={i} className={`p-3 border rounded flex items-start justify-between ${selectedClass}`}>
                  <div className="flex-1 pr-3">
                    <div className="text-sm font-medium text-slate-800 truncate">{title}</div>
                    <div className="text-xs text-slate-500 mt-1">Subject: <code className="font-mono text-xs bg-slate-50 px-1 rounded">{subject}</code></div>
                    <div className="text-xs text-slate-500 mt-1">CID: {c.cid ?? "—"}</div>
                    {c.ipfsStatus?.error && <div className="text-xs text-red-600 mt-1">IPFS error: {c.ipfsStatus.error}</div>}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedIdx(i)} className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200">Select</button>
                      <button onClick={() => handleCopyCredentialJwt(i)} className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200"><Copy size={12} /></button>
                      {hasJwt && (
                        <button onClick={() => { const jwt = doc.proof?.jwt || doc.jwt; setManualJwt(jwt); alert("JWT loaded into manual box — you can create a presentation now."); }} className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200">Load JWT</button>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{doc?.issuanceDate ? `Issued: ${new Date(doc.issuanceDate).toLocaleString()}` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create / Verify Presentation */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <h3 className="text-lg font-medium mb-2">Create presentation</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600">Selected credential</label>
            <div className="mt-1 text-sm text-slate-800">
              {selectedIdx !== null ? (
                <>
                  <div className="font-medium">{ipfsCredentials[selectedIdx]?.doc?.credentialSubject?.name || ipfsCredentials[selectedIdx]?.doc?.name || "—"}</div>
                  <div className="text-xs text-slate-500 mt-1">Subject: <code className="font-mono text-xs bg-slate-50 px-1 rounded">{ipfsCredentials[selectedIdx]?.doc?.credentialSubject?.id || "—"}</code></div>
                </>
              ) : (
                <div className="text-sm text-slate-500">No credential selected — you can also paste a JWT below.</div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-600">Manual credential JWT (optional)</label>
            <input value={manualJwt} onChange={(e) => setManualJwt(e.target.value)} placeholder="Paste compact JWT here" className="mt-1 w-full border px-2 py-1 rounded text-sm bg-slate-50" />
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={handleCreatePresentation} disabled={presentLoading} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded">
            <QrIcon size={14} /> {presentLoading ? "Creating..." : "Create Presentation"}
          </button>

          <button onClick={() => { setPresentationJwt(""); setVerifyResult(null); }} className="bg-slate-100 px-3 py-2 rounded">Clear</button>
        </div>

        {presentationJwt && (
          <div className="mt-3 p-3 bg-slate-50 rounded border">
            <div className="flex items-start justify-between">
              <div className="text-sm font-medium">Presentation (JWT)</div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyToClipboard(presentationJwt, "Presentation JWT")} className="px-2 py-1 rounded bg-slate-100 text-xs">Copy</button>
                <button onClick={() => generateQr(presentationJwt)} className="px-2 py-1 rounded bg-slate-100 text-xs"><QrIcon size={12} /></button>
                <button onClick={() => handleVerifyPresentation(presentationJwt)} className="px-2 py-1 rounded bg-indigo-600 text-white text-xs"><CheckCircle size={12} /> Verify</button>
              </div>
            </div>

            <pre className="text-xs mt-2 whitespace-pre-wrap max-h-40 overflow-auto bg-white p-2 rounded">{presentationJwt}</pre>
          </div>
        )}

        {qrDataUrl && (
          <div className="mt-3 flex items-center gap-4">
            <img src={qrDataUrl} alt="QR" className="w-36 h-36" />
            <div className="text-sm text-slate-600">Scan to import the presentation JWT.</div>
          </div>
        )}

        {verifyResult && (
          <div className="mt-3 p-3 rounded border bg-white">
            <div className="flex items-center gap-3">
              {verifyResult.verified ? (
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle /> Verified</div>
              ) : (
                <div className="flex items-center gap-2 text-red-700"><AlertCircle /> Not verified</div>
              )}
              {verifyResult.error && <div className="text-xs text-red-600">Error: {verifyResult.error}</div>}
            </div>
            <details className="mt-2">
              <summary className="text-sm cursor-pointer">View verification details</summary>
              <pre className="text-xs mt-2 bg-slate-50 p-2 rounded max-h-56 overflow-auto">{JSON.stringify(verifyResult, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>

      {/* Presentations list */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Presentations</h3>
          <div className="text-xs text-slate-500">{presentations.length} items</div>
        </div>

        {listLoading ? (
          <div className="text-sm text-slate-500">Loading presentations…</div>
        ) : presentations.length === 0 ? (
          <div className="text-sm text-slate-500">No presentations created yet.</div>
        ) : (
          <div className="space-y-2">
            {presentations.map((p, i) => {
              const jwt = p?.jwt || p?.presentation || p;
              const created = p?.createdAt || p?.timestamp || null;
              return (
                <div key={i} className="p-2 border rounded flex items-start justify-between">
                  <div className="flex-1 pr-3">
                    <div className="text-sm font-medium truncate">{p?.title ?? `Presentation ${i + 1}`}</div>
                    <div className="text-xs text-slate-500 mt-1">{created ? new Date(created).toLocaleString() : "—"}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => { copyToClipboard(jwt, "Presentation JWT"); }} className="px-2 py-1 rounded text-xs bg-slate-100">Copy</button>
                    <button onClick={() => { setPresentationJwt(jwt); }} className="px-2 py-1 rounded text-xs bg-slate-100">Load</button>
                    <button onClick={() => handleVerifyPresentation(jwt)} className="px-2 py-1 rounded text-xs bg-indigo-600 text-white">Verify</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Diagnostics */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm text-xs">
        <h4 className="font-medium mb-2">Diagnostics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <strong>Backend credentials (count):</strong> {allCredentials.length}
            <details className="mt-2">
              <summary className="cursor-pointer">Show raw backend list</summary>
              <pre className="mt-2 max-h-48 overflow-auto bg-slate-50 p-2 rounded">{JSON.stringify(allCredentials, null, 2)}</pre>
            </details>
          </div>

          <div>
            <strong>Extracted CIDs:</strong> {extractedCids.length} <button onClick={() => { buildIpfsCredentials(showAll ? allCredentials : credentials); }} className="ml-2 px-2 py-1 rounded bg-slate-100 text-xs">Rebuild</button>
            <pre className="mt-2 max-h-48 overflow-auto bg-slate-50 p-2 rounded">{JSON.stringify(extractedCids, null, 2)}</pre>
          </div>
        </div>
      </section>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
};

export default VcPresentationManager;
