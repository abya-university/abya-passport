// src/abya-passport-frontend/src/components/EthrVcManager.jsx

import React, { useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";

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
  const [jwtToVerify, setJwtToVerify] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const toISO = (datetimeLocal) => {
    if (!datetimeLocal) return undefined;
    return new Date(datetimeLocal).toISOString();
  };

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
          name: formData.name,
          role: formData.role,
          organization: formData.organization,
        },
        ...(formData.expirationDate && {
          expirationDate: toISO(formData.expirationDate),
        }),
      };

      const response = await axios.post(
        "http://localhost:3000/credential/create",
        payload
      );

      const cred = response.data.credential;
      setCredential(cred);

      const jwt =
        (cred && cred.proof && cred.proof.jwt) ||
        (typeof cred === "string" ? cred : null);

      if (jwt) {
        setJwtToVerify(jwt);
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.error || err?.message || "Failed to create credential"
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, label = "Text") => {
    if (!text) return alert(`${label} is empty`);
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied to clipboard`);
    } catch (err) {
      console.error("Clipboard error:", err);
      alert("Failed to copy to clipboard");
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

  const downloadJSON = () => {
    if (!credential) return alert("No credential to download");
    downloadFile("verifiable-credential.json", JSON.stringify(credential, null, 2), "application/json");
  };

  const downloadJWT = () => {
    if (!jwtToVerify) return alert("No JWT to download");
    downloadFile("credential.jwt.txt", jwtToVerify, "text/plain");
  };

  const downloadPDF = () => {
    if (!credential) return alert("No credential to download");

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Verifiable Credential", 20, 20);

    const vc = credential;
    const lines = [
      `Name: ${vc?.credentialSubject?.name ?? "N/A"}`,
      `Role: ${vc?.credentialSubject?.role ?? "N/A"}`,
      `Organization: ${vc?.credentialSubject?.organization ?? "N/A"}`,
      `Subject DID: ${vc?.credentialSubject?.id ?? "N/A"}`,
      `Issuer DID: ${vc?.issuer?.id ?? "N/A"}`,
      `Issuance Date: ${vc?.issuanceDate ?? "N/A"}`,
      `Expiration Date: ${vc?.expirationDate ?? "N/A"}`,
    ];

    let y = 30;
    lines.forEach((ln) => {
      doc.setFontSize(11);
      doc.text(ln, 20, y);
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    const jwt = vc?.proof?.jwt;
    if (jwt) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text("JWT (compact):", 20, 20);
      doc.setFontSize(9);

      const chunkSize = 80;
      let posY = 28;
      for (let i = 0; i < jwt.length; i += chunkSize) {
        doc.text(jwt.slice(i, i + chunkSize), 20, posY);
        posY += 6;
        if (posY > 280) {
          doc.addPage();
          posY = 20;
        }
      }
    }

    doc.save("verifiable-credential.pdf");
  };

  // ---------- FIXED: correct extraction of verification object ----------
  const handleJwtVerification = async () => {
    setVerificationResult(null);
    setError("");
    if (!jwtToVerify) {
      setVerificationResult({ verified: false, error: "No JWT provided" });
      return;
    }

    try {
      const response = await axios.post("http://localhost:3000/credential/verify", {
        credential: jwtToVerify,
      });

      // backend returns { success: true, verification: { verified: true, ... } }
      // prefer the 'verification' object; fallback to whole response if needed
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
  // --------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto p-6 shadow rounded bg-white">
      <h2 className="text-2xl font-bold mb-4">Create Verifiable Credential</h2>

      {/* Credential Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          "issuerDid",
          "subjectDid",
          "name",
          "role",
          "organization",
          "expirationDate",
        ].map((field) => (
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

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {loading ? "Creating..." : "Create Credential"}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {/* Credential Output */}
      {credential && (
        <div className="mt-6 bg-gray-100 p-4 rounded overflow-auto">
          <h3 className="font-semibold mb-2">Credential Created:</h3>

          <div className="mb-2">
            <small className="text-xs text-gray-600">(You can copy or download the JSON / JWT below)</small>
          </div>

          <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(credential, null, 2)}</pre>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(credential, null, 2), "Credential JSON")}
              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              Copy JSON
            </button>

            <button
              type="button"
              onClick={downloadJSON}
              className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
            >
              Download JSON
            </button>

            <button
              type="button"
              onClick={downloadPDF}
              className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
            >
              Download PDF
            </button>

            {credential?.proof?.jwt && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setJwtToVerify(credential.proof.jwt);
                    alert("JWT copied to verification field");
                  }}
                  className="bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                >
                  Use JWT for Verify
                </button>

                <button
                  type="button"
                  onClick={() => copyToClipboard(credential.proof.jwt, "JWT")}
                  className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                >
                  Copy JWT
                </button>

                <button
                  type="button"
                  onClick={downloadJWT}
                  className="bg-slate-600 text-white px-3 py-1 rounded hover:bg-slate-700"
                >
                  Download JWT
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* JWT Verification */}
      <div className="mt-10">
        <h3 className="text-xl font-bold mb-2">Verify JWT</h3>

        <textarea
          className="w-full border border-gray-300 p-2 rounded"
          rows="4"
          placeholder="Paste JWT here..."
          value={jwtToVerify}
          onChange={(e) => setJwtToVerify(e.target.value.trim())}
        />

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleJwtVerification}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Verify JWT
          </button>
          <button
            type="button"
            onClick={() => {
              setJwtToVerify("");
              setVerificationResult(null);
            }}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Clear
          </button>
        </div>

        {verificationResult && (
          <div className="mt-4 p-4 rounded bg-gray-100">
            <h4 className="font-semibold">Verification Result:</h4>

            <pre className="text-sm whitespace-pre-wrap">
              {JSON.stringify(verificationResult, null, 2)}
            </pre>

            <div className="mt-2">
              {verificationResult.verified ? (
                <span className="text-green-700 font-semibold">Verified ✅</span>
              ) : (
                <span className="text-red-700 font-semibold">
                  Not verified — {verificationResult.error ?? "unknown reason"}
                </span>
              )}
            </div>

            {/* Helpful extracted info */}
            {verificationResult.payload && (
              <div className="mt-3 text-sm">
                <div><strong>Issuer:</strong> {verificationResult.payload?.iss ?? "N/A"}</div>
                <div><strong>Subject:</strong> {verificationResult.payload?.sub ?? "N/A"}</div>
                <div><strong>Expiry (exp):</strong> {verificationResult.payload?.exp ? new Date(verificationResult.payload.exp * 1000).toUTCString() : "N/A"}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EthrVcManager;
