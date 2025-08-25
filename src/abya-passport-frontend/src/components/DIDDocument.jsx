import React, { useState } from "react";
import IcpDocument from "./IcpDIDDoc";
import EthrDocument from "./EthrDIDDoc";
import { useInternetIdentity } from "../contexts/InternetContext";
// import KeyDocument from "./KeyDIDDoc";
// import WebDocument from "./WebDIDDoc";

const DIDDocument = () => {
  const context = useInternetIdentity();
  const [currentPage, setCurrentPage] = useState("home");

  // Add defensive check
  if (!context) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            ⚠️ Error: Internet Identity context not available
          </div>
          <p className="text-gray-600">
            Please make sure the InternetIdentityProvider is properly set up.
          </p>
        </div>
      </div>
    );
  }

  const { did, didDocument, isResolvingDid, resolveDid, principal } = context;

  const renderPage = () => {
    switch (currentPage) {
      case "icp":
        return <IcpDocument onBack={() => setCurrentPage("home")} />;
      case "ethr":
        return <EthrDocument onBack={() => setCurrentPage("home")} />;
      // case "key":
      //   return <KeyDocument onBack={() => setCurrentPage("home")} />;
      // case "web":
      //   return <WebDocument onBack={() => setCurrentPage("home")} />;
      case "home":
      default:
        return (
          <div className="max-w-screen-xl mx-auto px-6 py-16">
            <div className="text-center">
              <h1 className="text-5xl font-bold text-blue-900 dark-text-yellow mb-4 text-center">
                Resolve Decentralized Identities
              </h1>
              <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">
                Explore and manage your DIDs across multiple networks
              </p>

              <div className="grid md:grid-cols-4 gap-6 mt-12">
                {/* ICP Card */}
                <button
                  onClick={() => setCurrentPage("icp")}
                  className={"relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card backdrop-blur-xl"}
                >
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd" /><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd" /><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215" /></svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd" /><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd" /><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 dark-text-yellow mb-2 text-center">
                    Internet Identity (ICP)
                  </h3>
                  <p className="text-blue-900 dark-text-white text-sm text-center mb-2">
                    Authenticate and resolve your Internet Identity DID on the
                    Internet Computer using ABYA's secure integration.
                  </p>
                </button>

                {/* Ethr Card */}
                <button
                  onClick={() => setCurrentPage("ethr")}
                  className="relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card backdrop-blur-xl"
                >
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
                    <svg width="100" height="100" fill="none" viewBox="0 0 24 24" className="inline-block"><polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" /><polygon points="12,2 12,22 19,12" fill="#f0ce00" /></svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" className="inline-block"><polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" /><polygon points="12,2 12,22 19,12" fill="#f0ce00" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 dark-text-yellow mb-2 text-center">
                    Ethr DID (Ethereum)
                  </h3>
                  <p className="text-blue-900 dark-text-white text-sm text-center mb-2">
                    Manage and verify your Ethr DID documents on Ethereum, fully
                    W3C-compliant for verifiable credentials.
                  </p>
                </button>

                {/* Key DID Placeholder */}
                <div className="relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg transition-shadow opacity-70 cursor-not-allowed overflow-hidden feature-card backdrop-blur-xl" title="Unavailable - Coming soon!">
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="#f0ce00"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="mx-auto text-green-600 dark:text-yellow-400"
                    >
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 dark-text-yellow mb-2 text-center">
                    Key DID
                  </h3>
                  <p className="text-blue-900 dark-text-white text-sm text-center mb-2">
                    Issue, manage, and verify your Key-based DIDs with
                    cryptographic proofs.
                  </p>
                </div>

                {/* Web DID Placeholder */}
                <div className="relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg transition-shadow opacity-70 cursor-not-allowed overflow-hidden feature-card backdrop-blur-xl" title="Unavailable - Coming soon!">
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200 pointer-events-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="#f0ce00"
                        d="M19 4h-4.18C14.4 2.84 13.3 2 12 2s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-.45-1-.55-1-1 .45-1 1-1zm5 14H6V8h12v10z"
                      />
                    </svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="mx-auto text-blue-400 dark:text-yellow-400"
                    >
                      <path d="M19 4h-4.18C14.4 2.84 13.3 2 12 2s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-.45-1-.55-1-1 .45-1 1-1zm5 14H6V8h12v10z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 dark-text-yellow mb-2 text-center">
                    Web DID
                  </h3>
                  <p className="text-blue-900 dark-text-white text-sm text-center mb-2">
                    Create and resolve Web DIDs over HTTP, offering universal
                    decentralized identifiers.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap justify-center space-x-4">
                <button
                  onClick={() => setCurrentPage("icp")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-btn-glow"
                  aria-label="ICP Credentials"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path fill="#154c79" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd" /><path fill="#154c79" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd" /><path fill="#154c79" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215" /></svg>
                  View ICP Documents
                </button>

                <button
                  onClick={() => setCurrentPage("ethr")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 animate-btn-glow"
                  aria-label="Ethereum VCs"
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" className="inline-block"><polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85" /><polygon points="12,2 12,22 19,12" fill="#f0ce00" /></svg>
                  View Ethr Documents
                </button>

                {/*
                <button
                  onClick={() => setCurrentPage("key")}
                  className="bg-white border border-green-600 text-green-600 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow hover:shadow-lg"
                >
                  View Key Documents
                </button>
                <button
                  onClick={() => setCurrentPage("web")}
                  className="bg-white border border-blue-400 text-blue-400 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow hover:shadow-lg"
                >
                  View Web DIDs
                </button>
                */}
              </div>
            </div>
          </div>
        );
    }
  };

  return renderPage();
};

export default DIDDocument;
