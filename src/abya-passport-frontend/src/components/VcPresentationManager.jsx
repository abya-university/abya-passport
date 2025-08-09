// src/components/VcPresentationManager.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import QRCode from "qrcode";
import { fetchDidDocument } from "../services/ipfsService";
import { useEthr } from "../contexts/EthrContext";
import {
  RefreshCw,
  FileText,
  Copy,
  QrCode,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const API_BASE = "http://localhost:3000";

const VcPresentationManager = ({ onBack }) => {
  const { walletDid } = useEthr();

  // UI state
  const [loading, setLoading] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState([]); // raw objects returned by backend (may include onchain metadata)
  const [ipfsCredentials, setIpfsCredentials] = useState([]); // fetched IPFS JSONs (merged)
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [manualJwt, setManualJwt] = useState("");
  const [presentationJwt, setPresentationJwt] = useState("");
  const [presentations, setPresentations] = useState([]);
  const [presentLoading, setPresentLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [listLoading, setListLoading] = useState(false);

  // helper: copy
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

  // fetch credentials from backend and filter by DID
  const fetchCredentials = async () => {
    setCredsLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];
      // Filter heuristics: credentialSubject.id, subjectDid, issuer/subject fields or onchain.usedVariant
      const filtered = creds.filter((c) => {
        if (!walletDid) return true; // if no DID available, return all to allow selection
        const subj =
          c?.credentialSubject?.id ||
          c?.subjectDid ||
          c?.subject ||
          c?.credentialSubject?.sub ||
          (c?.onchain?.usedVariant ?? null) ||
          null;
        if (!subj) return false;
        // match full DID or address substring
        if (subj === walletDid) return true;
        if (typeof subj === "string" && walletDid.includes(subj)) return true;
        if (typeof subj === "string" && subj.includes(walletDid)) return true;
        return false;
      });
      setCredentials(filtered);
    } catch (err) {
      console.error("fetch credentials error", err);
      setError("Failed to fetch credentials");
    } finally {
      setCredsLoading(false);
    }
  };

  // from credentials array extract mappingCIDs we can fetch from IPFS (de-duplicate)
  const extractCids = (creds) => {
    const cids = new Set();
    creds.forEach((c) => {
      // common places to find mappingCID: c.onchain.mappingCID, c.mappingCID
      const m = c?.onchain?.mappingCID || c?.mappingCID || c?.cid || null;
      if (m) cids.add(m);
      // also if the backend returned a stored ipfs link in other fields
      if (c?.id && typeof c.id === "string" && c.id.length > 40 && c.id.startsWith("Qm")) cids.add(c.id);
    });
    return Array.from(cids);
  };

  // fetch IPFS JSON docs for each CID
  const fetchIpfsDocsForCids = async (cids) => {
    const out = [];
    for (const cid of cids) {
      try {
        const doc = await fetchDidDocument(cid);
        out.push({ cid, doc, error: null });
      } catch (err) {
        console.warn("fetchDidDocument failed for", cid, err);
        // fallback: try public gateway
        try {
          const resp = await fetch(`https://dweb.link/ipfs/${cid}`);
          if (resp.ok) {
            const json = await resp.json();
            out.push({ cid, doc: json, error: null });
            continue;
          }
        } catch (gerr) {
          // ignore
        }
        out.push({ cid, doc: null, error: err?.message ?? String(err) });
      }
    }
    return out;
  };

  // high-level loader: fetch creds and IPFS docs matching walletDid
  const loadAll = async () => {
    setLoading(true);
    try {
      await fetchCredentials();
    } finally {
      setLoading(false);
    }
  };

  // fetch presentations list
  const fetchPresentations = async () => {
    setListLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/presentation/list`);
      const list = res.data?.presentations ?? res.data ?? [];
      setPresentations(list);
    } catch (err) {
      console.error("fetch presentations error", err);
    } finally {
      setListLoading(false);
    }
  };

  // when credentials change, fetch IPFS docs for their mappingCIDs
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!credentials || credentials.length === 0) {
        setIpfsCredentials([]);
        return;
      }
      setCredsLoading(true);
      const cids = extractCids(credentials);
      if (cids.length === 0) {
        // if no CIDs present, attempt to include backend-returned credential objects as-is
        const fallback = credentials.map((c, i) => ({ cid: null, doc: c, error: null }));
        if (mounted) setIpfsCredentials(fallback);
        setCredsLoading(false);
        return;
      }
      const docs = await fetchIpfsDocsForCids(cids);
      // Map docs back to credentials (try to merge)
      const merged = [];
      // For each credential try to locate matching IPFS doc by mappingCID
      for (const c of credentials) {
        const mappingCID = c?.onchain?.mappingCID || c?.mappingCID || c?.cid || null;
        if (mappingCID) {
          const match = docs.find((d) => d.cid === mappingCID);
          if (match && match.doc) {
            merged.push({ original: c, cid: mappingCID, doc: match.doc, ipfsError: match.error || null });
            continue;
          }
        }
        // if no mappingCID or not found, if credential itself looks like a doc use it
        merged.push({ original: c, cid: null, doc: c, ipfsError: null });
      }
      if (mounted) setIpfsCredentials(merged);
      setCredsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [credentials]);

  // initial load
  useEffect(() => {
    loadAll();
    fetchPresentations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid]);

  // Build a list of selectable credential labels
  const credentialOptions = useMemo(() => {
    return ipfsCredentials.map((c, i) => {
      const doc = c.doc || {};
      const name =
        doc?.credentialSubject?.name ||
        doc?.name ||
        doc?.credentialSubject?.fullName ||
        doc?.title ||
        (c.cid ? `IPFS ${c.cid}` : `Credential ${i + 1}`);
      const subject = doc?.credentialSubject?.id || doc?.subject || "—";
      return {
        label: `${name} — ${subject}`,
        idx: i,
      };
    });
  }, [ipfsCredentials]);

  // create presentation
  const handleCreatePresentation = async () => {
    setPresentLoading(true);
    setError("");
    setPresentationJwt("");
    try {
      // prefer manual JWT if provided
      if (manualJwt && manualJwt.trim().length > 0) {
        const body = { credentialJwt: manualJwt.trim() };
        const res = await axios.post(`${API_BASE}/presentation/create`, body);
        const vp = res.data?.presentation ?? res.data;
        setPresentationJwt(vp?.jwt ?? vp);
        await fetchPresentations();
        return;
      }

      // otherwise use selected ipfs credential
      if (selectedIdx === null) {
        alert("Select a credential or paste a JWT to create a presentation.");
        setPresentLoading(false);
        return;
      }

      const sel = ipfsCredentials[selectedIdx];
      if (!sel) {
        alert("Selected credential not found");
        setPresentLoading(false);
        return;
      }

      // determine payload: if doc contains a compact JWT in proof.jwt use that, otherwise send the full credential doc
      const compactJwt = sel.doc?.proof?.jwt || sel.doc?.jwt || null;
      let body;
      if (compactJwt) {
        body = { credentialJwt: compactJwt };
      } else {
        // send raw credential JSON so backend can mint/prepare presentation server-side
        body = { credential: sel.doc, mappingCID: sel.cid ?? null };
      }

      const res = await axios.post(`${API_BASE}/presentation/create`, body);
      const vp = res.data?.presentation ?? res.data;
      if (vp?.jwt) {
        setPresentationJwt(vp.jwt);
      } else if (typeof vp === "string") {
        setPresentationJwt(vp);
      } else {
        // try to pretty-print returned object
        setPresentationJwt(JSON.stringify(vp, null, 2));
      }

      await fetchPresentations();
    } catch (err) {
      console.error("create presentation error", err);
      setError(err?.response?.data?.error || err?.message || "Failed to create presentation");
    } finally {
      setPresentLoading(false);
    }
  };

  // verify presentation
  const handleVerifyPresentation = async (jwtToVerifyParam = null) => {
    setVerifyResult(null);
    setError("");
    const jwt = jwtToVerifyParam ?? presentationJwt;
    if (!jwt || jwt.length === 0) {
      return alert("Provide a presentation JWT (either created here or pasted)");
    }
    try {
      const res = await axios.post(`${API_BASE}/presentation/verify`, { presentation: jwt });
      const ver = res.data?.verification ?? res.data;
      setVerifyResult(ver);
    } catch (err) {
      console.error("verify presentation error", err);
      setVerifyResult({ verified: false, error: err?.response?.data?.error || err?.message || "Verification failed" });
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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Verifiable Presentation Manager</h2>
          <p className="text-sm text-slate-500 mt-1">Create, verify and manage verifiable presentations derived from your credentials.</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onBack?.()} className="text-sm bg-slate-100 px-3 py-1 rounded hover:bg-slate-200">Back</button>
          <button onClick={() => { fetchCredentials(); fetchPresentations(); }} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded hover:bg-slate-200">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* Credentials picker & IPFS preview */}
      <section className="bg-white border border-slate-100 rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Available credentials (from IPFS)</h3>
          <div className="text-xs text-slate-500">{ipfsCredentials.length} items</div>
        </div>

        {credsLoading ? (
          <div className="text-sm text-slate-500">Loading credentials…</div>
        ) : ipfsCredentials.length === 0 ? (
          <div className="text-sm text-slate-500">No credentials found for this DID.</div>
        ) : (
          <div className="grid gap-3">
            {ipfsCredentials.map((c, i) => {
              const doc = c.doc || {};
              const title = doc?.credentialSubject?.name || doc?.name || `Credential ${i + 1}`;
              const subject = doc?.credentialSubject?.id || doc?.subject || "—";
              const hasJwt = !!(doc?.proof?.jwt || doc?.jwt);
              return (
                <div key={i} className={`p-3 border rounded flex items-start justify-between ${selectedIdx === i ? "ring-2 ring-blue-200" : ""}`}>
                  <div className="flex-1 pr-3">
                    <div className="text-sm font-medium text-slate-800 truncate">{title}</div>
                    <div className="text-xs text-slate-500 mt-1">Subject: <code className="font-mono text-xs bg-slate-50 px-1 rounded">{subject}</code></div>
                    <div className="text-xs text-slate-500 mt-1">CID: {c.cid ?? "—"}</div>
                    {c.ipfsError && <div className="text-xs text-red-600 mt-1">IPFS error: {c.ipfsError}</div>}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedIdx(i); }} className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200">Select</button>
                      <button onClick={() => handleCopyCredentialJwt(i)} className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200" title="Copy credential JWT (if present)"><Copy size={12} /></button>
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
            <QrCode size={14} /> {presentLoading ? "Creating..." : "Create Presentation"}
          </button>

          <button onClick={() => { setPresentationJwt(""); setVerifyResult(null); }} className="bg-slate-100 px-3 py-2 rounded">Clear</button>
        </div>

        {presentationJwt && (
          <div className="mt-3 p-3 bg-slate-50 rounded border">
            <div className="flex items-start justify-between">
              <div className="text-sm font-medium">Presentation (JWT)</div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyToClipboard(presentationJwt, "Presentation JWT")} className="px-2 py-1 rounded bg-slate-100 text-xs">Copy</button>
                <button onClick={() => generateQr(presentationJwt)} className="px-2 py-1 rounded bg-slate-100 text-xs"><QrCode size={12} /></button>
                <button onClick={() => handleVerifyPresentation(presentationJwt)} className="px-2 py-1 rounded bg-indigo-600 text-white text-xs"><CheckCircle size={12} /> Verify</button>
              </div>
            </div>

            <pre className="text-xs mt-2 whitespace-pre-wrap max-h-40 overflow-auto bg-white p-2 rounded">{presentationJwt}</pre>
          </div>
        )}

        {/* QR display */}
        {qrDataUrl && (
          <div className="mt-3 flex items-center gap-4">
            <img src={qrDataUrl} alt="QR" className="w-36 h-36" />
            <div className="text-sm text-slate-600">Scan to import the presentation JWT.</div>
          </div>
        )}

        {/* Verification result */}
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

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
};

export default VcPresentationManager;
