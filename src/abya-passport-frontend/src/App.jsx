import "./App.css";
import React, { useState } from "react";
import Navbar from "./components/Navbar";
import DIDDocument from "./components/DIDDocument";
import VCManager from "./components/VCManager";

function App() {
  const [currentPage, setCurrentPage] = useState("home");

  const renderPage = () => {
    switch (currentPage) {
      case "did":
        return <DIDDocument />;
      case "vc":
        return <VCManager />;
      case "home":
      default:
        return (
          <div className="max-w-4xl mx-auto px-6 py-16">
            <div className="text-center">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
                Welcome to ABYA Passport
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Your Decentralized Identity on the Internet Computer
              </p>

              <div className="grid md:grid-cols-3 gap-6 mt-12">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-blue-600 mb-4">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="mx-auto"
                    >
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Internet Identity
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Secure, decentralized authentication powered by the Internet
                    Computer Protocol
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-purple-600 mb-4">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="mx-auto"
                    >
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    DID Documents
                  </h3>
                  <p className="text-gray-600 text-sm">
                    W3C-compliant Decentralized Identity Documents for
                    verifiable credentials
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-green-600 mb-4">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="mx-auto"
                    >
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Verifiable Credentials
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Issue, manage, and verify digital credentials with
                    cryptographic proof
                  </p>
                </div>
              </div>

              <div className="mt-12 space-x-4">
                <button
                  onClick={() => setCurrentPage("did")}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  View DID Documents
                </button>
                <button
                  onClick={() => setCurrentPage("vc")}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Manage Credentials
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className="pt-24">{renderPage()}</div>
    </>
  );
}

export default App;
