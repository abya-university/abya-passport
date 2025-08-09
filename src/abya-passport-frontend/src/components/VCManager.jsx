import React, { useState } from "react";
import IcpCredential from "./IcpVcManager";
import EthrCredential from "./EthrVcManager";
// import KeyVcManager from "./KeyVcManager";
// import WebVcManager from "./WebVcManager";

export default function Credential() {
  const [currentPage, setCurrentPage] = useState("home");

  const renderPage = () => {
    switch (currentPage) {
      case "icp":
        return <IcpCredential onBack={() => setCurrentPage("home")} />;
      case "ethr":
        return <EthrCredential onBack={() => setCurrentPage("home")} />;
      // case "key":
      //   return <KeyVcManager onBack={() => setCurrentPage("home")} />;
      // case "web":
      //   return <WebVcManager onBack={() => setCurrentPage("home")} />;
      case "home":
      default:
        return (
          <div className="max-w-screen-xl mx-auto px-6 py-16">
            <div className="text-center">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
                Issue & Manage Verifiable Credentials
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Seamlessly issue, present, and verify W3C-compliant Verifiable Credentials across multiple decentralized identity networks.
              </p>

              <div className="grid md:grid-cols-4 gap-6 mt-12">
                {/* ICP Verifiable Credential Card */}
                <button
                  onClick={() => setCurrentPage("icp")}
                  className="bg-white border border-gray-200 rounded-xl p-6 shadow-lg hover:shadow-2xl transition-shadow text-left"
                >
                  <div className="text-blue-600 mb-4">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    ICP Verifiable Credential
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Issue, present, and verify Internet Identity credentials on the Internet Computer, leveraging ABYA's secure W3C VC integration.
                  </p>
                </button>

                {/* Ethr Verifiable Credential Card */}
                <button
                  onClick={() => setCurrentPage("ethr")}
                  className="bg-white border border-gray-200 rounded-xl p-6 shadow-lg hover:shadow-2xl transition-shadow text-left"
                >
                  <div className="text-purple-600 mb-4">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Ethr Verifiable Credential
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Create and verify Ethr DID credentials on Ethereum, fully W3C-compliant for decentralized identity workflows.
                  </p>
                </button>

                {/* Key DID VC Placeholder */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-lg transition-shadow opacity-50 cursor-not-allowed">
                  <div className="text-green-600 mb-4">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Key-based Verifiable Credential
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Coming soon: Issue and manage key-based DIDs with verifiable credential proofs.
                  </p>
                </div>

                {/* Web DID VC Placeholder */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-lg transition-shadow opacity-50 cursor-not-allowed">
                  <div className="text-blue-400 mb-4">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="mx-auto">
                      <path d="M19 4h-4.18C14.4 2.84 13.3 2 12 2s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-.45-1-.55-1-1 .45-1 1-1zm5 14H6V8h12v10z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Web-based Verifiable Credential
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Coming soon: Create and resolve Web DIDs with W3C Verifiable Credentials over HTTP.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap justify-center space-x-4">
                <button
                  onClick={() => setCurrentPage("icp")}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-md hover:shadow-xl transform hover:scale-105"
                >
                  ICP VC Manager
                </button>
                <button
                  onClick={() => setCurrentPage("ethr")}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-md hover:shadow-xl transform hover:scale-105"
                >
                  Ethr VC Manager
                </button>
                {/*
                <button
                  onClick={() => setCurrentPage("key")}
                  className="bg-white border border-green-600 text-green-600 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow hover:shadow-lg"
                >
                  Key VC Manager
                </button>
                <button
                  onClick={() => setCurrentPage("web")}
                  className="bg-white border border-blue-400 text-blue-400 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow hover:shadow-lg"
                >
                  Web VC Manager
                </button>
                */}
              </div>
            </div>
          </div>
        );
    }
  };

  return renderPage();
}