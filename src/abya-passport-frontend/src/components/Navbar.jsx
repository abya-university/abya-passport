// src/abya-passport-frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useEthr } from "../contexts/EthrContext";
import AbyaLogo from "../assets/abya.png";
import { CopyCheckIcon, CopyIcon } from "lucide-react";
import {
  ConnectButton,
  darkTheme,
  lightTheme,
  useActiveAccount,
  useActiveWalletChain,
  useSwitchActiveWalletChain,
} from "thirdweb/react";
import { client } from "../services/client.js";
import { sepolia } from "thirdweb/chains";
import { inAppWallet, createWallet } from "thirdweb/wallets";

const API_URL =
  import.meta.env.VITE_APP_VERAMO_API_URL ||
  "https://veramo-backend-service.onrender.com";

function Navbar({ currentPage, setCurrentPage }) {
  // Detect dark mode from document root (set by App.jsx)
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );

  // thirdweb active account + wallet chain + switch hook
  const account = useActiveAccount();
  const activeChain = useActiveWalletChain();
  const switchChain = useSwitchActiveWalletChain();

  // Helper to safely read chain id
  const activeChainId = activeChain?.chainId ?? activeChain?.id ?? null;

  const isConnected = !!account;
  // const address = account?.address;
  const smartWallet = account?.address;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { setWalletAddress, setWalletDid, walletDid: ctxDid } = useEthr();
  const [walletDid, localSetWalletDid] = useState(ctxDid);
  const [didLoading, setDidLoading] = useState(false);
  const dropdownRef = useRef(null);
  const { did, principal, isAuthenticating, login, logout } =
    useInternetIdentity();
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    localSetWalletDid(ctxDid);
  }, [ctxDid]);

  const canisterId =
    import.meta.env.VITE_APP_BACKEND_CANISTER_ID ||
    "uxrrr-q7777-77774-qaaaq-cai";

  // Shorteners
  const shortenAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
  const shorten = (str) =>
    str ? (str.length > 10 ? `${str.slice(0, 16)}…${str.slice(-6)}` : str) : "";

  // Separate connection states
  const isWalletConnected = isConnected && smartWallet;
  const isInternetIdentityConnected = !!principal;
  const isAnyConnected = isWalletConnected || isInternetIdentityConnected;

  // Helper: desired chain (you can change this default if needed)
  const desiredChain = sepolia;
  const desiredChainId = desiredChain?.chainId ?? null;

  // Whether the user is on the wrong chain
  const isChainMismatched =
    isWalletConnected &&
    activeChainId != null &&
    activeChainId !== desiredChainId;

  // Fetch or create DID for connected wallet (updated to include chain info)
  useEffect(() => {
    if (!isWalletConnected || walletDid) {
      if (!isWalletConnected) {
        setWalletDid(null);
        setWalletAddress(null);
        setDidLoading(false);
      }
      return;
    }

    const networkSlug =
      (activeChain &&
        (activeChain.slug ||
          activeChain.name?.toLowerCase().replace(/\s+/g, "-"))) ||
      desiredChain?.slug ||
      "sepolia";

    // const alias = `issuer-${networkSlug}-${smartWallet}`;
    const alias = `issuer-wallet-${smartWallet}`;

    const fetchOrCreateDid = async () => {
      setDidLoading(true);
      try {
        const listRes = await fetch(`${API_URL}/did/list`);
        const { success, identifiers } = await listRes.json();
        if (success && Array.isArray(identifiers)) {
          const existing = identifiers.find((i) =>
            i.did.toLowerCase().endsWith(smartWallet.toLowerCase())
          );
          if (existing) {
            localSetWalletDid(existing.did);
            setWalletDid(existing.did);
            return;
          }
        }

        // include network info in the request body so backend can create chain-aware DID strings
        const createRes = await fetch(`${API_URL}/did/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "did:ethr",
            walletAddress: smartWallet,
            alias,
            network: networkSlug,
          }),
        });
        const createJson = await createRes.json();

        if (createJson.success && createJson.identifier?.did) {
          setWalletDid(createJson.identifier.did);
          localSetWalletDid(createJson.identifier.did);
        } else if (
          !createJson.success &&
          (createJson.error?.includes("already exists") ||
            createJson.error?.includes("UNIQUE constraint failed"))
        ) {
          const retryList = await fetch(`${API_URL}/did/list`);
          const { identifiers: retryIds } = await retryList.json();
          const retryFound = retryIds.find((i) => i.alias === alias);
          if (retryFound) setWalletDid(retryFound.did);
        } else {
          console.error("Unexpected DID create response:", createJson);
        }
      } catch (err) {
        console.error("Error fetching/creating DID:", err);
      } finally {
        setDidLoading(false);
      }
    };

    setWalletAddress(smartWallet);
    fetchOrCreateDid();
    // include activeChainId so DID refresh runs when chain changes
  }, [isWalletConnected, smartWallet, walletDid, activeChainId]);

  // Scroll effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click outside dropdown - but exclude ThirdWeb modal elements
  useEffect(() => {
    const handler = (e) => {
      // Don't close if clicking on ThirdWeb modal elements
      if (e.target.closest("[data-rk]") || e.target.closest(".tw-modal")) {
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowConnectOptions(false);
      }
    };
    if (showConnectOptions) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [showConnectOptions]);

  const handleInternetIdentityLogin = async () => {
    try {
      await login();
      setShowConnectOptions(false); // Close dropdown after successful login
    } catch (error) {
      console.error("Internet Identity login failed:", error);
    }
  };

  const copyText = (text, setCopied) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  // wallets configuration
  const wallets = [
    inAppWallet({
      auth: {
        options: ["google", "discord", "github", "x", "passkey"],
        mode: "redirect",
      },
      metadata: {
        name: "ABYA Passport",
        image: {
          src: AbyaLogo,
          width: 100,
          height: 100,
        },
      },
      executionMode: {
        mode: "EIP7702",
        sponsorGas: true,
      },
      smartAccount: {
        chain: sepolia,
        sponsorGas: true,
      },
    }),
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
    createWallet("me.rainbow"),
  ];

  // Custom theme for ThirdWeb
  const customTheme = isDark
    ? darkTheme({
        colors: {
          separatorLine: "hsl(41, 80%, 49%)",
          accentText: "hsl(41, 62%, 51%)",
          modalBg: "hsl(240, 6%, 10%)",
          borderColor: "hsl(58, 5%, 13%)",
          selectedTextColor: "hsl(230, 7%, 22%)",
          primaryText: "hsl(0, 0%, 100%)",
          secondaryText: "hsl(0, 0%, 70%)",
          accentButtonBg: "hsl(41, 80%, 49%)",
          accentButtonText: "hsl(0, 0%, 100%)",
        },
      })
    : lightTheme({
        colors: {
          separatorLine: "hsl(41, 80%, 49%)",
          accentText: "hsl(41, 62%, 51%)",
          modalBg: "hsl(0, 0%, 100%)",
          borderColor: "hsl(0, 0%, 85%)",
          selectedTextColor: "hsl(100, 100%, 100%)",
          primaryText: "hsl(0, 0%, 0%)",
          secondaryText: "hsl(0, 0%, 30%)",
          accentButtonBg: "hsl(41, 80%, 49%)",
          accentButtonText: "hsl(0, 0%, 100%)",
          // Add these to fix hover states
          connectedButtonBg: "hsl(41, 80%, 49%)",
          connectedButtonBgHover: "hsl(41, 70%, 45%)",
          // Wallet item hover
          walletSelectorButtonHoverBg: "hsl(41, 80%, 49%)",
        },
      });

  // chain switch handler (UI)
  const handleSwitchToDesired = async () => {
    try {
      if (!switchChain) {
        console.warn("switchChain hook not available");
        return;
      }
      await switchChain(desiredChain);
      // Optionally close dropdown after switching
      setTimeout(() => setShowConnectOptions(false), 800);
    } catch (err) {
      console.error("Failed to switch chain:", err);
    }
  };

  return (
    <nav
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 w-[95vw] max-w-7xl transition-all duration-300 p-1 rounded-2xl z-50
        ${
          isScrolled
            ? isDark
              ? "bg-transparent backdrop-blur-xl shadow-2xl border border-transparent"
              : "bg-white/95 backdrop-blur-xl shadow-2xl border border-gray-200/20"
            : "bg-transparent border-transparent shadow-none backdrop-blur-none"
        }`}
      style={{
        background: isDark ? "transparent" : undefined,
        borderColor: isDark ? "transparent" : undefined,
      }}
    >
      <div
        className={
          "bg-transparent rounded-xl p-4 transition-colors duration-300"
        }
      >
        <ul
          className={`flex items-center justify-between gap-8 ${
            isDark ? "text-gray-100 font-sans" : "text-blue-900 font-sans"
          }`}
        >
          {/* Logo/Brand */}
          <li>
            <a
              href="/"
              className={`text-2xl font-bold transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 flex items-center ${
                isDark
                  ? "text-yellow-400 font-semibold"
                  : "text-blue-900 font-bold"
              }`}
            >
              <img
                src={AbyaLogo}
                alt="ABYA Passport Logo"
                className="h-12 w-auto object-contain drop-shadow dark:drop-shadow-lg"
              />
            </a>
          </li>

          {/* Navigation Links */}
          <li className="hidden md:flex items-center font-bold space-x-8">
            {[
              { name: "Home", page: "home" },
              { name: "DID Documents", page: "did" },
              { name: "ICP Credentials", page: "vc" },
              { name: "Ether Credentials", page: "ethr-vc" },
              { name: "Verify", page: "verify" },
            ].map((item) => (
              <button
                key={item.name}
                onClick={() => setCurrentPage && setCurrentPage(item.page)}
                className={`relative transition-all duration-200 group font-medium
                  ${
                    currentPage === item.page
                      ? isDark
                        ? "text-yellow-400 font-bold"
                        : "text-yellow-600 font-bold"
                      : isDark
                      ? "text-gray-100 hover:text-yellow-300 font-normal"
                      : "text-blue-900 hover:text-blue-600 font-normal"
                  }
                `}
              >
                {item.name}
                <span
                  className={`absolute -bottom-1 left-0 h-0.5 transition-all duration-200
                    ${
                      currentPage === item.page
                        ? isDark
                          ? "bg-yellow-400 w-full"
                          : "bg-yellow-600 w-full"
                        : isDark
                        ? "bg-yellow-400 w-0 group-hover:w-full"
                        : "bg-yellow-600 w-0 group-hover:w-full"
                    }
                  `}
                ></span>
              </button>
            ))}
          </li>

          {/* Mobile Menu Button */}
          <li className="md:hidden">
            <button className="text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-yellow-400 transition-colors">
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
                <div className="bg-green-50 dark:bg-yellow-500/60 dark:border-yellow-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors duration-300">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium dark:text-cyan-950 text-gray-100">
                    {isConnected
                      ? shortenAddress(smartWallet)
                      : shortenAddress(principal)}
                  </span>

                  {/* show active chain badge */}
                  <span className="ml-2 text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-700 dark:text-slate-200">
                    {activeChain?.name || "Unknown chain"}
                  </span>

                  {principal && !isConnected && (
                    <span className="text-xs bg-purple-100 dark:bg-green-600 text-purple-700 dark:text-purple-200 px-2 py-0.5 rounded-full">
                      II
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowConnectOptions(!showConnectOptions)}
                  className="text-gray-200 bg-blue-900 hover:cursor-pointer hover:text-gray-700 dark:hover:text-yellow-400 transition-colors p-2 rounded-2xl hover:bg-gray-100 darkcard border border-blue-200"
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
            ) : (
              <button
                onClick={() => setShowConnectOptions(!showConnectOptions)}
                className="bg-blue-950 darkcard dark:shadow-yellow-500 dark-text-yellow text-white px-6 py-2.5 border border-blue-200 rounded-lg font-semibold transition-all duration-200 dark:shadow-md hover:shadow-md hover:cursor-pointer transform hover:scale-105 flex items-center gap-2"
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
            )}

            {/* Dropdown Menu */}
            {showConnectOptions && (
              <div
                className="absolute top-full mt-10 right-0 animate-in slide-in-from-top-2 duration-200 z-[9999]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className={
                    `${
                      isDark
                        ? "bg-[#101c2b]/95 border-blue-200 text-gray-100"
                        : "bg-white/95 border-gray-200/20 text-gray-800"
                    } ` +
                    "backdrop-blur-xl p-6 rounded-2xl shadow-2xl border min-w-[300px] transition-colors duration-300"
                  }
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col gap-3">
                      <span
                        className={`text-lg font-semibold ${
                          isDark ? "text-gray-100" : "text-blue-900"
                        }`}
                      >
                        {isAnyConnected
                          ? "Connected Account"
                          : "Connect Account"}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowConnectOptions(false)}
                      className={`transition-colors p-1 rounded-lg ${
                        isDark
                          ? "text-gray-300 hover:text-yellow-400 hover:bg-gray-800"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      }`}
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

                  {/* Wallet DID Display */}
                  {isWalletConnected && walletDid && (
                    <div className="flex flex-row space-x-5 w-full my-auto mb-4">
                      <div
                        className={`relative w-[93%] rounded-lg px-3 py-1 flex items-center justify-between
                          ${isDark ? "bg-yellow-700/60" : "bg-yellow-200/60"}
                        `}
                      >
                        <span className="text-xs font-mono break-all text-gray-400 dark:text-gray-800">
                          {shorten(walletDid)}
                        </span>
                        <button
                          className="ml-2 p-1 rounded hover:text-yellow-400 hover:cursor-pointer transition-colors"
                          onClick={() => copyText(walletDid, setIsCopied)}
                          aria-label="Copy DID"
                        >
                          {isCopied ? (
                            <CopyCheckIcon className="w-5 h-5 text-yellow-700 dark:text-yellow-200" />
                          ) : (
                            <CopyIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Connected Internet Identity Info */}
                    {isInternetIdentityConnected && (
                      <div className="p-4 rounded-2xl border border-blue-200 shadow-sm">
                        <div className="justify-center flex gap-1 mb-3">
                          <div className="bg-blue-100 darkcard rounded-lg">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                            >
                              <path
                                fill="#154c79"
                                fillRule="evenodd"
                                d="m12 13.386l.023-.027c1.313 1.277 3.208 2.763 4.85 2.763A4.086 4.086 0 0 0 21 12.072c0-2.237-1.845-4.05-4.126-4.05c-1.746 0-3.465 1.296-4.874 2.735zm4.815 1.098c1.404 0 2.543-1.08 2.543-2.413S18.219 9.66 16.81 9.66s-2.781 1.304-3.744 2.411c.639.72 2.34 2.412 3.744 2.412z"
                                clipRule="evenodd"
                              />
                              <path
                                fill="#154c79"
                                fillRule="evenodd"
                                d="m12.054 13.44l-.09-.09c-1.273 1.264-3.15 2.772-4.837 2.772A4.087 4.087 0 0 1 3 12.072c0-2.237 1.845-4.05 4.127-4.05c1.773 0 3.42 1.399 4.806 2.893l.121-.126zm-4.869 1.043c-1.408 0-2.547-1.08-2.547-2.412S5.777 9.66 7.185 9.66s2.781 1.304 3.744 2.411c-.639.72-2.34 2.412-3.744 2.412"
                                clipRule="evenodd"
                              />
                              <path
                                fill="#154c79"
                                d="m10.758 11.924l.108.094l1.102 1.404c1.296 1.21 3.186 2.7 4.905 2.7a4.11 4.11 0 0 0 4.05-3.267c-.35.634-1.575 1.629-3.762 1.606q-.169.022-.35.023c-1.41 0-3.106-1.692-3.745-2.412l.014-.018l-1.328-1.598l-1.327-1.26c-1.062-.81-2.16-1.318-3.366-1.318c-2.039 0-3.677 1.62-4.005 3.555c.909-1.647 2.866-2.178 4.585-1.724c1.125.194 2.102 1.09 3.119 2.215"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-blue-900 dark-text-yellow">
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

                        {/* Principal ID and DID Display */}
                        <div className="space-y-3">
                          <div className="backdrop-blur-sm rounded-lg p-3 border border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-700 dark-text-yellow uppercase tracking-wide">
                                Principal ID
                              </span>
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(principal)
                                }
                                className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-yellow-50"
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
                            <div className="text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded border border-blue-200 break-all">
                              {shortenAddress(principal)}
                            </div>
                          </div>

                          {did && (
                            <div className="backdrop-blur-sm rounded-lg p-3 border border-blue-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-700 dark-text-yellow uppercase tracking-wide">
                                  Decentralized ID
                                </span>
                                <button
                                  onClick={() =>
                                    navigator.clipboard.writeText(did)
                                  }
                                  className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-yellow-50"
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
                              <div className="text-sm text-gray-700 font-mono bg-gradient-to-r from-blue-50 to-purple-50 p-2 rounded border border-blue-200 break-all">
                                {did}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => {
                              window.location.reload();
                            }}
                            className="flex-1 hover:bg-purple-50 text-blue-900 dark-text-yellow darkcard border border-blue-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
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

                          {/* When chain is mismatched, surface switch button */}
                          {isChainMismatched ? (
                            <button
                              onClick={handleSwitchToDesired}
                              className="flex-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                            >
                              Switch to {desiredChain?.name || "Sepolia"}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                logout();
                                setShowConnectOptions(false);
                              }}
                              className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 darkcard px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
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
                          )}
                        </div>
                      </div>
                    )}

                    {/* Web3 Wallet Connection */}
                    {!isAnyConnected && (
                      <>
                        <div className="p-3 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-blue-900 dark-text-yellow"
                            >
                              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                            </svg>
                            <span className="text-sm font-medium text-blue-900 dark-text-yellow">
                              Web3 Wallet
                            </span>
                          </div>
                          {/* ThirdWeb Connect Button Container */}
                          <div
                            className="flex justify-center items-center"
                            onClick={(e) => {
                              // Prevent dropdown from closing when clicking the connect button
                              e.stopPropagation();
                            }}
                          >
                            <ConnectButton
                              client={client}
                              wallets={wallets}
                              connectButton={{
                                label: "Connect Wallet",
                                style: {
                                  background: isDark ? "#18181b" : "#1e3a8a",
                                  color: "white",
                                  border: isDark ? "none" : "none",
                                  borderRadius: "8px",
                                  padding: "8px 16px",
                                  fontSize: "14px",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                  width: "100%",
                                  boxShadow: isDark
                                    ? "0 0 0 2px #e4a80f, 0 0 8px 2px #e4a80f55"
                                    : "none",
                                },
                              }}
                              connectModal={{
                                size: "compact",
                                // titleIcon: AbyaLogo,
                                showThirdwebBranding: true,
                              }}
                              theme={customTheme}
                            />
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                          <span className="text-xs text-gray-500 font-medium">
                            OR
                          </span>
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                        </div>

                        {/* Internet Identity */}
                        <div className="p-3 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-2 mb-3">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-blue-900 dark-text-yellow"
                            >
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                            </svg>
                            <span className="text-sm font-medium text-blue-900 dark-text-yellow">
                              Internet Computer
                            </span>
                          </div>
                          <button
                            onClick={handleInternetIdentityLogin}
                            disabled={isAuthenticating}
                            className="w-full bg-yellow-500 hover:cursor-pointer dark:bg-blue-950 hover:bg-yellow-500 disabled:from-gray-400 disabled:to-gray-500 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
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

                    {isWalletConnected && !isInternetIdentityConnected && (
                      <>
                        <ConnectButton
                          client={client}
                          wallets={wallets}
                          connectButton={{
                            label: "Connect Wallet",
                            style: {
                              background: isDark ? "#18181b" : "#1e3a8a",
                              color: isDark ? "white" : "#ede7d1",
                              border: isDark ? "none" : "none",
                              boxShadow: isDark
                                ? "0 0 0 2px #e4a80f, 0 0 8px 2px #e4a80f55"
                                : "none",
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "14px",
                              fontWeight: "600",
                              cursor: "pointer",
                              width: "100%",
                            },
                          }}
                          connectModal={{
                            size: "wide",
                            titleIcon: AbyaLogo,
                            showThirdwebBranding: false,
                            welcomeScreen: {
                              title: "Connect to ABYA Passport",
                              subtitle: "Choose your preferred sign-in method",
                            },
                            privacyPolicyUrl: `${window.location.origin}/privacy`,
                            termsOfServiceUrl: `${window.location.origin}/terms`,
                          }}
                          theme={customTheme}
                          onConnect={(wallet) => {
                            console.log("Wallet connected:", wallet);
                            setTimeout(
                              () => setShowConnectOptions(false),
                              2000
                            );
                          }}
                          onDisconnect={() => {
                            console.log("Wallet disconnected");
                          }}
                        />
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
