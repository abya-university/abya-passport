import React, { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { useInternetIdentity } from "../contetxs/InternetContext";

function Navbar(props) {
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const dropdownRef = useRef(null);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { identity, principal, isAuthenticating, login, logout } =
    useInternetIdentity();

  // Function to shorten wallet address or principal
  const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Check if any authentication method is active
  const isAnyConnected = isConnected || !!principal;

  // Handle scroll effect for navbar background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowConnectOptions(false);
      }
    };

    if (showConnectOptions) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showConnectOptions]);

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
              className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              ABYA Passport
            </a>
          </li>

          {/* Navigation Links */}
          <li className="hidden md:flex items-center space-x-8">
            {["Home", "About", "Services", "Contact"].map((item) => (
              <a
                key={item}
                href={`/${item.toLowerCase()}`}
                className="relative text-gray-700 hover:text-blue-600 font-medium transition-all duration-200 group"
              >
                {item}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-200 group-hover:w-full"></span>
              </a>
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
                          {address}
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
                          Disconnect
                        </button>
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
