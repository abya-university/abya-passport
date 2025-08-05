import React, { useState, useEffect } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";

const DIDDocument = () => {
  const { did, didDocument, isResolvingDid, resolveDid, principal } =
    useInternetIdentity();

  const [customDid, setCustomDid] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);

  // Auto-resolve when component mounts and DID is available
  useEffect(() => {
    if (did && !didDocument) {
      resolveDid();
    }
  }, [did]);

  const handleCustomResolve = async () => {
    if (customDid.trim()) {
      await resolveDid(customDid.trim());
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const formatJson = (obj) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          DID Document Resolver
        </h1>
        <p className="text-gray-600">
          View and resolve Decentralized Identity Documents on the Internet
          Computer
        </p>
      </div>

      {/* Current User DID Section */}
      {principal && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-blue-600"
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Your DID</h2>
              <p className="text-sm text-gray-600">
                Your personal decentralized identity
              </p>
            </div>
          </div>

          {did ? (
            <div className="space-y-3">
              <div className="bg-white/70 rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                    DID Identifier
                  </span>
                  <button
                    onClick={() => copyToClipboard(did)}
                    className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                    title="Copy DID"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                    </svg>
                  </button>
                </div>
                <code className="text-sm text-gray-700 break-all">{did}</code>
              </div>

              <button
                onClick={() => resolveDid()}
                disabled={isResolvingDid}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isResolvingDid ? (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="animate-spin"
                    >
                      <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" />
                    </svg>
                    Resolving...
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resolve My DID Document
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-600">
                Please connect with Internet Identity to view your DID
              </p>
            </div>
          )}
        </div>
      )}

      {/* Custom DID Resolution */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Resolve Any DID
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={customDid}
            onChange={(e) => setCustomDid(e.target.value)}
            placeholder="Enter DID (e.g., did:icp:rrkah-fqaaa-aaaaa-aaaaq-cai)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={handleCustomResolve}
            disabled={!customDid.trim() || isResolvingDid}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Resolve
          </button>
        </div>
      </div>

      {/* DID Document Display */}
      {didDocument && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              DID Document
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                {showRawJson ? "Pretty View" : "Raw JSON"}
              </button>
              <button
                onClick={() => copyToClipboard(formatJson(didDocument))}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {showRawJson ? (
            <pre className="bg-gray-50 border rounded-lg p-4 text-sm overflow-x-auto">
              <code className="text-left">{formatJson(didDocument)}</code>
            </pre>
          ) : (
            <div className="space-y-4">
              {/* DID Info */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-2">Identity</h3>
                  <p className="text-sm text-gray-600 mb-1">DID:</p>
                  <code className="text-sm bg-white p-2 rounded border block break-all">
                    {didDocument.id}
                  </code>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-2">Context</h3>
                  <p className="text-sm text-gray-600 mb-1">Specification:</p>
                  <code className="text-sm bg-white p-2 rounded border block break-all">
                    {didDocument["@context"]}
                  </code>
                </div>
              </div>

              {/* Verification Methods */}
              {didDocument.verificationMethod && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-3">
                    Verification Methods
                  </h3>
                  {didDocument.verificationMethod.map((method, index) => (
                    <div
                      key={index}
                      className="bg-white rounded border p-3 mb-3 last:mb-0"
                    >
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">ID:</span>
                          <code className="block bg-gray-50 p-1 rounded mt-1 break-all">
                            {method.id}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Type:</span>
                          <code className="block bg-gray-50 p-1 rounded mt-1">
                            {method.type}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Controller:</span>
                          <code className="block bg-gray-50 p-1 rounded mt-1 break-all">
                            {method.controller}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Public Key:</span>
                          <code className="block bg-gray-50 p-1 rounded mt-1 break-all">
                            {method.publicKeyMultibase}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Authentication */}
              {didDocument.authentication && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-2">
                    Authentication
                  </h3>
                  <div className="space-y-1">
                    {didDocument.authentication.map((auth, index) => (
                      <code
                        key={index}
                        className="block text-sm bg-white p-2 rounded border break-all"
                      >
                        {auth}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isResolvingDid && !didDocument && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-3 text-gray-600">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="animate-spin"
            >
              <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" />
            </svg>
            Resolving DID Document...
          </div>
        </div>
      )}

      {/* No Document State */}
      {!didDocument && !isResolvingDid && principal && (
        <div className="text-center py-8 text-gray-500">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="mx-auto mb-3 opacity-50"
          >
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
          </svg>
          <p>No DID document resolved yet</p>
          <p className="text-sm">Resolve a DID to view its document</p>
        </div>
      )}
    </div>
  );
};

export default DIDDocument;