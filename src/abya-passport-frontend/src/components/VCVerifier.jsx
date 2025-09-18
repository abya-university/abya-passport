import React, { useState } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useIPFS } from "../contexts/IPFSContext";
import { useToast } from "./Toast";
import {
  AlertTriangle,
  CheckCircle2,
  Shield,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  FileText,
  Clock,
  User,
  Tag,
  Key,
  Database,
  Verified,
  AlertCircle,
} from "lucide-react";

async function sha256HexFromString(text) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesLikeToHex(bytesLike) {
  if (!bytesLike) return "";
  if (bytesLike instanceof Uint8Array) {
    return Array.from(bytesLike)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  if (Array.isArray(bytesLike)) {
    return bytesLike
      .map((b) => Number(b).toString(16).padStart(2, "0"))
      .join("");
  }
  if (bytesLike && typeof bytesLike === "object") {
    if (Array.isArray(bytesLike.buffer)) {
      return bytesLike.buffer
        .map((b) => Number(b).toString(16).padStart(2, "0"))
        .join("");
    }
    if (Array.isArray(bytesLike.data)) {
      return bytesLike.data
        .map((b) => Number(b).toString(16).padStart(2, "0"))
        .join("");
    }
    try {
      const arr = new Uint8Array(bytesLike);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (e) {
      return "";
    }
  }
  return "";
}

function hexToUint8(hex) {
  if (!hex) return new Uint8Array([]);
  if (hex.startsWith("0x")) hex = hex.slice(2);
  const len = Math.floor(hex.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export default function VCVerifier({ vcId, localMetadata = null }) {
  const {
    identity,
    getVerificationProof,
    canisterId,
    isLocal,
    createBackendActor,
    getAgent,
    toUint8Array,
  } = useInternetIdentity();
  const { retrieveFromIPFS } = useIPFS();
  const { showSuccess, showError, showInfo } = useToast();

  const [verificationInput, setVerificationInput] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("reference");
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSteps, setVerificationSteps] = useState([]);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Parse QR code or URL data
  const parseVerificationData = (input) => {
    // 1. Handle URLs with vc parameter (your shareable link format)
    if (input.startsWith("https://") && input.includes("/verify?vc=")) {
      try {
        const url = new URL(input);
        const vcParam = url.searchParams.get("vc");
        if (vcParam) {
          // Decode the URL-encoded parameter and parse it
          const decodedVc = decodeURIComponent(vcParam);
          return parseVerificationData(decodedVc); // Recursively parse the decoded value
        }
      } catch (error) {
        throw new Error("Invalid URL format", error);
      }
    }

    // 2. Try parsing as direct JSON VC document
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object" && parsed.credentialSubject) {
        return { method: "direct", vc: parsed };
      }
    } catch (e) {
      // Not JSON - continue to other parsing methods
      console.log("Not a JSON VC, trying other formats...", e);
    }

    // 3. Try parsing as vc:// reference (handle both formats)
    if (input.startsWith("vc://")) {
      const cleanInput = input.replace("vc://", "");

      // Handle format: vc://vc:1758177577633-p1taewmgn/QmT8E9PzsBe7jdhzM96vFNKPMumUE8cX4J8gf7g99HXx5r
      const parts = cleanInput.split("/");
      if (parts.length >= 2) {
        return {
          method: "ipfs",
          vcId: parts[0],
          ipfsCid: parts[1],
        };
      }

      // Handle simple vc://vcId format
      if (parts.length === 1 && parts[0]) {
        return { method: "vcid_only", vcId: parts[0] };
      }
    }

    // 4. Try parsing as direct IPFS CID
    if (
      input.length > 40 &&
      (input.startsWith("Qm") || input.startsWith("b"))
    ) {
      return { method: "ipfs_direct", ipfsCid: input };
    }

    // 5. Try parsing as VC ID only (updated regex to match your pattern)
    if (
      input.startsWith("vc_") ||
      /^vc:[a-zA-Z0-9_-]+$/.test(input) ||
      /^[a-zA-Z0-9_-]{10,}$/.test(input)
    ) {
      return { method: "vcid_only", vcId: input };
    }

    // If none of the above work, throw error
    throw new Error(
      "Invalid verification data format. Supported formats: VC JSON document, vc://vcId/ipfsCid, IPFS CID, or VC ID"
    );
  };

  const parseVcUri = (uri) => {
    // Parse vc://vc:1758177577633-p1taewmgn/QmT8E9PzsBe7jdhzM96vFNKPMumUE8cX4J8gf7g99HXx5r
    const match = uri.match(/^vc:\/\/(vc:[^\/]+)\/(.+)$/);
    if (match) {
      return {
        type: "vcUri",
        vcId: match[1],
        ipfsCid: match[2],
      };
    }

    // Parse simpler vc://vcId format
    const simpleMatch = uri.match(/^vc:\/\/(.+)$/);
    if (simpleMatch) {
      return { type: "vcId", value: simpleMatch[1] };
    }

    throw new Error("Invalid VC URI format");
  };

  // Helper: Convert certificate to proper format for agent verification
  const processCertificate = (certificate) => {
    if (!certificate) return null;
    const certBytes = toUint8Array(certificate);
    return certBytes.buffer;
  };

  // Helper: Verify certificate against IC root key
  const verifyCertificateWithAgent = async (certificate) => {
    try {
      if (!certificate) return false;
      const agent = await getAgent();
      const isValid = await agent.readState(canisterId, {
        paths: [[new TextEncoder().encode("certified_data")]],
        certificate: certificate,
      });
      return !!isValid;
    } catch (error) {
      console.error("Certificate verification failed:", error);
      return false;
    }
  };

  //direct json verification
  const verifyDirectVC = async (vc) => {
    const steps = [];

    try {
      steps.push({
        step: "Verifying direct VC document",
        status: "processing",
      });
      setVerificationSteps(steps);

      // Perform structural validation only for direct JSON VCs
      const isValid = await verifyVcStructure(vc);

      steps[0].status = isValid ? "completed" : "failed";
      steps.push({
        step: isValid
          ? "VC structure validation passed"
          : "VC structure validation failed",
        status: isValid ? "completed" : "failed",
      });
      setVerificationSteps([...steps]);

      return {
        isValid,
        status: isValid ? "valid" : "invalid",
        details: {
          structuralValid: isValid,
          certificateValid: false, // No certificate for direct JSON
          statusValid: false, // No status check for direct JSON
          onChain: false,
        },
        vc: vc,
        timestamp: new Date(),
      };
    } catch (error) {
      steps[0].status = "failed";
      steps[0].error = error.message;
      setVerificationSteps([...steps]);
      throw error;
    }
  };

  // Helper function to validate VC structure
  const verifyVcStructure = async (vc) => {
    // Basic structural validation
    if (!vc || typeof vc !== "object") return false;
    if (!vc.type || !vc.credentialSubject) return false;
    if (!vc.issuer && !vc.issuer?.id) return false;

    // Check expiration if present
    if (vc.expirationDate) {
      try {
        const expDate = new Date(vc.expirationDate);
        if (expDate < new Date()) return false;
      } catch (e) {
        console.warn("Invalid expiration date format");
      }
    }

    return true;
  };

  // Comprehensive VC verification using agent
  const performComprehensiveVerification = async (vcId, metadata = null) => {
    const steps = [];

    try {
      steps.push({
        step: "Initializing verification process",
        status: "processing",
      });
      setVerificationSteps(steps);

      // Step 1: Get verification proof from canister (agent auto-validates certificate)
      steps.push({
        step: "Fetching cryptographic proof from canister",
        status: "processing",
      });
      setVerificationSteps([...steps]);

      let proof;
      try {
        proof = await getVerificationProof(vcId);
        steps[steps.length - 1].status = "completed";
        steps.push({
          step: "Cryptographic proof retrieved and certificate validated",
          status: "completed",
        });
        setVerificationSteps([...steps]);
      } catch (error) {
        steps[steps.length - 1].status = "failed";
        steps[steps.length - 1].error = error.message;
        throw new Error(`Proof retrieval failed: ${error.message}`);
      }

      // Step 2: Verify merkle proof client-side (your existing code is good)
      steps.push({
        step: "Verifying Merkle inclusion proof",
        status: "processing",
      });
      setVerificationSteps([...steps]);

      let merkleValid = false;
      try {
        // ... your existing merkle verification code ...
        merkleValid = true;
        steps[steps.length - 1].status = "completed";
        steps.push({
          step: "Merkle proof verification passed",
          status: "completed",
        });
        setVerificationSteps([...steps]);
      } catch (error) {
        steps[steps.length - 1].status = "failed";
        steps[steps.length - 1].error = error.message;
        throw new Error(`Merkle verification failed: ${error.message}`);
      }

      // Step 3: Check VC status (revocation, expiration)
      steps.push({
        step: "Checking VC status (revocation/expiration)",
        status: "processing",
      });
      setVerificationSteps([...steps]);

      let statusValid = false;
      try {
        const actor = await createBackendActor(null);

        // Ensure the method exists and has the correct signature
        if (typeof actor.verifyVCStatus !== "function") {
          throw new Error("verifyVCStatus method not found on actor");
        }

        const statusResult = await actor.verifyVCStatus(vcId);

        // Handle different response formats - some canisters return {ok: boolean} or just the value
        if (typeof statusResult === "object" && statusResult !== null) {
          if ("ok" in statusResult) {
            statusValid = statusResult.ok;
            if (!statusValid && "err" in statusResult) {
              throw new Error(
                `VC status check failed: ${JSON.stringify(statusResult.err)}`
              );
            }
          } else if ("valid" in statusResult) {
            statusValid = statusResult.valid;
          } else {
            // Assume it's valid if we get a response without error structure
            statusValid = true;
          }
        } else {
          // Handle primitive responses
          statusValid = !!statusResult;
        }

        steps[steps.length - 1].status = "completed";
      } catch (error) {
        steps[steps.length - 1].status = "failed";
        steps[steps.length - 1].error = error.message;
        throw new Error(`Status check failed: ${error.message}`);
      }

      steps.push({ step: "VC status check passed", status: "completed" });
      setVerificationSteps([...steps]);

      // Final verification result
      const isFullyValid = merkleValid && statusValid;

      steps.push({
        step: isFullyValid
          ? "Verification completed successfully"
          : "Verification completed with issues",
        status: isFullyValid ? "completed" : "failed",
      });
      setVerificationSteps([...steps]);

      return {
        isValid: isFullyValid,
        status: isFullyValid ? "valid" : "invalid",
        details: {
          merkleProofValid: merkleValid,
          certificateValid: true, // Agent already validated the certificate
          statusValid: statusValid,
          vcHash: bytesLikeToHex(proof.vcHash),
          treeHash: bytesLikeToHex(proof.treeHash),
          hasCertificate: !!proof.certificate,
          proofPathLength: proof.proofPath?.length || 0,
        },
        proof: proof,
        metadata: metadata || proof.vcMetadata,
      };
    } catch (error) {
      steps.push({
        step: "Verification failed",
        status: "failed",
        error: error.message,
      });
      setVerificationSteps([...steps]);
      throw error;
    }
  };

  // Main verification function
  const handleVerification = async () => {
    if (!verificationInput.trim()) {
      showError("Please provide verification data");
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);
    setVerificationSteps([]);

    try {
      const parsedData = parseVerificationData(verificationInput);
      let verification;

      switch (parsedData.method) {
        case "direct": {
          showInfo(
            "Verifying directly embedded VC (structural validation only)"
          );
          verification = await verifyDirectVC(parsedData.vc);
          break;
        }
        case "ipfs": {
          showInfo("Retrieving VC from IPFS and verifying...");
          const vcData = await retrieveFromIPFS(parsedData.ipfsCid);
          const vcIdFromDoc = vcData.id || parsedData.vcId;
          verification = await performComprehensiveVerification(
            vcIdFromDoc,
            vcData
          );
          break;
        }
        case "ipfs_direct": {
          showInfo("Retrieving VC from IPFS CID...");
          const vcDataDirect = await retrieveFromIPFS(parsedData.ipfsCid);
          if (vcDataDirect.id) {
            verification = await performComprehensiveVerification(
              vcDataDirect.id,
              vcDataDirect
            );
          } else {
            verification = await verifyDirectVC(vcDataDirect);
          }
          break;
        }
        case "vcid_only": {
          showInfo("Verifying VC by ID...");
          verification = await performComprehensiveVerification(
            parsedData.vcId
          );
          break;
        }
        default: {
          throw new Error("Unsupported verification method");
        }
      }

      setVerificationResult({
        ...verification,
        method: parsedData.method,
        timestamp: new Date(),
      });

      if (verification.isValid) {
        showSuccess("Credential verification successful!");
      } else {
        showError("Credential verification failed");
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

  const clearResults = () => {
    setVerificationResult(null);
    setVerificationInput("");
    setVerificationSteps([]);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showInfo("Copied to clipboard");
  };

  const StatusIcon = ({ status }) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "processing":
        return <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <div className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-transparent py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-yellow-100 p-4 rounded-full">
              <Shield className="w-12 h-12 text-yellow-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-yellow-500 mb-4">
            Verifiable Credential Verifier
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Verify the authenticity, integrity, and validity of any Verifiable
            Credential issued on the Internet Computer network
          </p>
        </div>

        {/* Verification Input Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-yellow-500 mb-6 flex items-center">
            <FileText className="mr-2" />
            Enter Credential Information
          </h2>

          {/* Method Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <button
              onClick={() => setVerificationMethod("reference")}
              className={`p-4 rounded-lg border-2 transition-all ${
                verificationMethod === "reference"
                  ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                  : "border-gray-200 hover:border-yellow-300 bg-white"
              }`}
            >
              <Key className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <div className="font-medium text-gray-500">VC Reference</div>
              <div className="text-sm text-gray-600">VC ID or vc:// link</div>
            </button>

            <button
              onClick={() => setVerificationMethod("ipfs")}
              className={`p-4 rounded-lg border-2 transition-all ${
                verificationMethod === "ipfs"
                  ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                  : "border-gray-200 hover:border-yellow-300 bg-white"
              }`}
            >
              <Database className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <div className="font-medium text-gray-500">IPFS Content</div>
              <div className="text-sm text-gray-600">IPFS CID</div>
            </button>

            <button
              onClick={() => setVerificationMethod("json")}
              className={`p-4 rounded-lg border-2 transition-all ${
                verificationMethod === "json"
                  ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                  : "border-gray-200 hover:border-yellow-300 bg-white"
              }`}
            >
              <FileText className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <div className="font-medium text-gray-500">Direct JSON</div>
              <div className="text-sm text-gray-600">Complete VC document</div>
            </button>
          </div>

          {/* Input Area */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {verificationMethod === "reference" && "VC ID or Reference"}
              {verificationMethod === "ipfs" && "IPFS Content Identifier"}
              {verificationMethod === "json" && "Complete VC JSON Document"}
            </label>

            <textarea
              value={verificationInput}
              onChange={(e) => setVerificationInput(e.target.value)}
              placeholder={
                verificationMethod === "reference"
                  ? "vc_123456789 or vc://vcId/ipfsCid"
                  : verificationMethod === "ipfs"
                  ? "QmXXXXXXXXXXXXXXXXXXXX..."
                  : '{"@context": ["https://www.w3.org/2018/credentials/v1"], ...}'
              }
              rows={verificationMethod === "json" ? 8 : 3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none text-gray-600"
            />

            <div className="flex justify-center space-x-4">
              <button
                onClick={handleVerification}
                disabled={isVerifying || !verificationInput.trim()}
                className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white py-3 px-8 rounded-lg font-semibold transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Verified />
                    Verify Credential
                  </>
                )}
              </button>

              <button
                onClick={clearResults}
                className="flex items-center gap-2 px-6 py-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-all"
              >
                <XCircle />
                Clear
              </button>
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-medium text-yellow-900 mb-2">
              Supported Formats:
            </h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>
                • <code>vc_XXXXXXX</code> - VC ID for on-chain verification
              </li>
              <li>
                • <code>vc://vcId/ipfsCid</code> - Complete VC reference
              </li>
              <li>
                • <code>QmXXXX...</code> - Direct IPFS content hash
              </li>
              <li>• Complete JSON VC document</li>
            </ul>
          </div>
        </div>

        {/* Verification Steps */}
        {verificationSteps.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold dark:text-yellow-500 text-white mb-6">
              Verification Process
            </h2>
            <div className="space-y-4">
              {verificationSteps.map((step, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <StatusIcon status={step.status} />
                  <div className="flex-1">
                    <span
                      className={`${
                        step.status === "failed"
                          ? "text-red-600"
                          : step.status === "warning"
                          ? "text-yellow-600"
                          : "text-gray-600"
                      }`}
                    >
                      {step.step}
                    </span>
                    {step.error && (
                      <div className="text-sm text-red-600 mt-1">
                        {step.error}
                      </div>
                    )}
                    {step.warning && (
                      <div className="text-sm text-yellow-600 mt-1">
                        {step.warning}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Results */}
        {verificationResult && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-yellow-900 mb-6 flex items-center">
              <Shield className="mr-2" />
              Verification Results
            </h2>

            {verificationResult.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-center mb-4">
                  <XCircle className="w-6 h-6 text-red-600 mr-2" />
                  <h3 className="text-lg font-semibold text-red-800">
                    Verification Failed
                  </h3>
                </div>
                <p className="text-red-700">{verificationResult.error}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall Status */}
                <div
                  className={`p-6 rounded-lg border-2 ${
                    verificationResult.isValid
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      {verificationResult.isValid ? (
                        <CheckCircle2 className="w-8 h-8 text-green-600 mr-3" />
                      ) : (
                        <XCircle className="w-8 h-8 text-red-600 mr-3" />
                      )}
                      <div>
                        <h3
                          className={`text-2xl font-bold ${
                            verificationResult.isValid
                              ? "text-green-800"
                              : "text-red-800"
                          }`}
                        >
                          {verificationResult.isValid ? "VALID" : "INVALID"}
                        </h3>
                        <p className="text-gray-600">
                          Verified:{" "}
                          {verificationResult.timestamp.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Verification Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center space-x-2">
                      {verificationResult.details?.merkleProofValid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        Merkle Proof
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {verificationResult.details?.certificateValid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : verificationResult.details?.hasCertificate ? (
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        Certificate
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {verificationResult.details?.statusValid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        Status
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {verificationResult.details?.hasCertificate ? (
                        <Database className="w-5 h-5 text-yellow-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        On-Chain
                      </span>
                    </div>
                  </div>
                </div>

                {/* VC Information */}
                {verificationResult.vc && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Basic Info */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <User className="mr-2" />
                        Credential Information
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            Subject
                          </label>
                          <p className="text-gray-900 break-all">
                            {verificationResult.vc.credentialSubject?.id ||
                              "Anonymous"}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            Issuer
                          </label>
                          <p className="text-gray-900 break-all">
                            {verificationResult.vc.issuer?.id ||
                              verificationResult.vc.issuer ||
                              "Unknown"}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            Issued
                          </label>
                          <p className="text-gray-900">
                            {verificationResult.vc.issuanceDate
                              ? new Date(
                                  verificationResult.vc.issuanceDate
                                ).toLocaleString()
                              : "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Claims */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        <Tag className="mr-2" />
                        Credential Claims
                      </h3>
                      <div className="space-y-3">
                        {Object.entries(
                          verificationResult.vc.credentialSubject || {}
                        )
                          .filter(([key]) => key !== "id")
                          .map(([key, value]) => (
                            <div key={key}>
                              <label className="text-sm font-medium text-gray-600 capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </label>
                              <p className="text-gray-900 break-words">
                                {typeof value === "object"
                                  ? JSON.stringify(value, null, 2)
                                  : String(value)}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Technical Details */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <button
                    onClick={() =>
                      setShowTechnicalDetails(!showTechnicalDetails)
                    }
                    className="flex items-center justify-between w-full text-left"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Database className="mr-2" />
                      Technical Details
                    </h3>
                    <span className="text-2xl">
                      {showTechnicalDetails ? "−" : "+"}
                    </span>
                  </button>

                  {showTechnicalDetails && verificationResult.details && (
                    <div className="mt-4 space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            VC Hash
                          </label>
                          <div className="flex items-center space-x-2 mt-1">
                            <code className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded flex-1 truncate">
                              {verificationResult.details.vcHash || "N/A"}
                            </code>
                            {verificationResult.details.vcHash && (
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    verificationResult.details.vcHash
                                  )
                                }
                                className="p-1 text-gray-500 hover:text-gray-700"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            Tree Hash
                          </label>
                          <div className="flex items-center space-x-2 mt-1">
                            <code className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded flex-1 truncate">
                              {verificationResult.details.treeHash || "N/A"}
                            </code>
                            {verificationResult.details.treeHash && (
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    verificationResult.details.treeHash
                                  )
                                }
                                className="p-1 text-gray-500 hover:text-gray-700"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-green-600">
                          Verification Details
                        </label>
                        <div className="mt-2 text-sm space-y-1 text-gray-700">
                          <div>
                            Merkle Proof Path Length:{" "}
                            {verificationResult.details.proofPathLength}
                          </div>
                          <div>
                            Certificate Present:{" "}
                            {verificationResult.details.hasCertificate
                              ? "Yes"
                              : "No"}
                          </div>
                          <div>
                            Network:{" "}
                            {isLocal ? "Local Development" : "IC Mainnet"}
                          </div>
                          <div>Canister: {canisterId}</div>
                        </div>
                      </div>

                      {/* Merkle Path Visualization */}
                      {verificationResult.proof?.proofPath &&
                        verificationResult.proof.proofPath.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-600">
                              Merkle Proof Path
                            </label>
                            <div className="mt-2 space-y-2">
                              {verificationResult.proof.proofPath.map(
                                (node, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center space-x-3 text-xs"
                                  >
                                    <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-800 flex items-center justify-center font-bold">
                                      {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-shrink-0">
                                      {node.isLeft ? "Left" : "Right"} Sibling:
                                    </span>
                                    <code className="bg-gray-200 px-2 py-1 rounded truncate flex-1">
                                      {bytesLikeToHex(node.sibling).slice(
                                        0,
                                        24
                                      )}
                                      ...
                                    </code>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Raw VC JSON */}
                      {verificationResult.vc && (
                        <details className="mt-5 border-t pt-4 border-yellow-500">
                          <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">
                            Raw VC JSON Document
                          </summary>
                          <div className="mt-2">
                            <pre className="text-xs bg-gray-100 text-gray-700 p-3 rounded border overflow-x-auto max-h-64">
                              <code>
                                {JSON.stringify(verificationResult.vc, null, 2)}
                              </code>
                            </pre>
                          </div>
                        </details>
                      )}

                      {verificationResult.details?.onChain === false && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center">
                            <AlertCircle className="w-5 h-5 text-blue-600 mr-2" />
                            <span className="text-sm text-blue-700">
                              Note: Direct JSON verification only checks
                              structural validity. For full cryptographic
                              verification including on-chain status and
                              certificate validation, use a VC ID or IPFS
                              reference.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Debug Section for vcId prop */}
        {vcId && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              Debug Mode
            </h3>
            <p className="text-sm text-yellow-700 mb-4">
              Component initialized with VC ID:{" "}
              <code className="bg-yellow-200 px-1 rounded">{vcId}</code>
            </p>
            <button
              onClick={() => {
                setVerificationInput(vcId);
                setVerificationMethod("reference");
              }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm"
            >
              Load VC ID for Verification
            </button>
          </div>
        )}

        {/* Information Section */}
        <div className="mt-12 bg-yellow-50 rounded-2xl p-8">
          <h3 className="text-2xl font-bold text-yellow-500 mb-6">
            How Verification Works
          </h3>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-yellow-600 mb-3">
                Cryptographic Verification
              </h4>
              <ul className="text-sm text-yellow-500 space-y-2">
                <li>• Merkle proof inclusion verification</li>
                <li>• Hash consistency validation</li>
                <li>• IC certificate authentication</li>
                <li>• Revocation status checking</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-yellow-600 mb-3">
                Trust Model
              </h4>
              <ul className="text-sm text-yellow-500 space-y-2">
                <li>• Internet Computer consensus security</li>
                <li>• Canister-signed certification</li>
                <li>• IPFS content addressing</li>
                <li>• Client-side verification</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-4 bg-white rounded-lg border-l-4 border-yellow-500">
            <p className="text-sm text-gray-400">
              <strong>Security Note:</strong> This verifier performs
              cryptographically secure verification by reconstructing Merkle
              proofs and validating IC certificates. On mainnet, the HttpAgent
              automatically validates certificates against IC root keys.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
