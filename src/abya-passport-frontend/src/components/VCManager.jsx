import React, { useState, useEffect } from "react";
import { useInternetIdentity } from "../contetxs/InternetContext";

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

  const [activeTab, setActiveTab] = useState("received");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [verificationResults, setVerificationResults] = useState({});
  const [isVerifying, setIsVerifying] = useState({});

  // Issue VC form state
  const [issueForm, setIssueForm] = useState({
    recipientDid: "",
    claims: [{ key: "", value: "" }],
    expiresInHours: 24,
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

      await issueVC(
        issueForm.recipientDid,
        claimsObject,
        issueForm.expiresInHours
      );

      // Reset form
      setIssueForm({
        recipientDid: "",
        claims: [{ key: "", value: "" }],
        expiresInHours: 24,
      });
      setShowIssueForm(false);
      alert("VC issued successfully!");
    } catch (error) {
      console.error("Error issuing VC:", error);
      alert("Error issuing VC: " + error.message);
    } finally {
      setIsIssuing(false);
    }
  };

  // Handle VC verification
  const handleVerifyVC = async (vcId) => {
    setIsVerifying((prev) => ({ ...prev, [vcId]: true }));

    try {
      const result = await verifyVC(vcId);
      setVerificationResults((prev) => ({ ...prev, [vcId]: result }));
    } catch (error) {
      console.error("Error verifying VC:", error);
      alert("Error verifying VC: " + error.message);
    } finally {
      setIsVerifying((prev) => ({ ...prev, [vcId]: false }));
    }
  };

  // Handle VC revocation
  const handleRevokeVC = async (vcId) => {
    if (
      !confirm(
        "Are you sure you want to revoke this VC? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const success = await revokeVC(vcId);
      if (success) {
        alert("VC revoked successfully!");
      } else {
        alert("Failed to revoke VC. You may not be the issuer.");
      }
    } catch (error) {
      console.error("Error revoking VC:", error);
      alert("Error revoking VC: " + error.message);
    }
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(parseInt(timestamp) / 1000000);
    return date.toLocaleString();
  };

  // VC Card Component
  const VCCard = ({ vc, isIssued = false }) => {
    const isVerified = verificationResults[vc.id];
    const isVerifyingVC = isVerifying[vc.id];

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Verifiable Credential
            </h3>
            <p className="text-sm text-gray-500 font-mono">{vc.id}</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleVerifyVC(vc.id)}
              disabled={isVerifyingVC}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50"
            >
              {isVerifyingVC ? "Verifying..." : "Verify"}
            </button>
            {isIssued && (
              <button
                onClick={() => handleRevokeVC(vc.id)}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors"
              >
                Revoke
              </button>
            )}
          </div>
        </div>

        {/* Verification Status */}
        {isVerified && (
          <div
            className={`mb-4 p-3 rounded-lg ${
              isVerified.isValid
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isVerified.isValid ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              <span
                className={`text-sm font-medium ${
                  isVerified.isValid ? "text-green-800" : "text-red-800"
                }`}
              >
                {isVerified.isValid ? "Valid" : "Invalid"}
              </span>
            </div>
            {isVerified.errors.length > 0 && (
              <div className="text-xs text-red-600">
                Errors: {isVerified.errors.join(", ")}
              </div>
            )}
            <div className="text-xs text-gray-600">
              Expired: {isVerified.isExpired ? "Yes" : "No"} | Signature:{" "}
              {isVerified.signatureValid ? "Valid" : "Invalid"}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {isIssued ? "Recipient" : "Issuer"}
            </span>
            <p className="text-sm text-gray-800 font-mono break-all">
              {isIssued ? vc.credentialSubject.id : vc.issuer}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Claims
            </span>
            <div className="mt-1 space-y-1">
              {Object.entries(vc.credentialSubject)
                .filter(([key]) => key !== "id")
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600 capitalize">{key}:</span>
                    <span className="text-gray-800 font-medium">{value}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-500">
            <div>
              <span>Issued: </span>
              {formatDate(vc.issuanceDate)}
            </div>
            {vc.expirationDate && (
              <div>
                <span>Expires: </span>
                {formatDate(vc.expirationDate)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!identity) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Verifiable Credentials Manager
          </h1>
          <p className="text-gray-600 mb-8">
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Verifiable Credentials Manager
        </h1>
        <p className="text-gray-600">
          Issue, manage, and verify decentralized credentials on the Internet
          Computer
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("received")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "received"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Received VCs ({myReceivedVCs.length})
          </button>
          <button
            onClick={() => setActiveTab("issued")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "issued"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Issued VCs ({myIssuedVCs.length})
          </button>
        </div>
      </div>

      {/* Issue VC Button */}
      {activeTab === "issued" && (
        <div className="text-center mb-8">
          <button
            onClick={() => setShowIssueForm(!showIssueForm)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            {showIssueForm ? "Cancel" : "Issue New VC"}
          </button>
        </div>
      )}

      {/* Issue VC Form */}
      {showIssueForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Issue New Verifiable Credential
          </h2>
          <form onSubmit={handleIssueVC} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                placeholder="did:icp:..."
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Claims
              </label>
              {issueForm.claims.map((claim, index) => (
                <div key={index} className="flex space-x-2 mb-2">
                  <input
                    type="text"
                    value={claim.key}
                    onChange={(e) =>
                      updateClaimField(index, "key", e.target.value)
                    }
                    placeholder="Key (e.g., name)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={claim.value}
                    onChange={(e) =>
                      updateClaimField(index, "value", e.target.value)
                    }
                    placeholder="Value (e.g., John Doe)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {issueForm.claims.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeClaimField(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addClaimField}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + Add Claim
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expires in (hours)
              </label>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={isIssuing}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium disabled:opacity-50"
              >
                {isIssuing ? "Issuing..." : "Issue VC"}
              </button>
              <button
                type="button"
                onClick={() => setShowIssueForm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg font-medium"
              >
                Cancel
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {activeTab === "received" && myReceivedVCs.length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">No received credentials found.</p>
            </div>
          )}
          {activeTab === "issued" && myIssuedVCs.length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">No issued credentials found.</p>
            </div>
          )}

          {activeTab === "received" &&
            myReceivedVCs.map((vc) => (
              <VCCard key={vc.id} vc={vc} isIssued={false} />
            ))}

          {activeTab === "issued" &&
            myIssuedVCs.map((vc) => (
              <VCCard key={vc.id} vc={vc} isIssued={true} />
            ))}
        </div>
      )}
    </div>
  );
};

export default VCManager;
