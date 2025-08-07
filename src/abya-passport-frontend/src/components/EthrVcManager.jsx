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

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCredential(null);

    try {
      const response = await axios.post(
        "http://localhost:3000/credential/create",
        {
          issuerDid: formData.issuerDid,
          subjectDid: formData.subjectDid,
          credentialSubject: {
            name: formData.name,
            role: formData.role,
            organization: formData.organization,
          },
          expirationDate: formData.expirationDate,
        }
      );

      setCredential(response.data.credential);
    } catch (err) {
      console.error(err);
      setError("Failed to create credential");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(credential, null, 2));
    alert("Credential copied to clipboard!");
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(credential, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "verifiable-credential.json";
    link.click();
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text("Verifiable Credential", 20, 20);

    const y = 30;
    const vc = credential;

    const lines = [
      `Name: ${vc.credentialSubject.name}`,
      `Role: ${vc.credentialSubject.role}`,
      `Organization: ${vc.credentialSubject.organization}`,
      `Subject DID: ${vc.credentialSubject.id}`,
      `Issuer DID: ${vc.issuer.id}`,
      `Issuance Date: ${vc.issuanceDate}`,
      `Expiration Date: ${vc.expirationDate}`,
    ];

    let offset = y;
    lines.forEach((line) => {
      doc.text(line, 20, offset);
      offset += 10;
    });

    doc.save("verifiable-credential.pdf");
  };

  const handleJwtVerification = async () => {
    setVerificationResult(null);
    try {
      const response = await axios.post(
        "http://localhost:3000/credential/verify",
        {
          credential: jwtToVerify,
        }
      );
      setVerificationResult(response.data);
    } catch (err) {
      console.error(err);
      setVerificationResult({ verified: false, error: "Verification failed" });
    }
  };

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
              className="w-full border border-gray-300 p-2 rounded dark:text-black"
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
          <pre className="text-sm">{JSON.stringify(credential, null, 2)}</pre>
          <div className="flex space-x-4 mt-4">
            <button
              onClick={copyToClipboard}
              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              Copy JSON
            </button>
            <button
              onClick={downloadJSON}
              className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
            >
              Download JSON
            </button>
            <button
              onClick={downloadPDF}
              className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
            >
              Download PDF
            </button>
          </div>
        </div>
      )}

      {/* JWT Verification */}
      <div className="mt-10">
        <h3 className="text-xl font-bold mb-2">Verify JWT</h3>
        <textarea
          className="w-full border border-gray-300 p-2 rounded dark:text-black"
          rows="4"
          placeholder="Paste JWT here..."
          value={jwtToVerify}
          onChange={(e) => setJwtToVerify(e.target.value)}
        />
        <button
          onClick={handleJwtVerification}
          className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Verify JWT
        </button>

        {verificationResult && (
          <div className="mt-4 p-4 rounded bg-gray-100">
            <h4 className="font-semibold">Verification Result:</h4>
            <pre className="text-sm">
              {JSON.stringify(verificationResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default EthrVcManager;
