// src/abya-passport-frontend/src/components/Navbar.jsx

import React, { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useEthr } from "../contexts/EthrContext";

const API_URL = process.env.REACT_APP_VERAMO_API_URL || "http://localhost:3000";

function Navbar({ currentPage, setCurrentPage }) {
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  //const [walletDid, setWalletDid] = useState(null);
  const { setWalletAddress, setWalletDid, walletDid: ctxDid } = useEthr();
  const [walletDid, localSetWalletDid] = useState(ctxDid);
  const [didLoading, setDidLoading] = useState(false);
  const dropdownRef = useRef(null);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { did, principal, isAuthenticating, login, developerLogin, logout } =
    useInternetIdentity();
  
  const canisterId = "uxrrr-q7777-77774-qaaaq-cai";

  console.log("DID2:", did);
  console.log("Principal:", principal);
  console.log("Canister ID:", canisterId);

  // Shorteners
  const shortenAddress = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "");
  const shorten = (str) =>
    str
      ? str.length > 10
        ? `${str.slice(0, 16)}…${str.slice(-6)}`
        : str
      : "";

  // Fetch or create DID for connected wallet
  useEffect(() => {
    if (!isConnected || !address || walletDid) {
      if (!isConnected || !address) {
        setWalletDid(null);
        setWalletAddress(null);
        setDidLoading(false);
      }
      return;
    }

    const alias = `issuer-wallet-${address}`;

    const fetchOrCreateDid = async () => {
      setDidLoading(true);
      try {
        // Try list first
        const listRes = await fetch(`${API_URL}/did/list`);
        const { success, identifiers } = await listRes.json();
        if (success && Array.isArray(identifiers)) {
          const existing = identifiers.find((i) =>
            i.did.toLowerCase().endsWith(address.toLowerCase())
          );
          if (existing) {
            localSetWalletDid(existing.did);
            setWalletDid(existing.did);
            return;
          }
        }

        // Attempt create with alias
        const createRes = await fetch(`${API_URL}/did/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "did:ethr", walletAddress: address, alias }),
        });
        const createJson = await createRes.json();

        if (createJson.success && createJson.identifier?.did) {
          setWalletDid(createJson.identifier.did);
          localSetWalletDid(createJson.identifier.did);
        } else if (
          !createJson.success &&
          createJson.error?.includes("already exists")
        ) {
          // Alias exists: fetch list again to get DID
          const retryList = await fetch(`${API_URL}/did/list`);
          const { identifiers: retryIds } = await retryList.json();
          const found = retryIds.find((i) => i.alias === alias);
          if (found) {
            localSetWalletDid(found.did);
            setWalletDid(found.did);
          }
        } else {
          console.error("Unexpected DID create response:", createJson);
        }
      } catch (err) {
        console.error("Error fetching/creating DID:", err);
      } finally {
        setDidLoading(false);
      }
    };
    
    setWalletAddress(address);
    fetchOrCreateDid();
  }, [isConnected, address, walletDid]);

  // Scroll effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click outside dropdown
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowConnectOptions(false);
      }
    };
    if (showConnectOptions) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showConnectOptions]);

  const isAnyConnected = isConnected || !!principal;
  
  const handleInternetIdentityLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Internet Identity login failed:", error);
    }
  };

  return (
    <nav
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 w-[95vw] max-w-5xl transition-all duration-300 p-1 rounded-2xl z-50 ${
        isScrolled
          ? "bg-white/95 backdrop-blur-xl shadow-2xl border border-gray-200/20"
          : "bg-white/80 backdrop-blur-lg shadow-xl border border-gray-200/30"
      }`}
    >
      <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 rounded-xl p-4">
        <ul className="flex items-center justify-between gap-8">
          {/* Logo/Brand */}
          <li>
            <a
              href="/"
              className="text-2xl font-bold bg-gradient-to-r from-orange-400 via-yellow-500 to-blue-900 bg-clip-text text-transparent 
                        hover:from-orange-500 hover:via-yellow-600 hover:to-blue-800 
                        transition-all duration-300 transform hover:scale-105 
                        focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2">
              ABYA Passport
            </a>
          </li>

          {/* Navigation Links */}
          <li className="hidden md:flex items-center space-x-8">
            {[
              { name: "Home", page: "home" },
              { name: "DID Documents", page: "did" },
              { name: "Credentials", page: "vc" },
              { name: "About", page: "about" },
              { name: "Contact", page: "contact" },
            ].map((item) => (
              <button
                key={item.name}
                onClick={() => setCurrentPage && setCurrentPage(item.page)}
                className={`relative font-medium transition-all duration-200 group ${
                  currentPage === item.page
                    ? "text-blue-600"
                    : "text-gray-700 hover:text-blue-600"
                }`}
              >
                {item.name}
                <span
                  className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-200 ${
                    currentPage === item.page
                      ? "w-full"
                      : "w-0 group-hover:w-full"
                  }`}
                ></span>
              </button>
            ))}
          </li>

          {/* Mobile Menu Button */}
          <li className="md:hidden">
            <button className="text-gray-700 hover:text-blue-600 transition-colors">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
              </svg>
            </button>
          </li>

          {/* Sign In / Wallet Section */}
          <li className="relative" ref={dropdownRef}>
            {isAnyConnected ? (
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 px-4 py-2 rounded-xl flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-gray-700">
                    {isConnected
                      ? shortenAddress(address)
                      : shortenAddress(principal)}
                  </span>
                  {principal && !isConnected && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      II
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowConnectOptions(true)}
                  className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-lg hover:bg-gray-100"
                  title="Account Options"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
              </div>
            ) : !showConnectOptions ? (
              <button
                onClick={() => setShowConnectOptions(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-2"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3 11h-4v4h-2v-4H5v-2h4V7h2v4h4v2z" />
                </svg>
                Sign In
              </button>
            ) : null}

            {showConnectOptions && (
              <div className="absolute top-full mt-3 right-0 animate-in slide-in-from-top-2 duration-200">
                <div className="bg-white/95 backdrop-blur-xl p-6 rounded-2xl shadow-2xl border border-gray-200/20 min-w-[300px]">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-semibold text-gray-800">
                      {isAnyConnected ? "Connected Account" : "Connect Account"}
                    </span>
                    <button
                      onClick={() => setShowConnectOptions(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Connected Wallet Info */}
                    {isConnected && (
                      <div className="p-3 rounded-xl bg-green-50/50 border border-green-200/50">
                        <div className="flex items-center gap-2 mb-2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-green-600"
                          >
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">
                            Connected Wallet
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded-lg break-all">
                          {shorten(address)}
                        </div>
                        <div className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded-lg break-all">
                          {shorten(walletDid)}
                        </div>
                        <button
                          onClick={() => disconnect()}
                          className="w-full flex items-center justify-center space-x-2 text-red-500 hover:bg-red-50 mt-5 hover:cursor-pointer p-2 rounded-lg"
                        >
                          Disconnect Wallet
                        </button>
                      </div>
                    )}

                    {/* Connected Internet Identity Info */}
                    {principal && !isConnected && (
                      <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200/60 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-1.5 bg-purple-100 rounded-lg">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-purple-600"
                            >
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800">
                                Internet Identity
                              </span>
                              <div className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                Connected
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Decentralized Identity
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {/* Principal ID */}
                          <div className="bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-purple-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                                Principal ID
                              </span>
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(principal)
                                }
                                className="text-gray-400 hover:text-purple-600 transition-colors p-1 rounded hover:bg-purple-50"
                                title="Copy Principal ID"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                                </svg>
                              </button>
                            </div>
                            <div className="text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded border break-all">
                              {shortenAddress(principal)}
                            </div>
                          </div>

                          {/* DID Section */}
                          {did ? (
                            <div className="bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-purple-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                                  Decentralized ID
                                </span>
                                <button
                                  onClick={() =>
                                    navigator.clipboard.writeText(did)
                                  }
                                  className="text-gray-400 hover:text-purple-600 transition-colors p-1 rounded hover:bg-purple-50"
                                  title="Copy DID"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                                  </svg>
                                </button>
                              </div>
                              <div className="text-sm text-gray-700 font-mono bg-gradient-to-r from-blue-50 to-purple-50 p-2 rounded border break-all">
                                {did}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  className="text-orange-500"
                                >
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                </svg>
                                <span className="text-sm text-orange-700 font-medium">
                                  DID Generation Pending
                                </span>
                              </div>
                              <p className="text-xs text-orange-600 mt-1">
                                Your decentralized identity is being
                                generated...
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => {
                              // Refresh DID if needed
                              window.location.reload();
                            }}
                            className="flex-1 bg-white hover:bg-purple-50 text-purple-600 border border-purple-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                            </svg>
                            Refresh
                          </button>
                          <button
                            onClick={logout}
                            className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                            </svg>
                            Disconnect
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Show both wallet and II info if both connected */}
                    {isConnected && principal && (
                      <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/50">
                        <div className="flex items-center gap-2 mb-2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-purple-600"
                          >
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">
                            Internet Identity
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded-lg break-all">
                          {principal}
                        </div>
                        <button
                          onClick={logout}
                          className="mt-2 w-full text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Disconnect II
                        </button>
                      </div>
                    )}

                    {/* Wallet Connection */}
                    {!isAnyConnected && (
                      <div className="p-3 rounded-xl bg-gray-50/50 border border-gray-200/50">
                        <div className="flex items-center gap-2 mb-2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="text-blue-600"
                          >
                            <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">
                            Web3 Wallet
                          </span>
                        </div>
                        <ConnectButton />
                      </div>
                    )}

                    {!isAnyConnected && (
                      <>
                        {/* Divider */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                          <span className="text-xs text-gray-500 font-medium">
                            OR
                          </span>
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                        </div>

                        {/* Internet Identity */}
                        <div className="p-3 rounded-xl bg-gray-50/50 border border-gray-200/50">
                          <div className="flex items-center gap-2 mb-3">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-purple-600"
                            >
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">
                              Internet Computer
                            </span>
                          </div>
                          <button
                            onClick={handleInternetIdentityLogin}
                            disabled={isAuthenticating}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
                          >
                            {isAuthenticating ? (
                              <>
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  className="animate-spin"
                                >
                                  <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" />
                                </svg>
                                Connecting...
                              </>
                            ) : (
                              <>
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Internet Identity
                              </>
                            )}
                          </button>
                        </div>

                        {/* Developer Login (for testing) */}
                        <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-200/50">
                          <div className="flex items-center gap-2 mb-3">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-orange-600"
                            >
                              <path d="M13 3h8v18h-8v-2h6V5h-6V3zM3 12l4 4v-3h11v-2H7V8l-4 4z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">
                              Developer Mode
                            </span>
                          </div>
                          <button
                            onClick={developerLogin}
                            disabled={isAuthenticating}
                            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-gray-400 disabled:to-gray-500 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
                            </svg>
                            Dev Login (Testing)
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-200/50">
                    <p className="text-xs text-gray-500 text-center">
                      By connecting, you agree to our Terms of Service
                    </p>
                  </div>
                </div>
              </div>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;