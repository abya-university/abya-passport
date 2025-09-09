// src/components/VCVerifierEthr.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import * as ethers from "ethers";
import { useEthr } from "../contexts/EthrContext";
import { useEthersSigner } from "./useClientSigner";
import { StepBackIcon } from "lucide-react";

const API_BASE = "http://localhost:3000";

const base64UrlDecode = (str) => {
  if (!str) return null;
  // Replace URL-safe chars
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad with '='
  while (str.length % 4) str += "=";
  try {
    const decoded = atob(str);
    // Convert to string (utf-8)
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(decoded, (c) => {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch {
      return decoded;
    }
  } catch (e) {
    return null;
  }
};

const computeCredentialHash = (cred) => {
  if (!cred) return "";
  // stable stringify: sort keys
  const replacer = (k, v) => (v === undefined ? null : v);
  const sorted = (obj) => {
    if (Array.isArray(obj)) return obj.map(sorted);
    if (obj && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = sorted(obj[key]);
          return acc;
        }, {});
    }
    return obj;
  };
  const json = JSON.stringify(sorted(cred), replacer);
  try {
    if (ethers && typeof ethers.keccak256 === "function" && typeof ethers.toUtf8Bytes === "function") {
      return ethers.keccak256(ethers.toUtf8Bytes(json));
    }
    if (ethers?.utils && typeof ethers.utils.keccak256 === "function") {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json));
    }
  } catch (e) {
    // ignore
  }
  // fallback naive hash
  let h = 0;
  for (let i = 0; i < json.length; i++) h = (h << 5) - h + json.charCodeAt(i);
  return "0x" + (h >>> 0).toString(16);
};

export default function VCVerifierEthr({ onBack = () => {} }) {
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

  useEffect(() => {
    (async () => {
      try {
        const s = await signerPromise;
        if (!s) return;
        try {
          const addr = await s.getAddress();
          setSignerAddr(addr);
        } catch (_) {}
      } catch (_) {}
    })();
  }, [signerPromise]);

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
        // if it's a JWT string in the body
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

  const validateStructure = (vc) => {
    const missing = [];
    if (!vc) {
      missing.push("credential (empty)");
    } else {
      // Many VCs have either `issuer` as string or object with id
      const issuerVal = vc.issuer || (vc.issuer && vc.issuer.id) || (vc.issuer && vc.issuer.address);
      if (!issuerVal && !vc.iss) missing.push("issuer / iss");
      if (!vc.issuanceDate && !vc.iat) missing.push("issuanceDate / iat");
      if (!vc.credentialSubject && !vc.sub) missing.push("credentialSubject / sub");
      // proof or proof.jwt
      if (!vc.proof && !vc.proof?.jwt && !vc.jwt && !vc.proof?.signatureValue && !vc.proof?.jws)
        missing.push("proof / proof.jwt / proof.signatureValue");
    }
    return { ok: missing.length === 0, missing };
  };

  const extractIssuerAddress = (issuer) => {
    if (!issuer) return null;
    if (typeof issuer === "string") {
      const m = issuer.match(/0x[0-9a-fA-F]{40}/);
      if (m) return ethers.utils.getAddress(m[0]);
      // if it's did:ethr:...:0x... etc
      const mm = issuer.match(/0x[0-9a-fA-F]{40}/);
      if (mm) return ethers.utils.getAddress(mm[0]);
      // maybe it's a full did with no address
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

  // Try a local signature verification using common shapes:
  // - If proof.signatureValue (hex) exists and issuer contains 0x address:
  //    - compute candidate message (credential JSON or credentialHash) and attempt recover via:
  //      - ethers.recoverAddress(keccak256(json), signature)
  //      - ethers.verifyMessage(JSONstring, signature) (prefixed)
  const verifySignatureLocal = async (vc) => {
    const out = { ok: false, checks: [], recovered: null, details: {} };
    if (!vc) {
      out.details.error = "No credential provided";
      return out;
    }

    // prefer proof.signatureValue or proof.jws or proof.signature
    const proof = vc.proof || {};
    const signatureHex =
      proof.signatureValue || proof.signature || proof.proofValue || proof.jws || proof.signatureValueHex || null;

    // credential JWT often lives in proof.jwt
    const jwt = proof.jwt || vc.jwt || null;

    const issuerRaw = vc.issuer || vc.iss || (vc.issuer && vc.issuer.id) || null;
    const issuerAddress = extractIssuerAddress(issuerRaw);

    out.details.issuerRaw = issuerRaw;
    out.details.issuerAddress = issuerAddress;

    // If we have a JWT compact string, prefer server verification (but decode payload locally)
    if (jwt && typeof jwt === "string") {
      out.checks.push({
        kind: "jwt_detected",
        note: "JWT detected; client can decode header/payload but will call backend for cryptographic verification.",
      });
      out.ok = false;
      out.details.jwt = { header: decodedJwtHeader, payload: decodedJwtPayload };
      return out;
    }

    if (!signatureHex) {
      out.details.error = "No signature found in VC.proof";
      return out;
    }

    if (!issuerAddress) {
      out.details.error = "No issuer address or DID with address found to verify against";
      return out;
    }

    // canonical message: stringified credential (best-effort)
    let json = null;
    try {
      json = JSON.stringify(vc);
    } catch (e) {
      json = String(vc);
    }

    // compute keccak256 hash of JSON
    let plainHash = null;
    try {
      plainHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json));
    } catch (e) {
      plainHash = null;
    }

    // prepare signature (must be hex)
    let sig = signatureHex;
    if (typeof sig === "object" && sig._hex) sig = sig._hex;
    if (typeof sig !== "string") sig = String(sig);

    // Try 1: recover from plain keccak256 digest (signed as raw hash)
    try {
      if (plainHash) {
        try {
          const recovered = ethers.recoverAddress(plainHash, sig);
          out.checks.push({ method: "recover_plain_keccak", recovered });
          if (recovered && issuerAddress && recovered.toLowerCase() === issuerAddress.toLowerCase()) {
            out.ok = true;
            out.recovered = recovered;
            out.details.matchMethod = "recover_plain_keccak";
            return out;
          }
        } catch (e) {
          out.checks.push({ method: "recover_plain_keccak", error: String(e) });
        }
      }
    } catch (_) {}

    // Try 2: recover from prefixed 'eth_sign' message (verifyMessage)
    try {
      // ethers.verifyMessage uses string message and signature (adds prefix internally)
      const recovered2 = ethers.verifyMessage(json, sig);
      out.checks.push({ method: "verifyMessage_prefixed", recovered: recovered2 });
      if (recovered2 && issuerAddress && recovered2.toLowerCase() === issuerAddress.toLowerCase()) {
        out.ok = true;
        out.recovered = recovered2;
        out.details.matchMethod = "verifyMessage_prefixed";
        return out;
      }
    } catch (e) {
      out.checks.push({ method: "verifyMessage_prefixed", error: String(e) });
    }

    // Try 3: if signature is a JWS (r,s) DER then cannot easily recover here — advise backend
    out.details.hint =
      "Local verification attempts failed. If the credential uses JWS (compact) or DER ECDSA signature, call backend verifier which has richer support.";
    return out;
  };

  const verifyWithBackend = async (payload) => {
    setLoading(true);
    setVerificationResult(null);
    try {
      const body =
        typeof payload === "string"
          ? { credential: payload }
          : { credential: payload };
      const res = await axios.post(`${API_BASE}/credential/verify`, body);
      const ver = res.data?.verification ?? res.data;
      setVerificationResult({ backend: true, result: ver });
      return ver;
    } catch (err) {
      console.error("Backend verify error", err);
      const errMsg = err?.response?.data || err?.message || String(err);
      setVerificationResult({ backend: true, error: errMsg });
      return { verified: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyClient = async () => {
    setVerificationResult(null);
    let vc = parsed;
    // if no parsed, but jwtInput present, decode payload into object if possible
    if (!vc && jwtInput) {
      try {
        const parts = jwtInput.split(".");
        const payload = JSON.parse(base64UrlDecode(parts[1]));
        vc = payload.vc || payload; // many JWTs put VC under 'vc'
      } catch (e) {
        // cannot decode fully
      }
    }
    if (!vc) {
      alert("No VC JSON loaded to run client checks. Paste JSON or load a credential first.");
      return;
    }

    const struct = validateStructure(vc);
    const local = await verifySignatureLocal(vc);
    setVerificationResult({ client: true, structure: struct, local });
  };

  const handleVerifyFull = async () => {
    // if JWT present, prioritise sending JWT for full verify
    if (jwtInput) {
      tryDecodeJwt(jwtInput);
      await verifyWithBackend(jwtInput);
      return;
    }
    if (parsed) {
      await verifyWithBackend(parsed);
      return;
    }
    alert("No JWT or parsed VC to perform full verification. Paste or load a credential.");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 py-16 backdrop-blur-md border border-blue-200 rounded-3xl darkcard">
      <div className="flex items-center justify-between mb-20">
        <h2 className="text-5xl font-bold text-blue-900 dark-text-yellow mb-4 text-center">Ethereum Credential Verifier</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onBack()}
            className="px-3 py-1 bg-gray-100 border border-100-blue rounded-full darkcard text-blue-900 dark-text-yellow"
          >
            <StepBackIcon size={15}/>
          </button>
        </div>
      </div>

      <div className="text-xs text-emerald-700 dark-text-white mb-20">
        Wallet: <code className="font-mono">{walletAddress || "n/a"}</code>
        {walletDid && <div className="text-xs">DID: {walletDid}</div>}
        {signerAddr && <div className="text-xs">Signer: {signerAddr}</div>}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2 text-blue-900 dark-text-yellow">Paste VC JSON</label>
          <textarea
            rows={12}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full border border-blue-200 rounded-2xl p-2 font-mono text-sm text-gray-600"
            placeholder="Paste a Verifiable Credential JSON here (or a compact JWT object with proof.jwt)"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleLoadJson}
              className="px-3 py-2 bg-blue-900 border border-blue-200 rounded-2xl dark-text-yellow"
            >
              Load JSON
            </button>
            <button
              onClick={() => {
                setJsonText("");
                setParsed(null);
                setJwtInput("");
                setDecodedJwtHeader(null);
                setDecodedJwtPayload(null);
                setVerificationResult(null);
              }}
              className="px-3 py-2 font-semibold text-red-500 hover:text-red-700 border border-red-500 rounded-2xl"
            >
              Clear
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-blue-900 dark-text-yellow">Or paste VC JWT (compact)</label>
          <input
            value={jwtInput}
            onChange={(e) => {
              setJwtInput(e.target.value);
              tryDecodeJwt(e.target.value);
            }}
            className="w-full border border-blue-200 rounded-2xl p-2 font-mono text-sm text-gray-600"
            placeholder="eyJ... . ... . ..."
          />
          <div className="mt-2 mb-2">
            <button
              onClick={handleVerifyClient}
              className="px-3 py-2 mr-2 mb-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl"
            >
              Run structural + signature checks
            </button>
            <button
              onClick={handleVerifyFull}
              className="px-3 py-2 mb-2 bg-blue-900 text-white border border-blue-200 darkcard hover:dark-text-yellow rounded-3xl"
            >
              Full verify (backend)
            </button>
          </div>

          {decodedJwtHeader && (
            <div className="mt-3 p-3 rounded-2xl">
              <div className="text-xs font-semibold text-blue-900 dark-text-yellow mb-2">JWT Header</div>
              <pre className="text-xs text-gray-700 dark-text-white">{JSON.stringify(decodedJwtHeader, null, 2)}</pre>
            </div>
          )}
          {decodedJwtPayload && (
            <div className="mt-3 p-3 border border-blue-200 bg-slate-50 rounded-2xl overflow-x-auto">
              <div className="text-xs font-semibold text-blue-900 dark-text-yellow mb-2">JWT Payload</div>
              <pre className="text-xs text-gray-700 dark-text-white">{JSON.stringify(decodedJwtPayload, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mt-20 mb-8 text-blue-900 dark-text-yellow">Client verification result</h4>
        {verificationResult ? (
          <div className="backdrop-blur-md p-3 rounded-2xl shadow-sm overflow-x-auto border border-blue-200">
            <pre className="text-sm text-gray-700 dark-text-white whitespace-pre-wrap">
              {JSON.stringify(verificationResult, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="text-sm text-gray-700 dark-text-yellow">No verification performed yet.</div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-xs font-bold text-blue-900 dark-text-yellow mt-10 mb-2">Notes</div>
        <ul className="text-sm list-disc ml-5 text-gray-700 dark-text-yellow">
          <li className="mt-6">
            Client-side checks are best-effort. For cryptographic verification of JWTs
            or JWS signatures, use the "Full verify (backend)" button which calls your
            server endpoint that can support more signature algorithms and DID resolution.
          </li>
          <li className="mt-6">
            If the credential uses `proof.signatureValue` and your issuer DID contains
            an Ethereum address (0x...), the verifier will attempt to recover the signer
            using common Ethereum signing idioms (raw keccak and prefixed message).
          </li>
        </ul>
      </div>
    </div>
  );
}
