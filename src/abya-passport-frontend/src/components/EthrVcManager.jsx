// src/components/EthrVcManager.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import * as ethers from "ethers";
import { storeStudentProfile } from "../services/ipfsService"; // adjust to ../services/ipfsService if needed

const API_BASE = "http://localhost:3000";
const VC_ADDRESS = import.meta.env.VITE_VC_CONTRACT_ADDRESS || "0xE2ff8118Bc145F03410F46728BaE0bF3f1C6EF81";

// Minimal ABI used by frontend
const VC_ABI = [
  "function issueCredential(string studentDID,string credentialType,string metadata,string credentialHash,string signature,string mappingCID)",
  "function getCredentialsForStudent(string studentDID) view returns (uint256[])",
  "function credentialCount() view returns (uint256)",
  // public mapping getter: credentials(uint256) returns the struct components
  "function credentials(uint256) view returns (uint256,string,string,string,uint256,string,string,string,string,bool)"
];

const EthrVcManager = () => {
  const [formData, setFormData] = useState({
    issuerDid: "",
    subjectDid: "",
    name: "",
    role: "",
    organization: "",
    expirationDate: "",
  });

  const [credential, setCredential] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [jwtToVerify, setJwtToVerify] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [ipfsToken, setIpfsToken] = useState("");
  const [ipfsStatus, setIpfsStatus] = useState({}); // store cid / errors per idx
  const [chainStatus, setChainStatus] = useState({}); // store on-chain tx status per idx or id

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const toISO = (datetimeLocal) => {
    if (!datetimeLocal) return undefined;
    return new Date(datetimeLocal).toISOString();
  };

  // ----------------- Ethereum helper -----------------
  const getContractWithSigner = async () => {
    if (!window.ethereum) throw new Error("No Web3 provider found (MetaMask)");
    // Prefer Web3Provider (ethers v5/v6 compatibility)
    let provider;
    if (ethers.providers && ethers.providers.Web3Provider) {
      provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send?.("eth_requestAccounts", []);
      const signer = provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }
    // v6 BrowserProvider fallback
    if (ethers.BrowserProvider) {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send?.("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
    }
    // last resort - try direct Web3Provider
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send?.("eth_requestAccounts", []);
    const signer = provider.getSigner();
    return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
  };

  const getContractReadonly = async () => {
    if (!window.ethereum) throw new Error("No Web3 provider found (MetaMask)");
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send?.("eth_requestAccounts", []);
    return new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
  };

  const computeCredentialHash = (cred) => {
    if (!cred) return "";
    // deterministic-ish hash of the credential JSON (top-level keys sorted)
    const sortedKeys = Object.keys(cred).sort();
    const json = JSON.stringify(cred, sortedKeys, 2);
    // Try ethers v6 top-level functions first
    if (typeof ethers.keccak256 === "function" && typeof ethers.toUtf8Bytes === "function") {
      return ethers.keccak256(ethers.toUtf8Bytes(json));
    }
    // Fallback to v5 style utils
    if (ethers.utils && typeof ethers.utils.keccak256 === "function") {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json));
    }
    throw new Error("keccak256/toUtf8Bytes not available on ethers; check your ethers version/imports");
  };

  // ---------------- Create VC ----------------
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
        ...(formData.expirationDate && {
          expirationDate: toISO(formData.expirationDate),
        }),
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
      console.error(err);
      setError(err?.response?.data?.error || err?.message || "Failed to create credential");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Publish credential JSON to IPFS (via ipfsService) and optionally store mapping on-chain ----------------
  const publishCredentialToIpfsAndStoreOnChain = async (cred, idx = null) => {
    try {
      const statusKey = idx ?? "latest";
      setIpfsStatus((s) => ({ ...s, [statusKey]: { uploading: true } }));
      // Use ipfsService.storeStudentProfile(did, profileData) — this pins credential JSON and returns CID
      const subjectDid = cred?.credentialSubject?.id || cred?.subject || cred?.subjectDid || "";
      const profileData = { ...cred };

      // storeStudentProfile expects (did, profileData)
      const cid = await storeStudentProfile(subjectDid, profileData);
      setIpfsStatus((s) => ({ ...s, [statusKey]: { cid, uploading: false } }));

      // compute credential hash and signature (if available)
      let credentialHash = "";
      try {
        credentialHash = computeCredentialHash(cred);
      } catch (hashErr) {
        console.warn("Hashing credential failed:", hashErr);
        credentialHash = "";
      }
      const signature = cred?.proof?.jwt || cred?.proof?.signature || "";

      // store on-chain
      try {
        setChainStatus((s) => ({ ...s, [statusKey]: { sending: true } }));
        const contract = await getContractWithSigner();
        const credentialType = Array.isArray(cred?.type) ? cred.type[0] : cred?.type || "VerifiableCredential";
        const metadata = JSON.stringify(cred?.credentialSubject || {});

        const tx = await contract.issueCredential(
          subjectDid,
          credentialType,
          metadata,
          credentialHash,
          signature,
          cid
        );

        setChainStatus((s) => ({ ...s, [statusKey]: { sending: true, txHash: tx.hash } }));
        await tx.wait();
        setChainStatus((s) => ({ ...s, [statusKey]: { success: true, txHash: tx.hash } }));
      } catch (chainErr) {
        console.error("On-chain error:", chainErr);
        setChainStatus((s) => ({ ...s, [statusKey]: { error: chainErr?.message || String(chainErr) } }));
      }

      // refresh list to pick up any changes (and fetch mappingCID from chain)
      await fetchCredentials();
    } catch (err) {
      console.error("IPFS/store error:", err);
      setIpfsStatus((s) => ({ ...s, [idx ?? "latest"]: { error: err?.message || String(err), uploading: false } }));
      alert("IPFS upload / store failed: " + (err.message || "unknown"));
    }
  };

  // ---------------- Read on-chain credentials (fallback) ----------------
  const fetchOnChainCredentials = async () => {
    try {
      const readContract = await getContractReadonly();
      let count = await readContract.credentialCount();
      // handle BigNumber
      const n = (count && count.toNumber) ? count.toNumber() : Number(count || 0);
      const onchain = [];
      for (let i = 1; i <= n; i++) {
        try {
          const row = await readContract.credentials(i);
          // row fields: id, studentDID, issuerDID, credentialType, issueDate, metadata, credentialHash, signature, mappingCID, valid
          const id = row[0]?.toString?.() ?? String(i);
          const studentDID = row[1] ?? "";
          const issuerDID = row[2] ?? "";
          const credentialType = row[3] ?? "";
          const issueDate = row[4] ? (row[4].toNumber ? new Date(row[4].toNumber() * 1000).toISOString() : new Date(Number(row[4]) * 1000).toISOString()) : undefined;
          let metadata = row[5] ?? "";
          // try parse metadata if it was a JSON string
          try {
            metadata = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          } catch (e) {
            // leave as string if parse fails
          }
          const credentialHash = row[6] ?? "";
          const signature = row[7] ?? "";
          const mappingCID = row[8] ?? "";
          const valid = !!row[9];

          const credObj = {
            issuer: { id: issuerDID },
            credentialSubject: (metadata && typeof metadata === "object" && Object.keys(metadata).length > 0) ? metadata : { id: studentDID },
            issuanceDate: issueDate,
            onchain: { id, studentDID, mappingCID, credentialHash, signature, valid, credentialType },
          };
          onchain.push(credObj);
        } catch (inner) {
          // skip failed read for that index
          console.warn("Failed to read on-chain credential id", i, inner);
        }
      }
      return onchain;
    } catch (err) {
      console.warn("Error reading on-chain credentials:", err);
      return [];
    }
  };

  // ---------------- List credentials ----------------
  const fetchCredentials = async () => {
    setListLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];

      // If backend returned nothing, try on-chain
      if (!creds || creds.length === 0) {
        const onchainCreds = await fetchOnChainCredentials();
        setCredentials(onchainCreds);
        setListLoading(false);
        return;
      }

      // Try to enrich each credential with on-chain mappingCID if possible
      let enriched = creds;
      if (window.ethereum) {
        try {
          const readContract = await getContractReadonly();
          enriched = await Promise.all(
            creds.map(async (c) => {
              try {
                const subjectDid = c?.credentialSubject?.id || c?.subject || c?.subjectDid;
                if (!subjectDid) return c;

                // get onchain ids for this student DID
                const ids = await readContract.getCredentialsForStudent(subjectDid);
                const credentialHash = computeCredentialHash(c);
                for (let id of ids) {
                  const onchain = await readContract.credentials(id);
                  const onchainHash = onchain[6];
                  // match by hash if available, else just attach first
                  if (!credentialHash || onchainHash === credentialHash) {
                    const mappingCID = onchain[8];
                    return { ...c, onchain: { id: id.toString(), mappingCID, valid: onchain[9] } };
                  }
                }
                return c;
              } catch (innerErr) {
                return c;
              }
            })
          );
        } catch (readErr) {
          console.warn("Could not read chain data:", readErr);
        }
      }

      // deduplicate on mappingCID if both sources overlap
      const seen = new Set();
      const merged = [];
      for (const c of enriched) {
        const key = c?.onchain?.mappingCID ?? JSON.stringify(c?.credentialSubject ?? {});
        if (!seen.has(key)) {
          merged.push(c);
          seen.add(key);
        }
      }

      setCredentials(merged);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || err?.message || "Failed to fetch credentials");
    } finally {
      setListLoading(false);
    }
  };

  // ---------------- QR generation ----------------
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

  // ---------------- Copy / Download helpers ----------------
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
              required
            />
          </div>
        ))}

        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? "Creating..." : "Create Credential"}
          </button>

          <button type="button" onClick={fetchCredentials} className="bg-gray-200 px-4 py-2 rounded">
            {listLoading ? "Refreshing..." : "Refresh list"}
          </button>

          <button type="button" onClick={async () => {
            setListLoading(true);
            const onchainOnly = await fetchOnChainCredentials();
            setCredentials(onchainOnly);
            setListLoading(false);
          }} className="bg-indigo-600 text-white px-4 py-2 rounded">
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

          <div className="flex gap-2 mt-3">
            <button onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), "Credential JSON")} className="bg-green-600 text-white px-3 py-1 rounded">Copy JSON</button>
            <button onClick={() => credential?.proof?.jwt && copyToClipboard(credential.proof.jwt, "JWT")} className="bg-gray-600 text-white px-3 py-1 rounded">Copy JWT</button>
            <button onClick={() => credential?.proof?.jwt && generateQr(credential.proof.jwt)} className="bg-indigo-600 text-white px-3 py-1 rounded">QR (JWT)</button>
            <button onClick={() => downloadJSON(credential)} className="bg-yellow-600 text-white px-3 py-1 rounded">Download JSON</button>
            <button onClick={() => downloadPDF(credential)} className="bg-purple-600 text-white px-3 py-1 rounded">Download PDF</button>
            <button onClick={() => { if (credential?.proof?.jwt) setJwtToVerify(credential.proof.jwt); else alert('No JWT present'); }} className="bg-slate-700 text-white px-3 py-1 rounded">Use JWT for Verify</button>

            <button
              onClick={() => publishCredentialToIpfsAndStoreOnChain(credential, "latest")}
              className="bg-emerald-700 text-white px-3 py-1 rounded"
            >
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
        {!listLoading && credentials.length === 0 && <div className="text-sm text-gray-500">No credentials found.</div>}

        <div className="space-y-3 mt-2">
          {credentials.map((cred, i) => {
            const jwt = cred?.proof?.jwt || cred?.jwt || (typeof cred === "string" ? cred : null);
            return (
              <div key={i} className="p-3 border rounded flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm"><strong>Subject:</strong> {cred?.credentialSubject?.id ?? cred?.subject ?? "N/A"}</div>
                  <div className="text-sm"><strong>Name:</strong> {cred?.credentialSubject?.name ?? "N/A"}</div>
                  <div className="text-sm"><strong>Issuer:</strong> {cred?.issuer?.id ?? "N/A"}</div>
                  <div className="text-xs text-gray-500 mt-1">{cred?.issuanceDate ? `Issued: ${cred.issuanceDate}` : ""}</div>

                  {cred?.onchain?.mappingCID && (
                    <div className="text-xs mt-1">
                      On-chain CID: <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${cred.onchain.mappingCID}`} className="underline">{cred.onchain.mappingCID}</a>
                      {cred.onchain?.id && <span className="ml-2">(id #{cred.onchain.id})</span>}
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 flex gap-2 items-center">
                  <button onClick={() => downloadJSON(cred)} className="bg-yellow-600 text-white px-3 py-1 rounded">JSON</button>
                  <button onClick={() => downloadPDF(cred)} className="bg-purple-600 text-white px-3 py-1 rounded">PDF</button>

                  <button onClick={() => jwt ? copyToClipboard(jwt, "JWT") : alert("No JWT for this credential")} className="bg-gray-600 text-white px-3 py-1 rounded">Copy JWT</button>

                  <button onClick={() => jwt ? generateQr(jwt) : alert("No JWT to generate QR")} className="bg-indigo-600 text-white px-3 py-1 rounded">QR</button>

                  {/* Small Publish to IPFS controls */}
                  <div>
                    <input
                      placeholder="web3.storage token (optional)"
                      value={ipfsToken}
                      onChange={(e) => setIpfsToken(e.target.value)}
                      className="border px-2 py-1 rounded text-xs"
                      style={{ width: 240 }}
                    />
                    <div className="flex gap-1 mt-1 items-center">
                      <button onClick={() => publishCredentialToIpfsAndStoreOnChain(cred, i)} className="bg-green-600 text-white px-3 py-1 rounded text-xs">
                        {ipfsStatus[i]?.uploading ? "Uploading..." : chainStatus[i]?.sending ? "Storing..." : "Publish IPFS & Store On-chain"}
                      </button>

                      {ipfsStatus[i]?.cid && (
                        <a target="_blank" rel="noreferrer" href={`https://dweb.link/ipfs/${ipfsStatus[i].cid}`} className="text-xs underline ml-1">View ({ipfsStatus[i].cid})</a>
                      )}
                      {ipfsStatus[i]?.error && <div className="text-xs text-red-600">{ipfsStatus[i].error}</div>}
                      {chainStatus[i]?.txHash && <div className="text-xs ml-2">Tx: <a className="underline" target="_blank" rel="noreferrer" href={`https://etherscan.io/tx/${chainStatus[i].txHash}`}>{chainStatus[i].txHash}</a></div>}
                      {chainStatus[i]?.error && <div className="text-xs text-red-600 ml-2">{chainStatus[i].error}</div>}
                    </div>
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
