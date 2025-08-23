// src/abya-passport-frontend/src/components/VCManager.jsx

import React, { useState, useEffect } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useToast } from "./Toast";
import VCSharer from "./VCSharer";
import { Delete } from "lucide-react";

const VCManager = () => {
  const {
    identity,
    did,
    myIssuedVCs,
    myReceivedVCs,
    isLoadingVCs,
    issueVC,
    verifyVC,
    revokeVC,
    loadMyIssuedVCs,
    loadMyReceivedVCs,
  } = useInternetIdentity();

  const { showSuccess, showError, showInfo, showWarning } = useToast();

  const [activeTab, setActiveTab] = useState("received");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [verificationResults, setVerificationResults] = useState({});
  const [isVerifying, setIsVerifying] = useState({});
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(null);
  const [sharingVC, setSharingVC] = useState(null);

  // console.log("Issued VC: ", myIssuedVCs);

  // Issue VC form state
  const [issueForm, setIssueForm] = useState({
    recipientDid: "",
    claims: [{ key: "", value: "" }],
    expiresInHours: 24,
    credentialTypes: ["VerifiableCredential"],
    customType: "",
  });

  const [isIssuing, setIsIssuing] = useState(false);

  // Add a new claim field to the form
  const addClaimField = () => {
    setIssueForm((prev) => ({
      ...prev,
      claims: [...prev.claims, { key: "", value: "" }],
    }));
  };

  // Remove a claim field
  const removeClaimField = (index) => {
    setIssueForm((prev) => ({
      ...prev,
      claims: prev.claims.filter((_, i) => i !== index),
    }));
  };

  // Update claim field
  const updateClaimField = (index, field, value) => {
    setIssueForm((prev) => ({
      ...prev,
      claims: prev.claims.map((claim, i) =>
        i === index ? { ...claim, [field]: value } : claim
      ),
    }));
  };

  // Handle VC issuance
  const handleIssueVC = async (e) => {
    e.preventDefault();
    setIsIssuing(true);

    try {
      // Convert claims array to object
      const claimsObject = {};
      issueForm.claims.forEach((claim) => {
        if (claim.key && claim.value) {
          claimsObject[claim.key] = claim.value;
        }
      });

      // Prepare credential types array
      let credentialTypes = [...issueForm.credentialTypes];
      if (
        issueForm.customType &&
        !credentialTypes.includes(issueForm.customType)
      ) {
        credentialTypes.push(issueForm.customType);
      }

      // For now, we'll pass the credential type info in the claims
      // This can be enhanced when the backend supports the full VC structure
      const enhancedClaims = {
        ...claimsObject,
        _credentialTypes: credentialTypes.join(","), // Temporary way to pass types
      };

      await issueVC(
        issueForm.recipientDid,
        enhancedClaims,
        issueForm.expiresInHours
      );

      // Reset form
      setIssueForm({
        recipientDid: "",
        claims: [{ key: "", value: "" }],
        expiresInHours: 24,
        credentialTypes: ["VerifiableCredential"],
        customType: "",
      });
      setShowIssueForm(false);
      showSuccess("VC issued successfully!");
    } catch (error) {
      console.error("Error issuing VC:", error);
      showError("Error issuing VC: " + error.message);
    } finally {
      setIsIssuing(false);
    }
  };

  // Copy to clipboard function
  const copyToClipboard = (text, label = "Text") => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showSuccess(`${label} copied to clipboard!`);
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
        showError("Failed to copy to clipboard");
      });
  };

  // Handle VC verification
  const handleVerifyVC = async (vcId) => {
    setIsVerifying((prev) => ({ ...prev, [vcId]: true }));

    try {
      const result = await verifyVC(vcId);
      setVerificationResults((prev) => ({ ...prev, [vcId]: result }));
      if (result.isValid) {
        showSuccess("VC verification successful!");
      } else {
        showWarning(`VC verification failed: ${result.status}`);
      }
    } catch (error) {
      console.error("Error verifying VC:", error);
      showError("Error verifying VC: " + error.message);
    } finally {
      setIsVerifying((prev) => ({ ...prev, [vcId]: false }));
    }
  };

  // Handle VC revocation
  const handleRevokeVC = async (vcId) => {
    setShowRevokeConfirm(vcId);
  };

  const confirmRevokeVC = async (vcId) => {
    try {
      const success = await revokeVC(vcId);
      if (success) {
        showSuccess("VC revoked successfully!");
      } else {
        showError("Failed to revoke VC. You may not be the issuer.");
      }
    } catch (error) {
      console.error("Error revoking VC:", error);
      showError("Error revoking VC: " + error.message);
    } finally {
      setShowRevokeConfirm(null);
    }
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(parseInt(timestamp) / 1000000);
    return date.toLocaleString();
  };

  // Truncate text utility
  const truncateText = (text, maxLength = 30) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

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

  // VC Card Component with improved UI
  const VCCard = ({ vc, isIssued = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedSections, setExpandedSections] = useState({
      claims: false,
      verification: false,
      details: false,
      rawJson: false,
    });

    const isVerified = verificationResults[vc.id];
    const isVerifyingVC = isVerifying[vc.id];

    // Get the credential type(s) - handle both single string and array
    const getCredentialTypes = () => {
      if (!vc.type) return ["VerifiableCredential"];
      if (Array.isArray(vc.type)) return vc.type;
      return [vc.type];
    };

    const credentialTypes = getCredentialTypes();
    const primaryType =
      credentialTypes.find((type) => type !== "VerifiableCredential") ||
      "VerifiableCredential";

    const toggleSection = (section) => {
      setExpandedSections((prev) => ({
        ...prev,
        [section]: !prev[section],
      }));
    };

    const getStatusColor = () => {
      if (vc.revoked) return "bg-red-100 border-red-200";
      if (isVerified?.isValid === false)
        return "bg-orange-100 border-orange-200";
      if (isVerified?.isValid === true) return "bg-green-100 border-green-200";
      return "bg-blue-50 border-blue-200";
    };

    const getStatusIcon = () => {
      if (vc.revoked) return "🚫";
      if (isVerified?.isValid === false) return "⚠️";
      if (isVerified?.isValid === true) return "✅";
      return "📄";
    };

    return (
      <div
        className={`bg-white border-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ${getStatusColor()}`}
      >
        {/* Compact Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-lg">{getStatusIcon()}</span>
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {primaryType.replace(/([A-Z])/g, " $1").trim()}
                </h3>
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                    vc.revoked
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {vc.revoked ? "Revoked" : "Active"}
                </span>
              </div>

              {/* Credential Types Tags */}
              <div className="flex flex-wrap gap-1 mb-2">
                {credentialTypes
                  .filter((type) => type !== "VerifiableCredential")
                  .slice(0, 2)
                  .map((type, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                    >
                      {type}
                    </span>
                  ))}
                {credentialTypes.filter(
                  (type) => type !== "VerifiableCredential"
                ).length > 2 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    +{credentialTypes.length - 3} more
                  </span>
                )}
              </div>

              {/* Quick Info */}
              <div className="text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>📅 {formatDate(vc.issuanceDate)}</span>
                  {vc.expirationDate && (
                    <span
                      className={`${
                        new Date(parseInt(vc.expirationDate) / 1000000) <
                        new Date()
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      ⏰ {formatDate(vc.expirationDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={() => setSharingVC(vc)}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Share credential"
              >
                📤
              </button>
              <button
                onClick={() => handleVerifyVC(vc.id)}
                disabled={isVerifyingVC}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                title="Verify credential"
              >
                {isVerifyingVC ? "🔄" : "🔍"}
              </button>
              {isIssued && (
                <button
                  onClick={() => handleRevokeVC(vc.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Revoke credential"
                >
                  🗑️
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "🔼" : "🔽"}
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="p-4 space-y-4">
            {/* Verification Status */}
            {isVerified && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("verification")}
                  className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        isVerified.isValid ? "bg-green-500" : "bg-red-500"
                      }`}
                    ></span>
                    <span className="font-medium text-gray-900">
                      Verification Status
                    </span>
                    <span
                      className={`text-sm px-2 py-1 rounded-full ${
                        isVerified.isValid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isVerified.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                  <span className="text-gray-400">
                    {expandedSections.verification ? "🔼" : "🔽"}
                  </span>
                </button>

                {expandedSections.verification && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div
                        className={`flex items-center space-x-2 ${
                          isVerified?.isExpired !== false
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        <span>
                          {isVerified?.isExpired !== false ? "⚠️" : "✅"}
                        </span>
                        <span>
                          {isVerified?.isExpired !== false
                            ? "Check Expiry"
                            : "Valid Period"}
                        </span>
                      </div>
                      <div
                        className={`flex items-center space-x-2 ${
                          isVerified?.signatureValid === false
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        <span>
                          {isVerified?.signatureValid === false ? "❌" : "🔐"}
                        </span>
                        <span>
                          {isVerified?.signatureValid === false
                            ? "Invalid Signature"
                            : "Signature Valid"}
                        </span>
                      </div>
                    </div>

                    {isVerified &&
                      isVerified.errors &&
                      isVerified.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="text-sm font-medium text-red-800 mb-1">
                            Issues Found:
                          </div>
                          <ul className="text-sm text-red-700 space-y-1">
                            {isVerified.errors.map((error, index) => (
                              <li
                                key={index}
                                className="flex items-start space-x-1"
                              >
                                <span>•</span>
                                <span>{error}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Credential Claims */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection("claims")}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span>📋</span>
                  <span className="font-medium text-gray-900">
                    Credential Claims
                  </span>
                  <span className="text-sm text-gray-500">
                    (
                    {
                      Object.keys(vc.credentialSubject || {}).filter(
                        (key) => key !== "id"
                      ).length
                    }{" "}
                    claims)
                  </span>
                </div>
                <span className="text-gray-400">
                  {expandedSections.claims ? "🔼" : "🔽"}
                </span>
              </button>

              {expandedSections.claims && (
                <div className="p-4">
                  <div className="space-y-3">
                    {Object.entries(vc.credentialSubject || {})
                      .filter(([key]) => key !== "id")
                      .map(([key, value]) => {
                        const stringValue =
                          typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value);
                        const isLong = stringValue.length > 50;

                        return (
                          <div key={key} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-700 mb-1 capitalize">
                                  {key.replace(/([A-Z])/g, " $1").trim()}
                                </div>
                                <div className="text-sm text-gray-900">
                                  {isLong ? (
                                    <div>
                                      <div className="break-words">
                                        {expandedSections[`claim-${key}`]
                                          ? stringValue
                                          : truncateText(stringValue, 50)}
                                      </div>
                                      <button
                                        onClick={() =>
                                          toggleSection(`claim-${key}`)
                                        }
                                        className="text-blue-600 hover:text-blue-800 text-xs mt-1 font-medium"
                                      >
                                        {expandedSections[`claim-${key}`]
                                          ? "Show less"
                                          : "Show more"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="break-words">
                                      {stringValue}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  copyToClipboard(stringValue, `${key} value`)
                                }
                                className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Copy value"
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {Object.keys(vc.credentialSubject || {}).filter(
                      (key) => key !== "id"
                    ).length === 0 && (
                      <div className="text-center py-4 text-gray-500 italic">
                        No additional claims found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Technical Details */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection("details")}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span>🔧</span>
                  <span className="font-medium text-gray-900">
                    Technical Details
                  </span>
                </div>
                <span className="text-gray-400">
                  {expandedSections.details ? "🔼" : "🔽"}
                </span>
              </button>

              {expandedSections.details && (
                <div className="p-4 space-y-3">
                  {/* VC ID */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      Credential ID
                    </div>
                    <div className="flex items-center space-x-2">
                      <code className="text-xs text-gray-600 bg-white px-2 py-1 rounded border flex-1 break-all">
                        {truncateText(vc.id, 40)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(vc.id, "VC ID")}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Copy full ID"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* <p>{vc}</p> */}

                  {/* Issuer DID */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      👤 Issuer DID
                    </div>
                    <div className="flex items-center space-x-2">
                      <code className="text-xs text-gray-600 bg-white px-2 py-1 rounded border flex-1 break-all">
                        {truncateText(
                          vc.issueDid || vc.document?.issuer.id || "Unknown",
                          40
                        )}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            vc.issuerDid || vc.issuer?.id,
                            "Issuer DID"
                          )
                        }
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Copy issuer DID"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* Subject DID */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      🎯 Subject DID
                    </div>
                    <div className="flex items-center space-x-2">
                      <code className="text-xs text-gray-600 bg-white px-2 py-1 rounded border flex-1 break-all">
                        {truncateText(
                          vc.subjectDid ||
                            vc.credentialSubject?.id ||
                            "Unknown",
                          40
                        )}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            vc.subjectDid || vc.credentialSubject?.id,
                            "Subject DID"
                          )
                        }
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Copy subject DID"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* All Credential Types */}
                  {credentialTypes.length > 1 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        Credential Types
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {credentialTypes.map((type, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Raw JSON Display */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection("rawJson")}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span>📄</span>
                  <span className="font-medium text-gray-900">
                    Raw JSON Document
                  </span>
                  <span className="text-sm text-gray-500">
                    (Full credential data)
                  </span>
                </div>
                <span className="text-gray-400">
                  {expandedSections.rawJson ? "🔼" : "🔽"}
                </span>
              </button>

              {expandedSections.rawJson && (
                <div className="p-4">
                  <div className="bg-gray-200 rounded-lg p-4 overflow-auto">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-600">
                        Complete VC Document (W3C Format)
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            stringifyWithBigInt(vc.document || vc),
                            "Raw JSON"
                          )
                        }
                        className="px-3 py-1 bg-gray-500 hover:cursor-pointer hover:bg-gray-600 text-white text-xs rounded transition-colors"
                      >
                        📋 Copy JSON
                      </button>
                    </div>
                    <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-words">
                      <code>{stringifyWithBigInt(vc.document || vc)}</code>
                    </pre>
                  </div>

                  {/* Metadata Display if available */}
                  {vc.metadata && (
                    <div className="mt-4">
                      <div className="bg-blue-900 rounded-lg p-4 overflow-auto">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-blue-200">
                            On-Chain Metadata
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                stringifyWithBigInt(vc.metadata),
                                "Metadata JSON"
                              )
                            }
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                          >
                            📋 Copy Metadata
                          </button>
                        </div>
                        <pre className="text-xs text-blue-100 overflow-x-auto whitespace-pre-wrap break-words">
                          <code>{stringifyWithBigInt(vc.metadata)}</code>
                        </pre>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <p className="mb-1">
                      <strong>Document:</strong> The complete W3C Verifiable
                      Credential stored on IPFS
                    </p>
                    {vc.metadata && (
                      <p>
                        <strong>Metadata:</strong> On-chain metadata including
                        IPFS CID and indexing information
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!identity) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-blue-900 dark-text-yellow mb-4 text-center">
            Verifiable Credentials Manager
          </h1>
          <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">
            Please sign in with Internet Identity to manage your verifiable
            credentials.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-blue-900 dark-text-yellow mb-4 text-center">
          Verifiable Credentials Manager
        </h1>
        <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">
          Issue, manage, and verify decentralized credentials on the Internet
          Computer
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-8">
        <div className="backdrop-blur-md rounded-lg p-1">
          <button
            onClick={() => setActiveTab("received")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "received"
                ? "bg-white text-blue-600 dark-text-yellow border border-blue-200 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Received VCs ({(myReceivedVCs || []).length})
          </button>
          <button
            onClick={() => setActiveTab("issued")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "issued"
                ? "bg-white text-blue-600 dark-text-yellow border border-blue-200 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Issued VCs ({(myIssuedVCs || []).length})
          </button>
        </div>
      </div>

      {/* Issue VC Button */}
      {activeTab === "issued" && (
        <div className="text-center mb-8">
          <button
            onClick={() => setShowIssueForm(!showIssueForm)}
            className="bg-blue-900 darkcard text-white px-6 py-3 rounded-2xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            {showIssueForm ? "Cancel" : "Issue New VC"}
          </button>
        </div>
      )}

      {/* Issue VC Form */}
      {showIssueForm && (
        <div className="backdrop-blur-md darkcard rounded-xl p-6 shadow-lg mb-8 mt-20">
          <h2 className="text-xl font-semibold text-blue-900 dark-text-yellow mb-6">
            Issue New Verifiable Credential
          </h2>
          <form onSubmit={handleIssueVC} className="space-y-6 mt-20">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark-text-white mb-2">
                Recipient DID
              </label>
              <input
                type="text"
                value={issueForm.recipientDid}
                onChange={(e) =>
                  setIssueForm((prev) => ({
                    ...prev,
                    recipientDid: e.target.value,
                  }))
                }
                placeholder="did:icp:... or did:key:..."
                required
                className="w-full px-4 py-3 border border-blue-200 text-gray-700 dark-text-yellow rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent darkcard"
              />
            </div>

            {/* Credential Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark-text-white mb-2 mt-10">
                Credential Type
              </label>
              <div className="space-y-3">
                <select
                  value={issueForm.credentialTypes[1] || ""}
                  onChange={(e) => {
                    const newTypes = ["VerifiableCredential"];
                    if (e.target.value && e.target.value !== "custom") {
                      newTypes.push(e.target.value);
                    }
                    setIssueForm((prev) => ({
                      ...prev,
                      credentialTypes: newTypes,
                      customType:
                        e.target.value === "custom" ? prev.customType : "",
                    }));
                  }}
                  className="w-full px-4 py-3 darkcard text-gray-700 dark-text-yellow border border-blue-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">Select credential type...</option>
                  <option value="EducationalCredential">
                    Educational Credential
                  </option>
                  <option value="UniversityDegreeCredential">
                    University Degree
                  </option>
                  <option value="ProfessionalCertification">
                    Professional Certification
                  </option>
                  <option value="IdentityCredential">
                    Identity Credential
                  </option>
                  <option value="EmploymentCredential">
                    Employment Credential
                  </option>
                  <option value="AchievementCredential">
                    Achievement Credential
                  </option>
                  <option value="custom">Custom Type...</option>
                </select>

                {/* Custom type input */}
                {issueForm.credentialTypes.length === 1 &&
                  issueForm.customType !== undefined && (
                    <input
                      type="text"
                      value={issueForm.customType}
                      onChange={(e) =>
                        setIssueForm((prev) => ({
                          ...prev,
                          customType: e.target.value,
                        }))
                      }
                      placeholder="CustomCredentialType"
                      className="w-full px-4 py-3 text-gray-700 dark-text-yellow border border-blue-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  )}

                {/* Show selected types */}
                <div className="flex flex-wrap gap-2">
                  {issueForm.credentialTypes.map((type, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 darkcard text-blue-900 dark-text-white rounded-full text-sm font-medium border border-blue-200"
                    >
                      {type}
                    </span>
                  ))}
                  {issueForm.customType && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-900 dark-text-white rounded-full text-sm font-medium border border-blue-200">
                      {issueForm.customType}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark-text-white mb-8 mt-20">
                Credential Claim
              </label>
              <div className="space-y-3">
                {issueForm.claims.map((claim, index) => (
                  <div key={index} className="flex space-x-3">
                    <input
                      type="text"
                      value={claim.key}
                      onChange={(e) =>
                        updateClaimField(index, "key", e.target.value)
                      }
                      placeholder="Key (e.g., name, degree, university)"
                      className="flex-1 px-4 py-3 border border-blue-200 rounded-2xl text-gray-700 dark-text-yellow focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    <input
                      type="text"
                      value={claim.value}
                      onChange={(e) =>
                        updateClaimField(index, "value", e.target.value)
                      }
                      placeholder="Value (e.g., John Doe, Computer Science, MIT)"
                      className="flex-1 px-4 py-3 border border-blue-200 rounded-2xl text-gray-700 dark-text-yellow focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    {issueForm.claims.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeClaimField(index)}
                        className="px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 hover:border-red-300 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addClaimField}
                  className="w-full py-3 border-2 border-dashed border-blue-200 rounded-lg text-blue-900 dark-text-yellow hover:border-blue-400 hover:text-blue-700 font-medium transition-colors"
                >
                  + Add Another Claim
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark-text-white mb-8 mt-20">
                Expires in (hours)
              </label>
              <div className="flex space-x-4">
                <input
                  type="number"
                  value={issueForm.expiresInHours}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      expiresInHours: parseInt(e.target.value),
                    }))
                  }
                  min="1"
                  max="8760"
                  className="flex-1 px-4 py-3 text-gray-700 dark-text-yellow border border-blue-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <div className="flex space-x-2">
                  {[24, 168, 720, 8760].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() =>
                        setIssueForm((prev) => ({
                          ...prev,
                          expiresInHours: hours,
                        }))
                      }
                      className="px-3 py-2 text-sm text-yellow-500 bg-blue-100 hover:bg-gray-200 border hover:border-blue-200 rounded-2xl transition-colors"
                    >
                      {hours === 24
                        ? "1d"
                        : hours === 168
                        ? "1w"
                        : hours === 720
                        ? "1m"
                        : "1y"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-4 pt-4">
              <button
                type="submit"
                disabled={isIssuing}
                className="flex-1 bg-blue-900 hover:bg-blue-700 darkcard hover:to-purple-700 text-white hover:text-yellow-500 border border-blue-200 py-3 px-6 rounded-lg font-semibold disabled:opacity-50 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {isIssuing
                  ? "Issuing Credential..."
                  : "Issue Verifiable Credential"}
              </button>
              <button
                type="button"
                onClick={() => setShowIssueForm(false)}
                className="justify-center gap-2 flex hover:bg-gray-300 text-gray-700 dark-text-yellow py-3 px-6 rounded-lg font-semibold transition-colors"
              >
                <Delete/>Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading State */}
      {isLoadingVCs && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading credentials...</p>
        </div>
      )}

      {/* VCs Display */}
      {!isLoadingVCs && (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {activeTab === "received" && (myReceivedVCs || []).length === 0 && (
            <div className="col-span-full text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">📄</div>
              <p className="text-gray-500 text-lg">
                No received credentials found.
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Credentials issued to you will appear here.
              </p>
            </div>
          )}
          {activeTab === "issued" && (myIssuedVCs || []).length === 0 && (
            <div className="col-span-full text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">📋</div>
              <p className="text-gray-500 text-lg">
                No issued credentials found.
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Credentials you issue will appear here.
              </p>
            </div>
          )}

          {activeTab === "received" &&
            (myReceivedVCs || []).map((vc) => (
              <VCCard key={vc.id} vc={vc} isIssued={false} />
            ))}

          {activeTab === "issued" &&
            (myIssuedVCs || []).map((vc) => (
              <VCCard key={vc.id} vc={vc} isIssued={true} />
            ))}
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-mx-4 shadow-xl">
            <div className="text-center">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Revoke Verifiable Credential?
              </h3>
              <p className="text-gray-600 mb-6">
                This action cannot be undone. The credential will be permanently
                revoked and marked as invalid.
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={() => confirmRevokeVC(showRevokeConfirm)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors"
                >
                  Revoke Credential
                </button>
                <button
                  onClick={() => setShowRevokeConfirm(null)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VC Sharing Modal */}
      <VCSharer
        vc={sharingVC}
        isOpen={!!sharingVC}
        onClose={() => setSharingVC(null)}
      />
    </div>
  );
};

export default VCManager;
