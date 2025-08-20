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
    <div className="relative group bg-transparent border border-blue-200 rounded-2xl max-w-4xl mx-auto p-8 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card backdrop-blur-xl mt-12">
      <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd" /><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd" /><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215" /></svg>
      </div>
      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 darkcard mb-8 mx-auto shadow-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd" /><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd" /><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215" /></svg>
      </div>
      <h1 className="text-3xl font-bold text-blue-900 dark-text-yellow mb-6 text-center">
        Internet Identity DID Resolver
      </h1>
      <p className="text-xl text-gray-600 mb-8 text-center">
        View and resolve Decentralized Identity Documents on the Internet
        Computer
      </p>

      {/* Current User DID Section */}
      {principal && (
        <div className="bg-white/80 border border-blue-200 rounded-xl p-6 mb-8 shadow-inner">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <div className="text-blue-900 text-base text-center w-full">
              <span className="font-semibold">Principal:</span>
              <span className="ml-2 break-all">{principal}</span>
            </div>
            {did && (
              <div className="text-blue-900 text-base text-center w-full">
                <span className="font-semibold">Your DID:</span>
                <span className="ml-2 break-all">{did}</span>
                <button
                  onClick={() => copyToClipboard(did)}
                  className="ml-2 text-gray-400 hover:text-blue-600 transition-colors p-1"
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
            )}
          </div>
          <button
            onClick={() => resolveDid()}
            disabled={isResolvingDid}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
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
      )}

      {/* Custom DID Resolution */}
      <div className="bg-white/80 border border-blue-200 rounded-2xl darkcard p-6 mb-8 shadow-inner">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={customDid}
            onChange={(e) => setCustomDid(e.target.value)}
            placeholder="Enter DID (e.g., did:icp:rrkah-fqaaa-aaaaa-aaaaq-cai)"
            className="flex-1 px-4 py-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
          <button
            onClick={handleCustomResolve}
            disabled={!customDid.trim() || isResolvingDid}
            className={`
              px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 disabled:opacity-100 border
              ${
                typeof window !== "undefined" && window.matchMedia('(prefers-color-scheme: dark)').matches
                  ? 'bg-yellow-400 border-yellow-400 text-blue-900 hover:bg-yellow-500 hover:border-yellow-500 hover:text-blue-900'
                  : 'bg-blue-900 border-blue-400 text-gray-100 hover:bg-blue-700 hover:border-blue-500 hover:text-yellow-300'
              }
            `}
          >
            Resolve
          </button>
        </div>
      </div>

      {/* DID Document Display */}
      {didDocument && (
        <div className="bg-gray-50 border border-blue-200 rounded-2xl p-6 shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-blue-900">
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
                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Identity</h3>
                  <p className="text-sm text-gray-600 mb-1">DID:</p>
                  <code className="text-sm bg-gray-50 p-2 rounded border block break-all">
                    {didDocument.id}
                  </code>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Context</h3>
                  <p className="text-sm text-gray-600 mb-1">Specification:</p>
                  <code className="text-sm bg-gray-50 p-2 rounded border block break-all">
                    {didDocument["@context"]}
                  </code>
                </div>
              </div>

              {/* Verification Methods */}
              {didDocument.verificationMethod && (
                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-3">
                    Verification Methods
                  </h3>
                  {didDocument.verificationMethod.map((method, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 rounded border p-3 mb-3 last:mb-0"
                    >
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">ID:</span>
                          <code className="block bg-white p-1 rounded mt-1 break-all">
                            {method.id}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Type:</span>
                          <code className="block bg-white p-1 rounded mt-1">
                            {method.type}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Controller:</span>
                          <code className="block bg-white p-1 rounded mt-1 break-all">
                            {method.controller}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-600">Public Key:</span>
                          <code className="block bg-white p-1 rounded mt-1 break-all">
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
                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">
                    Authentication
                  </h3>
                  <div className="space-y-1">
                    {didDocument.authentication.map((auth, index) => (
                      <code
                        key={index}
                        className="block text-sm bg-gray-50 p-2 rounded border break-all"
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