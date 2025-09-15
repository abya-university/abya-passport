// src/components/VCVerifierEthr.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import * as ethers from "ethers";
import { useEthr } from "../contexts/EthrContext";
import { useEthersSigner } from "./useClientSigner";
import { CreditCard, CreditCardIcon, IdCardIcon, StepBackIcon, VerifiedIcon, Wallet2Icon, WalletCards } from "lucide-react";
import { fetchDidDocument } from "../services/ipfsService";

const API_BASE = "http://localhost:3000";
const VC_ADDRESS =
  import.meta.env.VITE_VC_CONTRACT_ADDRESS ||
  import.meta.env.VITE_VC_ADDRESS ||
  "0x93eEc6FffeE62c79d5ef5Be5b0679aE928E8C1B2";

const VC_ABI = [
  "function getCredentialsForDID(string did) view returns (uint256[])",
  "function getCredentialSummary(uint256 id) view returns (uint256, bytes32, string, bytes32, uint256, uint256, bool, uint256, string)",
  "function getCIDVersions(uint256 id) view returns (string[])",
  "function getRawCredential(uint256 id) view returns (uint256, bytes32, string[], bytes32, uint256, uint256, bool, uint256, string)",
];

/* ------------------- helpers (did variants, provider & contract) ------------------- */
const safeToString = (v) => {
  try {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v?.toString === "function") return v.toString();
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
      if (ethers && ethers.utils && typeof ethers.utils.getAddress === "function") {
        const checksum = ethers.utils.getAddress(hex);
        if (checksum) out.push(checksum);
      }
    } catch (e) { }
  }

  if (did.startsWith && did.startsWith("did:ethr:")) {
    const removed = did.replace(/^did:ethr:[^:]+:/, "");
    if (removed && !out.includes(removed)) out.push(removed);
  }

  return out.filter((v, i) => v && out.indexOf(v) === i);
};

const getContractReadonly = async () => {
  const rpcUrl =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APP_RPC_URL) || null;
  let provider;
  if (typeof window !== "undefined" && window.ethereum) {
    try {
      if (ethers?.providers?.Web3Provider) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
      } else if (ethers?.BrowserProvider) {
        provider = new ethers.BrowserProvider(window.ethereum);
      }
    } catch (e) {
      console.warn("Failed to use window.ethereum provider:", e);
      provider = null;
    }
  }

  if (!provider) {
    try {
      if (rpcUrl) {
        if (ethers?.providers?.JsonRpcProvider) {
          provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        } else if (typeof ethers.JsonRpcProvider === "function") {
          provider = new ethers.JsonRpcProvider(rpcUrl);
        }
      } else if (typeof ethers.getDefaultProvider === "function") {
        provider = ethers.getDefaultProvider();
      }
    } catch (e) {
      console.warn("Failed to create JSON/default provider:", e);
      provider = null;
    }
  }

  if (!provider) throw new Error("No JSONRPC or injected provider available for readonly operations");

  const contract = new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
  return contract;
};

/* ------------------- verification helpers ------------------- */

const base64UrlDecode = (str) => {
  if (!str) return null;
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  try {
    const decoded = atob(str);
    try {
      return decodeURIComponent(
        Array.prototype
          .map
          .call(decoded, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch {
      return decoded;
    }
  } catch (e) {
    return null;
  }
};

const getAddressFromDid = (did) => {
  const hex = extractHexAddressFromDid(did);
  if (!hex) return null;
  try {
    return ethers.utils.getAddress(hex);
  } catch {
    return hex;
  }
};

// deep subset: returns true if every key in small exists and equals in big (recursively) - used to compare credentialSubject
const deepSubsetMatch = (small, big) => {
  if (small === big) return true;
  if (typeof small !== "object" || small === null) return small === big;
  if (typeof big !== "object" || big === null) return false;
  for (const k of Object.keys(small)) {
    if (!(k in big)) return false;
    const a = small[k];
    const b = big[k];
    if (typeof a === "object" && a !== null) {
      if (!deepSubsetMatch(a, b)) return false;
    } else {
      if (String(a) !== String(b)) return false;
    }
  }
  return true;
};

/* fallback local signature extraction (kept but not used for stamp-only policy) */
const extractIssuerAddress = (issuer) => {
  if (!issuer) return null;
  if (typeof issuer === "string") {
    const m = issuer.match(/0x[0-9a-fA-F]{40}/);
    if (m) return ethers.utils.getAddress(m[0]);
    return issuer;
  }
  if (typeof issuer === "object") {
    const id = issuer.id || issuer.verificationMethod || issuer.address;
    if (!id) return null;
    const m = String(id).match(/0x[0-9a-fA-F]{40}/);
    if (m) return ethers.utils.getAddress(m[0]);
    return id;
  }
  return null;
};

/* ------------------- on-chain fetcher (unchanged except include mappingCID) ------------------- */
const fetchOnChainCredentialsForDid = async (did, walletAddressFallback = null) => {
  try {
    const readContract = await getContractReadonly();
    if (!readContract.getCredentialsForDID) {
      console.warn("Contract does not expose getCredentialsForDID");
      return [];
    }

    const variants = normalizeDidVariants(did);

    let idsRaw = [];
    let usedVariant = null;

    for (const v of variants) {
      try {
        const res = await readContract.getCredentialsForDID(v);
        const arr = Array.isArray(res) ? res.map((x) => safeToString(x)) : [];
        if (arr && arr.length > 0) {
          idsRaw = arr;
          usedVariant = v;
          break;
        }
      } catch (e) {
        console.warn("getCredentialsForDID failed for variant", v, e);
      }
    }

    if ((!idsRaw || idsRaw.length === 0) && walletAddressFallback) {
      try {
        const res2 = await readContract.getCredentialsForDID(walletAddressFallback);
        const arr2 = Array.isArray(res2) ? res2.map((x) => safeToString(x)) : [];
        if (arr2 && arr2.length > 0) {
          idsRaw = arr2;
          usedVariant = walletAddressFallback;
        }
      } catch (e) {
        console.warn("fallback getCredentialsForDID failed", e);
      }
    }

    if (!idsRaw || idsRaw.length === 0) {
      return [];
    }

    const results = [];
    for (const idStr of idsRaw) {
      try {
        const idNum = Number(idStr);
        let summary;
        try {
          summary = await readContract.getCredentialSummary(idNum);
        } catch (e) {
          try {
            summary = await readContract.getRawCredential(idNum);
          } catch (ee) {
            console.warn("Failed to fetch summary/raw for id", idNum, ee);
            continue;
          }
        }

        const mappingCID = summary?.[2] ? safeToString(summary[2]) : "";
        const holderHash = summary?.[1] ? safeToString(summary[1]) : "";
        const credentialJWT = summary?.[3] ? safeToString(summary[3]) : "";
        const issueTs = summary?.[4] ? Number(summary[4]) : undefined;
        const expiresAtRaw = summary?.[5] ? Number(summary[5]) : 0;
        const valid = !!summary?.[6];

        let ipfsJson = null;
        if (mappingCID) {
          try {
            ipfsJson = await fetchDidDocument(mappingCID);
          } catch (err) {
            const gateways = [
              `https://dweb.link/ipfs/${mappingCID}`,
              `https://ipfs.io/ipfs/${mappingCID}`,
              `https://cloudflare-ipfs.com/ipfs/${mappingCID}`,
            ];
            for (const g of gateways) {
              try {
                const r = await fetch(g);
                if (r.ok) {
                  ipfsJson = await r.json();
                  break;
                }
              } catch (ge) { }
            }
          }
        }

        let displayed;
        if (ipfsJson) {
          displayed = {
            ...ipfsJson,
            issuanceDate: ipfsJson.issuanceDate || (issueTs ? new Date(issueTs * 1000).toISOString() : undefined),
            issuer: ipfsJson.issuer || { id: null },
            _resolvedCid: mappingCID || undefined,
          };
        } else {
          displayed = {
            credentialSubject: { id: holderHash || idStr },
            issuer: { id: null },
            issuanceDate: issueTs ? new Date(issueTs * 1000).toISOString() : undefined,
            expirationDate: expiresAtRaw ? new Date(expiresAtRaw * 1000).toISOString() : undefined,
            credentialJWT: credentialJWT || undefined,
            _resolvedCid: mappingCID || undefined,
          };
        }

        const credObj = {
          ...displayed,
          onchain: {
            id: idNum,
            holderHash,
            mappingCID,
            credentialJWT,
            issuedAt: issueTs,
            expiresAt: expiresAtRaw,
            valid,
            usedVariant,
          },
        };

        results.push(credObj);
      } catch (inner) {
        console.warn("failed to load onchain id", idStr, inner);
      }
    }

    return results;
  } catch (err) {
    console.warn("fetchOnChainCredentialsForDid error", err);
    return [];
  }
};

/* --------------------------- Component --------------------------- */

export default function VCVerifierEthr({ onBack = () => { } }) {
  const { walletAddress, walletDid } = useEthr();
  const signerPromise = useEthersSigner();

  const [jwtInput, setJwtInput] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [decodedJwtHeader, setDecodedJwtHeader] = useState(null);
  const [decodedJwtPayload, setDecodedJwtPayload] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signerAddr, setSignerAddr] = useState(null);

  // Stored credentials list + selection + per-credential status map
  const [stored, setStored] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [statusMap, setStatusMap] = useState({}); 

  // UI state
  const [fetchingList, setFetchingList] = useState(false);
  const [verifyingBulk, setVerifyingBulk] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // concurrency setting for bulk verification
  const BULK_CONCURRENCY = 3;

  // mounted ref to avoid setState after unmount
  const mountedRef = React.useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await signerPromise;
        if (!s) return;
        try {
          const addr = await s.getAddress();
          if (mountedRef.current) setSignerAddr(addr);
        } catch (_) { }
      } catch (_) { }
    })();
  }, [signerPromise]);

  const TRY_FETCH_PATHS = useMemo(
    () => [
      `${API_BASE}/credentials`,
      `${API_BASE}/credential/list`,
      `${API_BASE}/credential/getAll`,
      `${API_BASE}/vc/list`,
      `${API_BASE}/credential/all`,
    ],
    []
  );

  const attemptResolveIpfsForItem = async (item) => {
    const cidFields = ["mappingCID", "ipfsCID", "cid", "ipfsHash", "hash", "_resolvedCid"];
    for (const f of cidFields) {
      const val = item?.[f] || (item?.metadata && item.metadata[f]) || null;
      if (val && typeof val === "string") {
        try {
          const doc = await fetchDidDocument(val);
          if (doc) {
            return { ...item, _resolvedCidField: f, _resolvedCid: val, credential: doc };
          }
        } catch (e) {
          const gateways = [
            `https://dweb.link/ipfs/${val}`,
            `https://ipfs.io/ipfs/${val}`,
            `https://cloudflare-ipfs.com/ipfs/${val}`,
          ];
          for (const g of gateways) {
            try {
              const res = await fetch(g);
              if (res.ok) {
                const parsed = await res.json();
                return { ...item, _resolvedCidField: f, _resolvedCid: val, credential: parsed };
              }
            } catch (_) { }
          }
        }
      }
    }
    return item;
  };

  const fetchStoredCredentials = async () => {
    if (!mountedRef.current) return;
    setFetchingList(true);
    try {
      let found = null;
      for (const p of TRY_FETCH_PATHS) {
        try {
          const res = await axios.get(p);
          const d = res.data;
          if (Array.isArray(d)) {
            found = d;
            break;
          }
          if (Array.isArray(d?.credentials)) {
            found = d.credentials;
            break;
          }
          if (Array.isArray(d?.items)) {
            found = d.items;
            break;
          }
          if (d?.result && Array.isArray(d.result)) {
            found = d.result;
            break;
          }
          if (d?.vc) {
            found = [d.vc];
            break;
          }
          if (d?.credential && (Array.isArray(d.credential) || typeof d.credential === "object")) {
            found = Array.isArray(d.credential) ? d.credential : [d.credential];
            break;
          }
          if (d && typeof d === "object") {
            const arr = Object.values(d).find((v) => Array.isArray(v));
            if (arr) {
              found = arr;
              break;
            }
          }
        } catch (e) {
          // ignore and try next
        }
      }

      if (!found || (Array.isArray(found) && found.length === 0)) {
        if (walletDid || walletAddress) {
          const didToUse = walletDid || walletAddress;
          const onchain = await fetchOnChainCredentialsForDid(didToUse, walletAddress);
          if (onchain && onchain.length > 0) {
            const normalized = onchain.map((c, idx) => ({ ...(c || {}), __uiId: c?.onchain?.id?.toString?.() || `onchain-${idx}` }));
            if (mountedRef.current) setStored(normalized);
            if (mountedRef.current) setFetchingList(false);
            return;
          }
        }
        try {
          const idsRes = await axios.get(`${API_BASE}/credential/ids`);
          const ids = idsRes.data?.ids || idsRes.data;
          if (Array.isArray(ids) && ids.length > 0) {
            const all = [];
            for (const id of ids) {
              try {
                const r = await axios.get(`${API_BASE}/credential/${id}`);
                all.push(r.data?.credential ?? r.data);
              } catch (ee) { }
            }
            if (all.length) found = all;
          }
        } catch (ee) { }
      }

      if (found && Array.isArray(found) && found.length > 0) {
        const normalizedPre = found.map((c, idx) => {
          const uiId = c?.id?.toString?.() || c?.jti || c?.jwtId || c?.cid || `local-${idx}`;
          return { ...(c || {}), __uiId: uiId, __origIndex: idx };
        });

        const resolved = await Promise.all(
          normalizedPre.map(async (item) => {
            try {
              return await attemptResolveIpfsForItem(item);
            } catch {
              return item;
            }
          })
        );
        if (mountedRef.current) setStored(resolved);
        if (mountedRef.current) setFetchingList(false);
        return;
      }

      if (mountedRef.current) setStored([]);
    } catch (err) {
      console.error("fetchStoredCredentials error", err);
      if (mountedRef.current) setStored([]);
    } finally {
      if (mountedRef.current) setFetchingList(false);
    }
  };

  useEffect(() => {
    fetchStoredCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid, walletAddress]);

  /* --------------------------- Selection & verification logic --------------------------- */
  const toggleSelect = (uiId) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(uiId)) s.delete(uiId);
      else s.add(uiId);
      return s;
    });
  };
  const selectAll = () => setSelectedIds(new Set(stored.map((c) => c.__uiId)));
  const clearSelection = () => setSelectedIds(new Set());

  const resolveCredentialIfNeeded = async (item) => {
    if (!item) return null;
    if (item.credential) return item.credential;
    if (item.vc) return item.vc;
    const nested = Object.values(item).find((v) => v && typeof v === "object" && (v.issuer || v.proof || v.credentialSubject));
    if (nested) return nested;
    const cidFields = ["mappingCID", "ipfsCID", "cid", "ipfsHash", "hash", "_resolvedCid"];
    for (const f of cidFields) {
      const val = item?.[f] || (item?.metadata && item.metadata[f]) || null;
      if (val && typeof val === "string") {
        try {
          const doc = await fetchDidDocument(val);
          if (doc) return doc;
        } catch (e) {
          const gateways = [
            `https://dweb.link/ipfs/${val}`,
            `https://ipfs.io/ipfs/${val}`,
            `https://cloudflare-ipfs.com/ipfs/${val}`,
          ];
          for (const g of gateways) {
            try {
              const res = await fetch(g);
              if (res.ok) {
                return await res.json();
              }
            } catch (_) { }
          }
        }
      }
    }
    return null;
  };

  const verifyWithBackend = async (payload) => {
    // kept for compatibility but NOT used for stamp-only signature policy
    try {
      const body = typeof payload === "string" ? { credential: payload } : { credential: payload };
      const res = await axios.post(`${API_BASE}/credential/verify`, body);
      return res.data?.verification ?? res.data;
    } catch (err) {
      console.error("Backend verify error", err);
      return { verified: false, error: err?.response?.data || err?.message || String(err) };
    }
  };

  // concurrency helper
  const runWithConcurrency = async (items, workerFn, concurrency = 3) => {
    const results = [];
    let idx = 0;
    const active = new Set();

    const next = async () => {
      if (idx >= items.length) return;
      const i = idx++;
      const p = (async () => {
        try {
          const res = await workerFn(items[i]);
          results[i] = res;
        } catch (e) {
          results[i] = { error: String(e) };
        } finally {
          active.delete(p);
          // start next
          await next();
        }
      })();
      active.add(p);
      // keep pool size
      if (active.size < concurrency && idx < items.length) {
        await next();
      }
      return p;
    };

    // start initial concurrency
    const starters = [];
    for (let j = 0; j < Math.min(concurrency, items.length); j++) starters.push(next());
    await Promise.all(starters);
    // wait for remaining active
    await Promise.all(Array.from(active));
    return results;
  };

  // run checks for a single credential item, update statusMap
  const runChecksForCredential = async (credItem, opts = { ensureResolved: true }) => {
    const id = credItem.__uiId;
    // mark running
    setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), running: true, lastError: null } }));
    try {
      let cred = credItem.credential || null;
      // if ensureResolved, attempt to load remote IPFS if missing
      if ((!cred || Object.keys(cred).length === 0) && opts.ensureResolved) {
        setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), resolving: true } }));
        const resolved = await resolveCredentialIfNeeded(credItem);
        if (resolved) {
          cred = resolved;
          setStored((prev) => prev.map((it) => (it.__uiId === id ? { ...it, credential: resolved } : it)));
        }
        setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), resolving: false } }));
      }

      // STRUCTURE check: prefer issuer.id
      const missing = [];
      if (!cred) {
        missing.push("credential (empty)");
      } else {
        const issuerVal = (cred?.issuer && (typeof cred.issuer === "string" ? cred.issuer : cred.issuer?.id)) || cred?.iss || null;
        if (!issuerVal) missing.push("issuer / iss");
        if (!cred.issuanceDate && !cred.iat) missing.push("issuanceDate / iat");
        // credentialSubject or sub, prefer credentialSubject.id
        const cs = cred.credentialSubject || cred.sub || null;
        if (!cs) missing.push("credentialSubject / sub");
        // proof/jwt/jws/signature
        if (!cred.proof && !cred.jwt && !cred.jws && !cred.signature) missing.push("proof / jwt / jws / signature");
      }
      const struct = { ok: missing.length === 0, missing };

      // ASSERTION detection
      const proof = cred?.proof || {};
      const assertion = { ok: false, details: {} };
      if (proof?.jwt || cred?.jwt) {
        assertion.ok = true;
        assertion.details = { type: proof?.type || "JwtProof2020", jwt: true };
      } else if (proof?.signature || proof?.signatureValue || proof?.jws || cred?.jws) {
        assertion.ok = true;
        assertion.details = { type: proof?.type || "LinkedDataSignature", jwt: false };
      } else {
        assertion.ok = false;
        assertion.details = { note: "No recognizable assertion/proof" };
      }

      // REQUIRED: issuer, issuanceDate, credentialSubject.id
      const issuerId = (cred?.issuer && (typeof cred.issuer === "string" ? cred.issuer : cred.issuer?.id)) || cred?.iss || null;
      const subjectId =
        (cred?.credentialSubject && (typeof cred.credentialSubject === "string" ? cred.credentialSubject : cred.credentialSubject?.id)) ||
        cred?.sub ||
        null;
      const required = {
        issuer: !!issuerId,
        issuanceDate: !!(cred?.issuanceDate || cred?.iat),
        credentialSubject: !!subjectId,
      };
      const requiredOk = required.issuer && required.issuanceDate && required.credentialSubject;

      // --------------------------
      // SIGNATURE verification (STAMP-ONLY POLICY)
      // --------------------------
      let signature = { checked: false, ok: false, details: {} };

      // Decode JWT payload for UI only (store per-credential)
      if (proof?.jwt || cred?.jwt) {
        const jwt = proof?.jwt || cred?.jwt;
        try {
          const parts = jwt.split(".");
          if (parts.length === 3) {
            const p = base64UrlDecode(parts[1]);
            const payload = JSON.parse(p);
            setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), decodedJwt: payload } }));
          }
        } catch (e) {
          // ignore decode errors for UI
        }
      }

      // stamp-first: check stamp object presence and required fields
      const stamp = proof?.stamp || cred?.proof?.stamp || null;
      const requiredStampFields = ["signature", "signerAddress", "stampedAt", "method"];
      if (stamp && typeof stamp === "object") {
        const missingStampFields = requiredStampFields.filter((f) => {
          // consider 0 a valid stampedAt, require non-null/undefined/empty for others
          if (!(f in stamp)) return true;
          const v = stamp[f];
          if (v === null || v === undefined) return true;
          if (f !== "stampedAt" && String(v).trim() === "") return true;
          return false;
        });

        if (missingStampFields.length === 0) {
          signature = {
            checked: true,
            ok: true,
            details: {
              note: "Stamp present with required fields — accepted under stamp-only policy.",
              stamp,
            },
          };
        } else {
          signature = {
            checked: true,
            ok: false,
            details: {
              error: "Stamp present but missing required stamp fields.",
              missingStampFields,
              stamp,
            },
          };
        }
      } else {
        signature = {
          checked: true,
          ok: false,
          details: {
            error: "No stamp present. Under stamp-only policy, signatures without stamp are not accepted.",
          },
        };
      }

      // EXPIRY
      let expiry = { ok: true, expired: false, details: null };
      try {
        const now = Date.now();
        if (cred?.expirationDate || cred?.expiresAt) {
          const expVal = cred.expirationDate || cred.expiresAt;
          const expTs = Date.parse(expVal) || Number(expVal) * 1000;
          if (expTs && now > expTs) expiry = { ok: false, expired: true, details: { expiresAt: expVal } };
          else expiry = { ok: true, expired: false, details: { expiresAt: expVal } };
        } else {
          const jwt = cred?.proof?.jwt || cred?.jwt || null;
          if (jwt) {
            try {
              const parts = jwt.split(".");
              if (parts.length === 3) {
                const payload = JSON.parse(base64UrlDecode(parts[1]));
                const exp = payload?.exp;
                if (exp) {
                  const expTs = Number(exp) * 1000;
                  if (Date.now() > expTs) expiry = { ok: false, expired: true, details: { exp } };
                  else expiry = { ok: true, expired: false, details: { exp } };
                } else expiry = { ok: true, expired: false, details: { note: "No exp in JWT" } };
              }
            } catch (e) {
              expiry = { ok: true, expired: false, details: { error: String(e) } };
            }
          } else expiry = { ok: true, expired: false, details: { note: "No expiry found" } };
        }
      } catch (e) {
        expiry = { ok: true, expired: false, details: { error: String(e) } };
      }

      const result = {
        structure: struct,
        assertion,
        required: { ok: requiredOk, details: required },
        signature,
        expiry,
        lastChecked: Date.now(),
        running: false,
      };

      if (mountedRef.current) setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), ...result } }));
      return result;
    } catch (err) {
      console.error("runChecksForCredential error", err);
      if (mountedRef.current) setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), error: String(err), running: false } }));
      return { error: String(err) };
    }
  };

  // verify selected with concurrency, update UI state
  const runBulkVerification = async () => {
    if (!selectedIds || selectedIds.size === 0) {
      alert("Select at least one credential to verify");
      return;
    }
    setVerifyingBulk(true);
    try {
      const sel = Array.from(selectedIds);
      const items = sel.map((uiId) => stored.find((c) => c.__uiId === uiId)).filter(Boolean);
      await runWithConcurrency(items, async (item) => {
        // ensure we fetch remote if needed
        await runChecksForCredential(item, { ensureResolved: true });
      }, BULK_CONCURRENCY);
    } finally {
      setVerifyingBulk(false);
    }
  };

  // verify all stored credentials
  const runVerifyAll = async () => {
    if (!stored || stored.length === 0) {
      alert("No stored credentials to verify");
      return;
    }
    setVerifyingBulk(true);
    try {
      await runWithConcurrency(stored, async (item) => {
        await runChecksForCredential(item, { ensureResolved: true });
      }, BULK_CONCURRENCY);
    } finally {
      setVerifyingBulk(false);
    }
  };

  const runSingleVerify = async (cred) => {
    // if credential hasn't been resolved fetch it first
    await runChecksForCredential(cred, { ensureResolved: true });
  };

  const loadRemoteForRow = async (item) => {
    const id = item.__uiId;
    setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), resolving: true, resolvingError: null } }));
    try {
      const resolved = await attemptResolveIpfsForItem(item);
      setStored((prev) => prev.map((it) => (it.__uiId === id ? resolved : it)));
    } catch (e) {
      setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), resolvingError: String(e) } }));
    } finally {
      setStatusMap((m) => ({ ...m, [id]: { ...(m[id] || {}), resolving: false } }));
    }
  };

  /* --------------------- UI helpers & render --------------------- */
  const Badge = ({ ok, label, small }) => {
    const base = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    if (ok === true) return <span className={`${base} bg-green-100 text-green-800`}>{label}</span>;
    if (ok === false) return <span className={`${base} bg-red-100 text-red-800`}>{label}</span>;
    return <span className={`${base} backdrop-blur-md border border-blue-200 text-gray-600`}>{label}</span>;
  };

  const ipfsGateway = (cid) => `https://ipfs.io/ipfs/${cid}`;

  const toggleExpandRow = (uiId) => {
    setExpandedRows((prev) => {
      const s = new Set(Array.from(prev));
      if (s.has(uiId)) s.delete(uiId);
      else s.add(uiId);
      return s;
    });
  };

  const CredentialRow = ({ cred }) => {
    const id = cred.__uiId;
    const s = statusMap[id] || {};
    const resolved = cred.credential || cred;
    const title = (resolved && (resolved.type?.[0] || resolved.type || "Verifiable Credential")) || cred.type?.[0] || cred.type || "Credential";
    const issuer = (resolved && (typeof resolved.issuer === "string" ? resolved.issuer : resolved?.issuer?.id || resolved?.iss)) || (typeof cred.issuer === "string" ? cred.issuer : cred?.issuer?.id || cred?.iss) || "n/a";
    const subject = (resolved && (typeof resolved.credentialSubject === "string" ? resolved.credentialSubject : resolved?.credentialSubject?.id || resolved?.sub)) || cred?.credentialSubject?.id || cred?.sub || "n/a";
    const issued = (resolved && (resolved.issuanceDate || resolved.iat)) || cred.issuanceDate || cred.iat || "n/a";
    const cidDisplay = cred._resolvedCid || cred.onchain?.mappingCID || cred.ipfsCID || cred.cid || cred.hash || (cred.metadata && (cred.metadata.ipfsHash || cred.metadata.cid)) || null;
    const loadedFrom = cred.credential ? (cred._resolvedCid ? `IPFS (${cred._resolvedCid})` : "embedded") : cred.onchain ? "on-chain" : "unknown";
    const isExpanded = expandedRows.has(id);

    return (
      <div className="p-3 border-b last:border-b-0 border-blue-200 flex items-start gap-3 mt-4">
        <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleSelect(id)} className="mt-1 m-8" />
        <div className="flex-1 min-w-0 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 items-center">
              <div className="flex gap-1 items-center">
                <Badge ok={s?.structure?.ok} label="Structure" />
                <Badge ok={s?.assertion?.ok} label="Assertion" />
                <Badge ok={s?.required?.ok} label="Required" />
                <Badge ok={s?.signature?.ok} label="Signature" />
                <Badge ok={s?.expiry?.ok && !s?.expiry?.expired} label={s?.expiry?.expired ? "Expired" : "Expiry"} />
              </div>

              {(s?.running || s?.resolving || verifyingBulk) ? <div className="text-xs italic text-gray-500">Checking...</div> : null}

              <button
                onClick={() => runSingleVerify(cred)}
                disabled={s?.running || s?.resolving || verifyingBulk}
                className="ml-2 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs disabled:opacity-60"
              >
                Verify
              </button>

              {!cred.credential && cidDisplay ? (
                <button
                  onClick={() => loadRemoteForRow(cred)}
                  className="ml-2 px-2 py-1 border border-blue-200 rounded-md text-xs text-blue-900 dark-text-yellow"
                  disabled={s?.resolving}
                >
                  Load more
                </button>
              ) : null}

              <button onClick={() => toggleExpandRow(id)} className="ml-2 px-2 py-1 border border-blue-200 rounded-md text-xs text-blue-900 dark-text-yellow">
                {isExpanded ? "Hide details" : "Details"}
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-500 mt-8 mb-8">
            <div className="justify-center flex items-center gap-2 mb-2 text-sm font-semibold text-blue-900 dark-text-yellow"><CreditCardIcon/>{title}</div>
            <div className="text-xs text-gray-600 truncate">Issuer: {issuer}</div>
            <div className="text-xs text-gray-600 truncate">Subject: {subject}</div>
            
            <span className="ml-2">Issued: {issued}</span>
            <span className="ml-2">Source: {loadedFrom}</span>
          </div>

          {/* show stamp & decoded jwt info when available */}
          {s?.signature?.details?.stamp || s?.signature?.details?.signerAddressFromStamp || s?.signature?.details?.signerRecovered ? (
            <div className="text-xs text-gray-600 mt-2">
              <div>Stamp signer: <code className="font-mono">{s.signature.details.stamp?.signerAddress || s.signature.details.signerAddressFromStamp || s.signature.details.signerRecovered}</code></div>
              {s.signature.details.stamp?.stampedAt ? <div>Stamped at: {new Date(Number(s.signature.details.stamp.stampedAt)).toLocaleString()}</div> : null}
            </div>
          ) : null}

          <div className="text-xs text-gray-400 mt-1 truncate flex gap-2 items-center">
            {resolved?.proof?.jwt ? <span className="italic">JWT present</span> : null}
            {cidDisplay ? (
              <a href={ipfsGateway(cidDisplay)} target="_blank" rel="noreferrer" className="text-xs underline">
                View IPFS JSON ({cidDisplay})
              </a>
            ) : null}
          </div>

          {/* details section */}
          {isExpanded ? (
            <div className="mt-2 bg-gray-200 darkcard p-2 rounded text-xs text-gray-700 dark-text-yellow border border-blue-200 rounded-2xl">
              <div className="justify-center flex items-center gap-2 font-bold mb-8 mt-4"><CreditCard/>Verification details</div>
              <div className="mb-2">
                <strong>Structure:</strong> {s?.structure?.ok ? "ok" : `missing: ${s?.structure?.missing?.join?.(", ") || "n/a"}`}
              </div>
              <div className="mb-2">
                <strong>Assertion:</strong> {s?.assertion?.ok ? JSON.stringify(s.assertion.details) : (s?.assertion?.details?.note || "n/a")}
              </div>
              <div className="mb-2">
                <strong>Required:</strong> {s?.required?.ok ? "ok" : JSON.stringify(s?.required?.details || {})}
              </div>
              <div className="mb-2">
                <strong>Signature:</strong> {s?.signature?.checked ? (s.signature.ok ? "ok" : "failed") : "not checked"}
                <pre className="mt-1 max-h-44 overflow-auto bg-gray-200 p-2 rounded text-xs">{JSON.stringify(s?.signature?.details || s?.signature || {}, null, 2)}</pre>
              </div>
              <div className="mb-2">
                <strong>Expiry:</strong> {s?.expiry?.ok && !s?.expiry?.expired ? "valid" : s?.expiry?.expired ? "expired" : JSON.stringify(s?.expiry?.details || {})}
              </div>
              <div className="mb-2">
                <strong>Last checked:</strong> {s?.lastChecked ? new Date(s.lastChecked).toLocaleString() : "never"}
              </div>
              <div>
                <strong>Credential JSON (snippet):</strong>
                <pre className="mt-1 max-h-44 overflow-auto p-2 rounded-2xl text-xs">{JSON.stringify(resolved, null, 2)}</pre>
              </div>
            </div>
          ) : null}

          {s?.error && <div className="text-xs text-red-600 mt-2">Error: {String(s.error)}</div>}
          {s?.resolvingError && <div className="text-xs text-red-600 mt-2">Resolve error: {String(s.resolvingError)}</div>}
        </div>
      </div>
    );
  };

  const tryDecodeJwt = (jwt) => {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      setDecodedJwtHeader(null);
      setDecodedJwtPayload(null);
      return false;
    }
    const h = base64UrlDecode(parts[0]);
    const p = base64UrlDecode(parts[1]);
    try {
      setDecodedJwtHeader(JSON.parse(h));
    } catch {
      setDecodedJwtHeader(h);
    }
    try {
      setDecodedJwtPayload(JSON.parse(p));
    } catch {
      setDecodedJwtPayload(p);
    }
    return true;
  };

  const handleLoadJson = () => {
    if (!jsonText) return alert("Paste credential JSON first");
    try {
      const obj = JSON.parse(jsonText);
      setParsed(obj);
      if (typeof obj === "string" || (obj.proof && obj.proof.jwt)) {
        const jwt = obj.proof?.jwt || (typeof obj === "string" ? obj : null);
        if (jwt) {
          setJwtInput(jwt);
          tryDecodeJwt(jwt);
        }
      }
      alert("JSON parsed successfully");
    } catch (err) {
      console.error("JSON parse error", err);
      alert("Invalid JSON");
    }
  };

  const handleVerifyClient = async () => {
    setVerificationResult(null);
    let vc = parsed;
    if (!vc && jwtInput) {
      try {
        const parts = jwtInput.split(".");
        const payload = JSON.parse(base64UrlDecode(parts[1]));
        vc = payload.vc || payload;
      } catch (e) { }
    }
    if (!vc) {
      alert("No VC JSON loaded to run client checks.");
      return;
    }
    const struct = (function validateStructure(vc) {
      const missing = [];
      if (!vc) missing.push("credential (empty)");
      else {
        const issuerVal = vc.issuer || (vc.issuer && vc.issuer.id) || vc.iss;
        if (!issuerVal) missing.push("issuer / iss");
        if (!vc.issuanceDate && !vc.iat) missing.push("issuanceDate / iat");
        if (!vc.credentialSubject && !vc.sub) missing.push("credentialSubject / sub");
        if (!vc.proof && !vc.jwt && !vc.jws) missing.push("proof / jwt / jws");
      }
      return { ok: missing.length === 0, missing };
    })(vc);
    const local = await (async (v) => {
      const temp = { __uiId: "tmp", credential: v };
      const res = await runChecksForCredential(temp);
      return res;
    })(vc);
    setVerificationResult({ client: true, structure: struct, local });
  };

  const handleVerifyFull = async () => {
    if (jwtInput) {
      tryDecodeJwt(jwtInput);
      const res = await verifyWithBackend(jwtInput);
      setVerificationResult(res);
      return;
    }
    if (parsed) {
      const res = await verifyWithBackend(parsed);
      setVerificationResult(res);
      return;
    }
    alert("No JWT or parsed VC to perform full verification.");
  };

  return (
    <div className="backdrop-blur-md rounded-2xl max-w-7xl mx-auto p-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h2 className="justify-center flex items-center gap-4 text-4xl font-bold text-blue-900 dark-text-yellow mb-4 text-center"><VerifiedIcon size={70} /> Ethereum Credential Verifier</h2>
        <div className="flex gap-2">
          <button onClick={() => onBack()} className="px-3 py-1 dark-card border border-200-blue rounded-full text-blue-900 dark-text-yellow">
            <StepBackIcon size={16} />
          </button>
        </div>
      </div>

      <div className="mb-20 text-xs text-emerald-700 mt-20">
        <div className="justify-center flex items-center gap-4 mb-4 font-bold text-md text-blue-900 dark-text-yellow">Wallet Details:</div>
        <div className="justify-center flex items-center gap-2 mb-4">
          <Wallet2Icon/><code className="font-mono">{walletAddress || "n/a"}</code>
        </div>
        <div className="justify-center flex items-center gap-2 mb-4">
          <IdCardIcon/>{walletDid && <span className="ml-3">{walletDid}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: paste/load area */}
        <div className="md:col-span-1">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-4 text-blue-900 dark-text-yellow">Paste VC JSON</label>
            <textarea
              rows={10}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full border border-blue-200 rounded-2xl p-2 font-mono text-sm text-gray-600 dark-text-yellow"
              placeholder="Paste a Verifiable Credential JSON here"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleLoadJson} className="px-3 py-2 bg-blue-900 hover:bg-blue-950 border border-blue-200 text-white rounded-3xl">Load JSON</button>
              <button onClick={() => { setJsonText(""); setParsed(null); setJwtInput(""); setDecodedJwtHeader(null); setDecodedJwtPayload(null); setVerificationResult(null); }} className="px-3 py-2 hover:bg-red-500 border border-red-500 rounded-3xl text-red-500 hover:text-gray-200">Clear</button>
            </div>
          </div>

          <div className="mb-4 mt-15">
            <label className="block text-sm font-medium mb-4 text-blue-900 dark-text-yellow">Or paste VC JWT (compact)</label>
            <input value={jwtInput} onChange={(e) => { setJwtInput(e.target.value); tryDecodeJwt(e.target.value); }} className="w-full border border-blue-200 rounded-2xl p-2 font-mono text-sm text-gray-600" placeholder="eyJ... . ... . ..." />
            <div className="mt-2 flex gap-2">
              <button onClick={handleVerifyClient} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl">Client checks</button>
              <button onClick={handleVerifyFull} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700text-white rounded-3xl">Full verify (backend)</button>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mt-10 mb-2 text-emerald-500">Verification result</h4>
            {verificationResult ? (
              <div className="p-3 border border-emerald-500 rounded-3xl bg-gray-100 darkcard overflow-auto">
                <pre className="text-xs text-gray-500">{JSON.stringify(verificationResult, null, 2)}</pre>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No verification performed yet.</div>
            )}
          </div>
        </div>

        {/* Middle: stored credentials list */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-blue-900 dark-text-yellow">Stored credentials</h4>
            <div className="flex gap-2">
              <button onClick={fetchStoredCredentials} disabled={fetchingList || verifyingBulk} className="px-3 py-1 text-blue-900 dark-text-yellow bg-blue-100 border border-blue-200 rounded-3xl">
                {fetchingList ? "Refreshing..." : "Refresh list"}
              </button>
              <button onClick={selectAll} className="px-3 py-1 text-blue-900 dark-text-yellow bg-blue-100 border border-blue-200 rounded-3xl">Select all</button>
              <button onClick={clearSelection} className="px-3 py-1 text-blue-900 dark-text-yellow bg-blue-100 border border-blue-200 rounded-3xl">Clear</button>
              <button onClick={runBulkVerification} disabled={verifyingBulk} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-3xl">
                {verifyingBulk ? "Verifying..." : "Verify selected"}
              </button>
              <button onClick={runVerifyAll} disabled={verifyingBulk} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-3xl">
                {verifyingBulk ? "Verifying..." : "Verify all"}
              </button>
            </div>
          </div>

          <div className="border border-blue-200 rounded-2xl shadow-sm max-h-[90vh] overflow-auto">
            {stored.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No stored credentials found.</div>
            ) : (
              stored.map((c) => <CredentialRow key={c.__uiId} cred={c} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
