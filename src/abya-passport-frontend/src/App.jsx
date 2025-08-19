// src/abya-passport-frontend/src/App.jsx

import "./App.css";
import React, { useState } from "react";
import Navbar from "./components/Navbar";
import DIDDocument from "./components/DIDDocument";
import VCManager from "./components/VCManager";
import VCVerifier from "./components/VCVerifier";
import EthrVcManager from "./components/EthrVcManager";
import SimulationPreview from "./components/SimulationPreview";

const ABYA = {
    blue: "#0b5c85",
    teal: "#0b7aa3",
    deepBlue: "#0b3d61",
    gold: "#d99b18",
    brightGold: "#f2b705",
};

function App() {
  const [currentPage, setCurrentPage] = useState("home");

  const renderPage = () => {
    switch (currentPage) {
      case "did":
        return <DIDDocument />;
      case "vc":
        return <VCManager />;
      case "ethr-vc":
        return <EthrVcManager />;
      case "verify":
        return <VCVerifier />;
      case "home":
      default:
        return (
          <div className="relative max-w-6xl mx-auto px-0 py-16">
            {/* Decorative background (z-0, absolutely positioned) */}
            <div className="absolute -top-32 -left-32 w-156 h-156 rounded-full bg-gradient-to-tr from-blue-200 to-teal-100 blur-3xl opacity-40 z-0" />
            <div className="absolute bottom-0 right-0 w-100 h-100 rounded-full bg-gradient-to-tr from-amber-100 to-yellow-200 blur-2xl opacity-40 z-0" />

            {/* Main content (z-10, relative) */}
            <div className="relative z-10">
              {/* Hero section: two columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center mb-40">
                {/* Left: hero text */}
                <div className="text-left">
                  <h3 className="font-bold tracking-tight text-yellow-500 animate-fadein">ABYA PASSPORT</h3>
                  <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-blue-900 animate-fadein delay-100">
                    Your identity, <span className="text-yellow-500">unlocked</span>
                  </h1>
                  <p className="text-lg sm:text-xl text-blue-800 mt-6 mb-2 animate-fadein delay-200">
                    <span className="font-semibold">A new era of digital identity.</span>
                  </p>
                  <p className="text-xl text-gray-600 mb-8 animate-fadein delay-300">
                    Create, issue, manage and verify verifiable credentials with ABYA Passport — a lightweight, developer-friendly platform for the Web3 era.
                  </p>
                  <button
                    className="mt-4 px-8 py-3 bg-yellow-500 text-white rounded-xl font-bold text-lg shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-pulse-glow hover:scale-105 hover:shadow-2xl active:scale-95"
                    onClick={() => setCurrentPage('did')}
                    aria-label="Get Started with ABYA Passport"
                  >
                    <span className="flex items-center gap-2">
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" className="inline-block"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff" stroke="#0b5c85" strokeWidth="1.5"/><rect x="7" y="9" width="4" height="4" rx="2" fill="#f0ce00"/><rect x="13" y="11" width="4" height="2" rx="1" fill="#f0ce00"/></svg>
                      Get Started
                    </span>
                  </button>
                </div>
                {/* Right: SimulationPreview */}
                <div className="flex justify-center">
                  <SimulationPreview />
                </div>
              </div>

              {/* Cards Components section */}
              <h1 className="font-bold text-4xl text-blue-900 mb-4 animate-fadein delay-400">Features</h1>
              <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">Explore the key features of ABYA Passport to enhance your identity management experience.</p>
              <div className="grid md:grid-cols-3 gap-8 mt-16">
                {/* Card 1 */}
                <div className="relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card animate-fadein delay-600">
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd"/><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd"/><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215"/></svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path fill="#f0ce00" fill-rule="evenodd" d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z" clip-rule="evenodd"/><path fill="#f0ce00" fill-rule="evenodd" d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412" clip-rule="evenodd"/><path fill="#f0ce00" d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215"/></svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 mb-2 text-center">Internet Identity</h3>
                  <p className="text-blue-900 text-sm text-center mb-2">Secure, decentralized authentication powered by the Internet Computer Protocol</p>
                </div>

                {/* Card 2 */}
                <div className="relative group bg-gradient-to-br from-blue-100 to-white border border-blue-200 rounded-2xl p-7 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card animate-fadein delay-700">
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24"><g fill="none" stroke="#f0ce00" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M3 14.25v9M16.478 2.144A8.3 8.3 0 0 0 11.888.75C7.37.75 3.613 4.453 3.072 9.2M21 23.25V10.375A10.2 10.2 0 0 0 20.023 6"/><path d="M18 15.75v-4.5c0-3.713-2.7-6.75-6-6.75s-6 3.037-6 6.75v12m12 0v-4.5m-9-1.5v6"/><path d="M15 23.25V12c0-2.063-1.35-3.75-3-3.75S9 9.937 9 12v2.25m3 6v3m0-12v6"/></g></svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><g fill="none" stroke="#f0ce00" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M3 14.25v9M16.478 2.144A8.3 8.3 0 0 0 11.888.75C7.37.75 3.613 4.453 3.072 9.2M21 23.25V10.375A10.2 10.2 0 0 0 20.023 6"/><path d="M18 15.75v-4.5c0-3.713-2.7-6.75-6-6.75s-6 3.037-6 6.75v12m12 0v-4.5m-9-1.5v6"/><path d="M15 23.25V12c0-2.063-1.35-3.75-3-3.75S9 9.937 9 12v2.25m3 6v3m0-12v6"/></g></svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 mb-2 text-center">Decentralized Identity</h3>
                  <p className="text-blue-900 text-sm text-center mb-2">W3C-compliant Decentralized Identity Documents for verifiable credentials</p>
                </div>

                {/* Card 3 */}
                <div className="relative group bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-2xl p-7 shadow-lg hover:shadow-2xl transition-all duration-200 overflow-hidden feature-card animate-fadein delay-800">
                  <div className="absolute -top-4 -right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 32 32"><path fill="#f0ce00" d="M16 22a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0-6a2 2 0 1 1-2 2a2 2 0 0 1 2-2M14 6h4v2h-4z"/><path fill="#f0ce00" d="M24 2H8a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2.003 2.003 0 0 0 2-2V4a2 2 0 0 0-2-2m-4 26h-8v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1Zm2 0v-2a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2H8V4h16v24Z"/></svg>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-5 mx-auto shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32"><path fill="#f0ce00" d="M16 22a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0-6a2 2 0 1 1-2 2a2 2 0 0 1 2-2M14 6h4v2h-4z"/><path fill="#f0ce00" d="M24 2H8a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h16a2.003 2.003 0 0 0 2-2V4a2 2 0 0 0-2-2m-4 26h-8v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1Zm2 0v-2a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2H8V4h16v24Z"/></svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900 mb-2 text-center">Verifiable Credentials</h3>
                  <p className="text-blue-900 text-sm text-center mb-2">Issue, manage, and verify digital credentials with cryptographic proof</p>
                </div>
              </div>

              {/* Buttons Components section - yellow and blue theme, updated icons */}
              <div className="mt-14 flex flex-wrap justify-center gap-6 animate-fadein delay-900">
                <button
                  onClick={() => setCurrentPage("did")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 animate-btn-glow"
                  aria-label="View DID Documents"
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" className="inline-block"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff" stroke="#0b5c85" strokeWidth="1.5"/><rect x="7" y="9" width="4" height="4" rx="2" fill="#f0ce00"/><rect x="13" y="11" width="4" height="2" rx="1" fill="#f0ce00"/></svg>
                  View DID Documents
                </button>
                <button
                  onClick={() => setCurrentPage("vc")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-btn-glow"
                  aria-label="ICP Credentials"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><g fill="none" stroke="#0b5c85" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><path d="M3 14.25v9M16.478 2.144A8.3 8.3 0 0 0 11.888.75C7.37.75 3.613 4.453 3.072 9.2M21 23.25V10.375A10.2 10.2 0 0 0 20.023 6"/><path d="M18 15.75v-4.5c0-3.713-2.7-6.75-6-6.75s-6 3.037-6 6.75v12m12 0v-4.5m-9-1.5v6"/><path d="M15 23.25V12c0-2.063-1.35-3.75-3-3.75S9 9.937 9 12v2.25m3 6v3m0-12v6"/></g></svg>
                  ICP Credentials
                </button>
                <button
                  onClick={() => setCurrentPage("ethr-vc")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 animate-btn-glow"
                  aria-label="Ethereum VCs"
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" className="inline-block"><polygon points="12,2 19,12 12,22 5,12" fill="#0b5c85"/><polygon points="12,2 12,22 19,12" fill="#f0ce00"/></svg>
                  Ethereum VCs
                </button>
                <button
                  onClick={() => setCurrentPage("verify")}
                  className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 px-7 py-3 rounded-2xl font-bold text-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-btn-glow"
                  aria-label="Verify Credentials"
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" className="inline-block"><path d="M12 3l7 4v5c0 5-3.5 9-7 9s-7-4-7-9V7l7-4z" fill="#0b5c85"/><path d="M9.5 12.5l2 2l3-3" stroke="#f0ce00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Verify Credentials
                </button>
              {/* Testimonials / Trusted by section */}
              <div className="mt-24 animate-fadein delay-1000">
                <h2 className="text-2xl font-bold text-blue-900 mb-6 text-center">Trusted by developers and organizations</h2>
                <div className="flex flex-wrap justify-center gap-8 items-center">
                  <div className="flex flex-col items-center">
                    <img src="/src/assets/abya.png" alt="ABYA University" className="w-16 h-16 rounded-full shadow-md mb-2" />
                    <span className="text-blue-900 font-semibold text-sm">ABYA University</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <img src="/src/assets/react.svg" alt="React" className="w-16 h-16 rounded-full shadow-md mb-2" />
                    <span className="text-blue-900 font-semibold text-sm">React Devs</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-2"><circle cx="12" cy="12" r="10" stroke="#0b5c85" strokeWidth="2"/><path d="M8 12l2 2l4-4" stroke="#f0ce00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-blue-900 font-semibold text-sm">Web3 Builders</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-2"><rect x="4" y="4" width="16" height="16" rx="4" stroke="#0b5c85" strokeWidth="2"/><path d="M8 12h8" stroke="#f0ce00" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span className="text-blue-900 font-semibold text-sm">Open Source</span>
                  </div>
                </div>
              </div>
      {/* Back to top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed right-6 bottom-24 z-40 p-3 rounded-full bg-blue-900 text-yellow-400 shadow-lg hover:bg-yellow-400 hover:text-blue-900 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 animate-fadein delay-1200"
        aria-label="Back to top"
        style={{ display: 'block' }}
      >
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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

      {/* Floating help CTA */}
      <button
        onClick={() => window.alert('Need help? Join Discord')}
        className="fixed right-6 bottom-6 z-50 px-4 py-3 rounded-full shadow-lg flex items-center gap-3"
        style={{ background: `linear-gradient(90deg, ${ABYA.deepBlue}, ${ABYA.brightGold})`, color: 'white' }}
        aria-label="Help"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm1.07-7.75c-.9.52-1.07.88-1.07 1.75h-2v-.5c0-1.2.6-2 1.6-2.6 1-.6 1.4-1.1 1.4-1.9 0-1.1-.9-2-2-2s-2 .9-2 2H9c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.2-.5 1.9-1.93 2.75z" />
        </svg>
        <span className="text-sm font-semibold">Help</span>
      </button>

      {/* Footer */}
      <footer className="mt-24 py-8 border-t border-gray-100 bg-white/80 text-center text-sm text-gray-500">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 px-4">
          <div>
            &copy; {new Date().getFullYear()} ABYA Passport. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/abya-university" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-colors">GitHub</a>
            <a href="https://discord.gg/t7fUu62h58" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-colors">Discord</a>
            <a href="https://www.linkedin.com/company/abyauniversity/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-colors">Linkedin</a>
            <a href="mailto:hello@abya.id" className="hover:text-blue-700 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
