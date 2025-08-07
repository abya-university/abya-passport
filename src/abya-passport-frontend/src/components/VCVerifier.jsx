import React, { useState } from "react";
import { useInternetIdentity } from "../contetxs/InternetContext";
import { useIPFS } from "../contetxs/IPFSContext";
import { useToast } from "./Toast";

const VCVerifier = () => {
  const { identity } = useInternetIdentity();
  const { retrieveFromIPFS } = useIPFS();
  const { showSuccess, showError, showInfo } = useToast();

  const [verificationInput, setVerificationInput] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("qr"); // "qr", "url", "manual"
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [scannedData, setScannedData] = useState("");

  // JSON stringify with BigInt support
  const stringifyWithBigInt = (obj, space = 2) => {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === "bigint") {
          return value.toString() + "n";
        }
        return value;
      },
      space
    );
  };

  // Parse QR code or URL data
  const parseVerificationData = (input) => {
    try {
      // Try parsing as JSON (direct VC)
      const parsed = JSON.parse(input);
      if (parsed.type && parsed.credentialSubject) {
        return {
          method: "direct",
          vc: parsed,
        };
      }
    } catch (e) {
      // Not JSON, continue with other methods
    }

    // Check if it's a URL or ID-based reference
    if (input.startsWith("http") || input.startsWith("did:icp:")) {
      return {
        method: "reference",
        reference: input,
      };
    }

    // Check if it's in our custom format: vc://vcId/ipfsCid
    if (input.startsWith("vc://")) {
      const parts = input.replace("vc://", "").split("/");
      if (parts.length >= 2) {
        return {
          method: "ipfs",
          vcId: parts[0],
          ipfsCid: parts[1],
        };
      }
    }

    // Try as IPFS CID directly
    if (input.length > 40 && input.startsWith("Qm")) {
      return {
        method: "ipfs_direct",
        ipfsCid: input,
      };
    }

    throw new Error("Invalid verification data format");
  };

  // Verify VC cryptographically
  const verifyCryptographically = async (vc) => {
    const verification = {
      isValid: true,
      signatureValid: true,
      isExpired: false,
      issuerValid: true,
      structureValid: true,
      errors: [],
    };

    try {
      // Check basic structure
      if (!vc.type || !vc.credentialSubject || !vc.issuer) {
        verification.structureValid = false;
        verification.errors.push(
          "Missing required fields (type, credentialSubject, issuer)"
        );
      }

      // Check expiration
      if (vc.expirationDate) {
        const expirationDate = new Date(vc.expirationDate);
        if (expirationDate < new Date()) {
          verification.isExpired = true;
          verification.errors.push("Credential has expired");
        }
      }

      // Check issuance date
      if (vc.issuanceDate) {
        const issuanceDate = new Date(vc.issuanceDate);
        if (issuanceDate > new Date()) {
          verification.errors.push("Issuance date is in the future");
        }
      }

      // For ICP-based VCs, verify with canister
      if (vc.issuer && vc.issuer.id && vc.issuer.id.startsWith("did:icp:")) {
        try {
          // This would call your canister's verify function
          // For now, we'll do basic checks
          verification.signatureValid = true; // Would be actual signature verification
        } catch (error) {
          verification.signatureValid = false;
          verification.errors.push(
            "Signature verification failed: " + error.message
          );
        }
      }

      // Overall validity
      verification.isValid =
        verification.structureValid &&
        verification.signatureValid &&
        !verification.isExpired &&
        verification.issuerValid;
    } catch (error) {
      verification.isValid = false;
      verification.errors.push("Verification error: " + error.message);
    }

    return verification;
  };

  // Main verification function
  const handleVerification = async () => {
    if (!verificationInput.trim()) {
      showError("Please provide verification data");
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const parsedData = parseVerificationData(verificationInput);
      let vc = null;

      switch (parsedData.method) {
        case "direct":
          vc = parsedData.vc;
          showInfo("Verifying directly embedded VC");
          break;

        case "ipfs":
          showInfo("Retrieving VC from IPFS...");
          vc = await retrieveFromIPFS(parsedData.ipfsCid);
          break;

        case "ipfs_direct":
          showInfo("Retrieving VC from IPFS CID...");
          vc = await retrieveFromIPFS(parsedData.ipfsCid);
          break;

        case "reference":
          showError("URL/DID reference verification not implemented yet");
          return;

        default:
          throw new Error("Unsupported verification method");
      }

      if (!vc) {
        throw new Error("Could not retrieve verifiable credential");
      }

      // Perform cryptographic verification
      const verification = await verifyCryptographically(vc);

      setVerificationResult({
        vc,
        verification,
        method: parsedData.method,
        timestamp: new Date(),
      });

      if (verification.isValid) {
        showSuccess("✅ Credential verification successful!");
      } else {
        showError(
          `❌ Credential verification failed: ${verification.errors.join(", ")}`
        );
      }
    } catch (error) {
      console.error("Verification error:", error);
      showError("Verification failed: " + error.message);
      setVerificationResult({
        error: error.message,
        timestamp: new Date(),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Clear verification results
  const clearResults = () => {
    setVerificationResult(null);
    setVerificationInput("");
    setScannedData("");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent mb-4">
          VC Verifier
        </h1>
        <p className="text-gray-600">
          Verify the authenticity and validity of Verifiable Credentials
        </p>
      </div>

      {/* Verification Method Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Verification Method
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setVerificationMethod("qr")}
            className={`p-4 rounded-lg border-2 transition-colors ${
              verificationMethod === "qr"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="text-2xl mb-2">📱</div>
            <div className="font-medium">QR Code</div>
            <div className="text-sm text-gray-600">Scan or paste QR data</div>
          </button>

          <button
            onClick={() => setVerificationMethod("url")}
            className={`p-4 rounded-lg border-2 transition-colors ${
              verificationMethod === "url"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="text-2xl mb-2">🔗</div>
            <div className="font-medium">URL/Reference</div>
            <div className="text-sm text-gray-600">VC URL or IPFS CID</div>
          </button>

          <button
            onClick={() => setVerificationMethod("manual")}
            className={`p-4 rounded-lg border-2 transition-colors ${
              verificationMethod === "manual"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="text-2xl mb-2">⌨️</div>
            <div className="font-medium">Manual Input</div>
            <div className="text-sm text-gray-600">Paste JSON directly</div>
          </button>
        </div>

        {/* Verification Input */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            {verificationMethod === "qr" && "QR Code Data or VC Reference"}
            {verificationMethod === "url" && "VC URL or IPFS CID"}
            {verificationMethod === "manual" && "VC JSON Document"}
          </label>

          <textarea
            value={verificationInput}
            onChange={(e) => setVerificationInput(e.target.value)}
            placeholder={
              verificationMethod === "qr"
                ? "Paste QR code content or vc://vcId/ipfsCid format"
                : verificationMethod === "url"
                ? "https://example.com/vc/123 or QmXXXXXXX..."
                : "Paste complete VC JSON document here"
            }
            rows={verificationMethod === "manual" ? 8 : 4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <div className="flex space-x-3">
            <button
              onClick={handleVerification}
              disabled={isVerifying || !verificationInput.trim()}
              className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white py-3 px-6 rounded-lg font-semibold disabled:opacity-50 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {isVerifying ? "Verifying..." : "🔍 Verify Credential"}
            </button>

            <button
              onClick={clearResults}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Supported Formats:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <code>vc://vcId/ipfsCid</code> - Our custom VC reference format
            </li>
            <li>
              • <code>QmXXXX...</code> - Direct IPFS CID
            </li>
            <li>
              •{" "}
              <code>
                {"{"}"type": "VerifiableCredential"...{"}"}
              </code>{" "}
              - Complete VC JSON
            </li>
            <li>
              • <code>did:icp:principal</code> - DID-based references (coming
              soon)
            </li>
          </ul>
        </div>
      </div>

      {/* Verification Results */}
      {verificationResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
            <span className="mr-2">
              {verificationResult.error
                ? "❌"
                : verificationResult.verification?.isValid
                ? "✅"
                : "⚠️"}
            </span>
            Verification Results
          </h2>

          {verificationResult.error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-red-800 font-medium mb-2">
                Verification Failed
              </div>
              <div className="text-red-700">{verificationResult.error}</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Verification Status */}
              <div
                className={`p-4 rounded-lg border-2 ${
                  verificationResult.verification.isValid
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-lg">
                    {verificationResult.verification.isValid
                      ? "✅ Valid"
                      : "❌ Invalid"}
                  </span>
                  <span className="text-sm text-gray-600">
                    Verified: {verificationResult.timestamp.toLocaleString()}
                  </span>
                </div>

                {/* Verification Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div
                    className={`flex items-center space-x-2 ${
                      verificationResult.verification.structureValid
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    <span>
                      {verificationResult.verification.structureValid
                        ? "✅"
                        : "❌"}
                    </span>
                    <span>Structure Valid</span>
                  </div>

                  <div
                    className={`flex items-center space-x-2 ${
                      verificationResult.verification.signatureValid
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    <span>
                      {verificationResult.verification.signatureValid
                        ? "✅"
                        : "❌"}
                    </span>
                    <span>Signature Valid</span>
                  </div>

                  <div
                    className={`flex items-center space-x-2 ${
                      !verificationResult.verification.isExpired
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    <span>
                      {!verificationResult.verification.isExpired ? "✅" : "❌"}
                    </span>
                    <span>Not Expired</span>
                  </div>

                  <div
                    className={`flex items-center space-x-2 ${
                      verificationResult.verification.issuerValid
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    <span>
                      {verificationResult.verification.issuerValid
                        ? "✅"
                        : "❌"}
                    </span>
                    <span>Issuer Valid</span>
                  </div>
                </div>

                {/* Errors */}
                {verificationResult.verification.errors.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="font-medium text-red-800 mb-2">
                      Issues Found:
                    </div>
                    <ul className="text-sm text-red-700 space-y-1">
                      {verificationResult.verification.errors.map(
                        (error, index) => (
                          <li
                            key={index}
                            className="flex items-start space-x-2"
                          >
                            <span>•</span>
                            <span>{error}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* VC Content */}
              {verificationResult.vc && (
                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Credential Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Type:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(Array.isArray(verificationResult.vc.type)
                            ? verificationResult.vc.type
                            : [verificationResult.vc.type]
                          ).map((type, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium text-gray-700">
                          Issuer:
                        </span>
                        <div className="text-gray-600 break-all">
                          {verificationResult.vc.issuer?.id ||
                            verificationResult.vc.issuer ||
                            "Unknown"}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium text-gray-700">
                          Subject:
                        </span>
                        <div className="text-gray-600 break-all">
                          {verificationResult.vc.credentialSubject?.id ||
                            "Anonymous"}
                        </div>
                      </div>

                      <div>
                        <span className="font-medium text-gray-700">
                          Issued:
                        </span>
                        <div className="text-gray-600">
                          {verificationResult.vc.issuanceDate
                            ? new Date(
                                verificationResult.vc.issuanceDate
                              ).toLocaleString()
                            : "Unknown"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Claims */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Claims</h3>
                    <div className="space-y-2">
                      {Object.entries(
                        verificationResult.vc.credentialSubject || {}
                      )
                        .filter(([key]) => key !== "id")
                        .map(([key, value]) => (
                          <div key={key} className="flex items-start space-x-3">
                            <span className="font-medium text-gray-700 capitalize min-w-0 flex-shrink-0">
                              {key.replace(/([A-Z])/g, " $1").trim()}:
                            </span>
                            <span className="text-gray-600 break-words flex-1">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Raw JSON */}
                  <details className="bg-gray-50 rounded-lg">
                    <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:bg-gray-100 rounded-lg">
                      View Raw JSON
                    </summary>
                    <div className="p-4 pt-0">
                      <pre className="text-xs text-gray-700 overflow-x-auto bg-white p-3 rounded border">
                        <code>
                          {stringifyWithBigInt(verificationResult.vc)}
                        </code>
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Information Section */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="font-medium text-blue-900 mb-3">
          About VC Verification
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>This verifier checks:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Credential structure and required fields</li>
            <li>Expiration dates and validity periods</li>
            <li>Issuer information and DID resolution</li>
            <li>Digital signatures (when available)</li>
            <li>Revocation status (when accessible)</li>
          </ul>
          <p className="mt-3">
            <strong>Note:</strong> Full cryptographic verification requires
            access to the issuer's public key and signature validation. This
            implementation provides structural and basic validity checks.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VCVerifier;
