// src/components/EthrVcManager.jsx
import React, { use, useEffect, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import * as ethers from "ethers";
import {
  storeCredential,
  fetchDidDocument,
  isPinataAvailable,
  getPinataInitError,
} from "../services/ipfsService";
import { useEthr } from "../contexts/EthrContext";
import EthrABI from "../artifacts/contracts/did_contract.json";
import { useEthersSigner } from "./useClientSigner";
import EthrPresentation from "./VcPresentationManager";

// Small icons to make the UI compact and scannable
import {
  RefreshCw,
  PlusSquare,
  FileText,
  Download,
  QrCode,
  Copy,
  UploadCloud,
  Link2,
  CheckCircle,
  AlertCircle,
  Database,
  CopyIcon,
  QrCodeIcon,
  DownloadIcon,
  VerifiedIcon,
} from "lucide-react";

const API_BASE = "http://localhost:3000";
const VC_ADDRESS =
  import.meta.env.VITE_VC_CONTRACT_ADDRESS ||
  "0x93eEc6FffeE62c79d5ef5Be5b0679aE928E8C1B2";

const VC_ABI = EthrABI.abi;

const EthrVcManager = () => {
  const { walletAddress, walletDid, didLoading } = useEthr();
  const signerPromise = useEthersSigner();

  // Debug logging
  console.log("EthrVcManager render:", {
    walletAddress,
    walletDid,
    didLoading,
    timestamp: new Date().toISOString(),
  });

  // navigation state for showing presentation page
  const [currentPage, setCurrentPage] = useState("home");

  const [formData, setFormData] = useState({
    issuerDid: "",
    subjectDid: "",
    name: "",
    role: "",
    organization: "",
    expirationDate: "",
  });

  const [credential, setCredential] = useState(null); // latest created via backend
  const [credentials, setCredentials] = useState([]); // displayed list (backend or on-chain+IPFS merged)
  const [jwtToVerify, setJwtToVerify] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [ipfsToken, setIpfsToken] = useState("");
  const [ipfsStatus, setIpfsStatus] = useState({});
  const [chainStatus, setChainStatus] = useState({});
  const [lastOnchainIds, setLastOnchainIds] = useState([]);
  const [lastOnchainRowsDebug, setLastOnchainRowsDebug] = useState([]);

  useEffect(() => {
    if (didLoading) return;
    if (walletDid) {
      setFormData((f) => (f.subjectDid ? f : { ...f, subjectDid: walletDid }));
    }
  }, [walletDid, didLoading]);

  // Prefill issuerDid with walletDid when available (issuer must be the connected wallet)
  useEffect(() => {
    if (didLoading) return;
    if (walletDid) {
      setFormData((f) => ({ ...f, issuerDid: walletDid }));
    } else if (walletAddress) {
      // Fallback to wallet address if DID is not available
      setFormData((f) => ({ ...f, issuerDid: walletAddress }));
    }
  }, [walletDid, walletAddress, didLoading]);

  useEffect(() => {
    fetchCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletDid, walletAddress]);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const toISO = (datetimeLocal) => {
    if (!datetimeLocal) return undefined;
    return new Date(datetimeLocal).toISOString();
  };

  // ---------------- Network helpers ----------------
  const SKALE_TITAN_CONFIG = {
    chainId: "0xF80F4", // 1020352220 in hex
    chainName: "SKALE Titan",
    nativeCurrency: {
      name: "sFUEL",
      symbol: "sFUEL",
      decimals: 18,
    },
    rpcUrls: ["https://testnet.skalenodes.com/v1/aware-fake-trim-testnet"],
    blockExplorerUrls: [
      "https://aware-fake-trim-testnet.explorer.testnet.skalenodes.com/api",
    ],
  };

  // const switchToSkaleTitan = async () => {
  //   if (!window.ethereum) return false;

  //   try {
  //     // Try switching to the network
  //     await window.ethereum.request({
  //       method: "wallet_switchEthereumChain",
  //       params: [{ chainId: SKALE_TITAN_CONFIG.chainId }],
  //     });
  //     return true;
  //   } catch (switchError) {
  //     // This error code indicates that the chain has not been added to MetaMask.
  //     if (switchError.code === 4902) {
  //       try {
  //         await window.ethereum.request({
  //           method: "wallet_addEthereumChain",
  //           params: [SKALE_TITAN_CONFIG],
  //         });
  //         return true;
  //       } catch (addError) {
  //         console.error("Failed to add network:", addError);
  //         return false;
  //       }
  //     }
  //     console.error("Failed to switch network:", switchError);
  //     return false;
  //   }
  // };

  // ---------------- helpers for ethers / BigNumber handling ----------------
  const safeToString = (v) => {
    try {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (typeof v === "bigint") return v.toString();
      if (v?.toString && typeof v.toString === "function") return v.toString();
      return String(v);
    } catch (e) {
      return String(v);
    }
  };

  useEffect(() => {
    console.log("ethers features:", {
      hasBrowserProvider: !!ethers?.BrowserProvider,
      hasV5Providers: !!ethers?.providers?.Web3Provider,
      hasGetDefault: typeof ethers.getDefaultProvider === "function",
    });
  }, []);

  const getContractWithSigner = async () => {
    if (typeof window === "undefined" || !window.ethereum)
      throw new Error("No Web3 provider found (window.ethereum)");

    // Check if wallet is connected
    if (!walletAddress) {
      throw new Error(
        "Wallet not connected. Please connect your wallet first."
      );
    }

    try {
      // Use the signer from the useEthersSigner hook
      console.log("Attempting to get signer from hook...");
      const signer = await signerPromise;

      if (!signer) {
        console.log(
          "Signer from hook is undefined, falling back to manual creation"
        );
        throw new Error("Signer from hook is undefined");
      }

      // Check network compatibility
      try {
        const signerAddress = await signer.getAddress();
        console.log("Successfully got signer from hook:", signerAddress);

        // Try to get network info
        const provider = signer.provider;
        if (provider && provider.getNetwork) {
          const network = await provider.getNetwork();
          console.log("Current network:", network);
        }

        return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
      } catch (addressError) {
        console.error("Error getting signer address:", addressError);
        throw new Error(
          "Failed to get signer address: " + addressError.message
        );
      }
    } catch (error) {
      console.error("getContractWithSigner error:", error);

      // Fallback to manual provider creation if the hook fails
      try {
        console.log("Falling back to manual provider creation...");

        // Ethers v6: BrowserProvider
        if (ethers?.BrowserProvider) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          try {
            // Ensure accounts are connected
            const accounts = await provider.send("eth_requestAccounts", []);
            if (!accounts || accounts.length === 0) {
              throw new Error("No accounts found. Please connect your wallet.");
            }
            console.log("Connected accounts:", accounts);
          } catch (accountError) {
            console.error("Account connection error:", accountError);
            throw new Error(
              "Failed to connect to wallet accounts: " + accountError.message
            );
          }

          try {
            const signer = await provider.getSigner();
            console.log("Fallback signer obtained:", await signer.getAddress());
            return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
          } catch (signerError) {
            console.error("Signer creation error:", signerError);
            throw new Error("Failed to create signer: " + signerError.message);
          }
        }

        // Ethers v5: providers.Web3Provider
        if (ethers?.providers?.Web3Provider) {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          try {
            // Ensure accounts are connected
            const accounts = await provider.send("eth_requestAccounts", []);
            if (!accounts || accounts.length === 0) {
              throw new Error("No accounts found. Please connect your wallet.");
            }
            console.log("Connected accounts:", accounts);
          } catch (accountError) {
            console.error("Account connection error:", accountError);
            throw new Error(
              "Failed to connect to wallet accounts: " + accountError.message
            );
          }

          try {
            const signer = provider.getSigner();
            console.log("Fallback signer obtained:", await signer.getAddress());
            return new ethers.Contract(VC_ADDRESS, VC_ABI, signer);
          } catch (signerError) {
            console.error("Signer creation error:", signerError);
            throw new Error("Failed to create signer: " + signerError.message);
          }
        }

        throw new Error(
          "Unsupported ethers version: no BrowserProvider or providers.Web3Provider found"
        );
      } catch (fallbackError) {
        console.error("Fallback provider creation failed:", fallbackError);
        throw new Error(
          "Failed to create contract with signer: " + error.message
        );
      }
    }
  };

  const getContractReadonly = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      if (ethers?.BrowserProvider) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        try {
          await provider.send?.("eth_requestAccounts", []);
        } catch (_) {}
        return new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
      }
      if (ethers?.providers?.Web3Provider) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        try {
          await provider.send?.("eth_requestAccounts", []);
        } catch (_) {}
        return new ethers.Contract(VC_ADDRESS, VC_ABI, provider);
      }
    }

    const rpcUrl =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_APP_RPC_URL) ||
      null;

    if (rpcUrl) {
      if (ethers?.providers?.JsonRpcProvider) {
        const jsonProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
      if (typeof ethers.JsonRpcProvider === "function") {
        const jsonProvider = new ethers.JsonRpcProvider(rpcUrl);
        return new ethers.Contract(VC_ADDRESS, VC_ABI, jsonProvider);
      }
    }

    if (typeof ethers.getDefaultProvider === "function") {
      const defaultProvider = ethers.getDefaultProvider();
      return new ethers.Contract(VC_ADDRESS, VC_ABI, defaultProvider);
    }

    throw new Error("No provider available for readonly operations");
  };

  // Contract validation helper
  const validateContract = async (contract) => {
    const requiredFunctions = [
      "issueCredential",
      "getCredentialsForStudent",
      "credentialCount",
      "credentials",
    ];

    const missingFunctions = [];
    for (const funcName of requiredFunctions) {
      if (!contract[funcName]) {
        missingFunctions.push(funcName);
      }
    }

    if (missingFunctions.length > 0) {
      const error = `Contract validation failed: Missing required functions: ${missingFunctions.join(
        ", "
      )}. 
Current contract at ${VC_ADDRESS} appears to be an ERC1056 DID Registry instead of a Verifiable Credential contract.
Please check the contract address and ABI configuration.`;
      console.error(error);
      throw new Error(error);
    }
  };
  const extractHexAddressFromDid = (did) => {
    if (!did || typeof did !== "string") return null;
    const m = did.match(/0x[0-9a-fA-F]{40}/);
    return m ? m[0] : null;
  };

  const normalizeDidVariants = (did) => {
    const out = [];
    if (!did) return out;
    out.push(did);

    const hex = extractHexAddressFromDid(did);
    if (hex) {
      out.push(hex);
      out.push(hex.toLowerCase());
      try {
        const checksum = ethers.utils
          ? ethers.utils.getAddress(hex)
          : ethers.getAddress
          ? ethers.getAddress(hex)
          : null;
        if (checksum) out.push(checksum);
      } catch (e) {}
    }

    if (did.startsWith("did:ethr:")) {
      const removed = did.replace(/^did:ethr:[^:]+:/, "");
      if (removed && !out.includes(removed)) out.push(removed);
    }

    return out.filter((v, i) => v && out.indexOf(v) === i);
  };

  // ---------------- Create credential (backend) ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCredential(null);
    setVerificationResult(null);

    try {
      const payload = {
        issuerDid: formData.issuerDid,
        subjectDid: formData.subjectDid,
        credentialSubject: {
          id: formData.subjectDid,
          name: formData.name,
          role: formData.role,
          organization: formData.organization,
        },
        ...(formData.expirationDate && {
          expirationDate: toISO(formData.expirationDate),
        }),
      };

      const res = await axios.post(`${API_BASE}/credential/create`, payload);
      const cred = res.data.credential;
      setCredential(cred);

      // auto-fill verify field if JWT present
      const jwt =
        (cred && cred.proof && cred.proof.jwt) ||
        (typeof cred === "string" ? cred : null);
      if (jwt) setJwtToVerify(jwt);

      await fetchCredentials();
    } catch (err) {
      console.error("create error:", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to create credential"
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Publish to IPFS & store mapping on-chain ----------------
  const publishCredentialToIpfsAndStoreOnChain = async (cred, idx = null) => {
    try {
      // Early wallet connection check
      if (!walletAddress) {
        throw new Error(
          "Wallet not connected. Please connect your wallet before publishing credentials."
        );
      }

      // Check if wallet is available
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error(
          "Web3 wallet not available. Please install MetaMask or another Web3 wallet."
        );
      }

      const statusKey = idx ?? "latest";
      setIpfsStatus((s) => ({ ...s, [statusKey]: { uploading: true } }));

      // canonical subject used for storing on-chain (respect DID if present)
      const subjectDidRaw =
        cred?.credentialSubject?.id || cred?.subject || cred?.subjectDid || "";
      let subjectToStore = subjectDidRaw;

      const hexMatch = extractHexAddressFromDid(subjectDidRaw);
      if (!subjectDidRaw?.startsWith("did:") && hexMatch) {
        try {
          subjectToStore = ethers.utils
            ? ethers.utils.getAddress(hexMatch)
            : hexMatch;
        } catch (e) {
          subjectToStore = hexMatch.toLowerCase();
        }
      }

      const profileData = { ...cred };

      const cid = await storeCredential(subjectToStore, profileData);
      setIpfsStatus((s) => ({ ...s, [statusKey]: { cid, uploading: false } }));

      let credentialHash = "";
      try {
        credentialHash = computeCredentialHash(cred);
      } catch (hashErr) {
        console.warn("hash error", hashErr);
        credentialHash = "";
      }
      const signature = cred?.proof?.jwt || cred?.proof?.signature || "";

      // Ensure the issuer DID matches the connected wallet
      const issuerAddress = walletAddress;
      if (!issuerAddress) {
        throw new Error(
          "No wallet connected. Please connect your wallet first."
        );
      }

      // send tx and capture txHash robustly
      try {
        setChainStatus((s) => ({ ...s, [statusKey]: { sending: true } }));
        const contract = await getContractWithSigner();

        // Check if the contract has the expected function
        if (!contract.issueCredential) {
          throw new Error(
            "Contract does not have issueCredential function. Please check the contract ABI."
          );
        }

        const credentialType = Array.isArray(cred?.type)
          ? cred.type[0]
          : cred?.type || "VerifiableCredential";
        const metadata = JSON.stringify(cred?.credentialSubject || {});

        console.log("Issuing credential with parameters:", {
          subjectToStore,
          credentialType,
          metadata,
          credentialHash,
          signature,
          cid,
          issuerAddress,
        });

        let txOrReceipt;
        try {
          txOrReceipt = await contract.issueCredential(
            subjectToStore,
            credentialType,
            metadata,
            credentialHash,
            signature,
            cid
          );
          console.log("Transaction result:", txOrReceipt);
        } catch (contractError) {
          console.error("Contract call error:", contractError);
          throw contractError;
        }

        let txHash = null;
        try {
          if (txOrReceipt?.hash) txHash = txOrReceipt.hash;
          if (!txHash && txOrReceipt?.transactionHash)
            txHash = txOrReceipt.transactionHash;
          if (!txHash && txOrReceipt?.request?.hash)
            txHash = txOrReceipt.request.hash;
          if (!txHash && txOrReceipt?.receipt?.transactionHash)
            txHash = txOrReceipt.receipt.transactionHash;

          console.log("Extracted txHash:", txHash);
        } catch (hashError) {
          console.error("Error extracting transaction hash:", hashError);
          txHash = null;
        }

        setChainStatus((s) => ({
          ...s,
          [statusKey]: { sending: true, txHash },
        }));

        if (typeof txOrReceipt?.wait === "function") {
          try {
            console.log("Waiting for transaction confirmation...");
            const receipt = await txOrReceipt.wait();
            console.log("Transaction receipt:", receipt);

            if (!txHash && receipt?.transactionHash)
              txHash = receipt.transactionHash;
            setChainStatus((s) => ({
              ...s,
              [statusKey]: { success: true, txHash },
            }));
          } catch (waitErr) {
            console.error("tx wait error:", waitErr);
            setChainStatus((s) => ({
              ...s,
              [statusKey]: {
                error: waitErr?.message || String(waitErr),
                txHash,
              },
            }));
          }
        } else {
          // no wait() - assume txHash is enough
          console.log("No wait function available, using txHash directly");
          setChainStatus((s) => ({
            ...s,
            [statusKey]: { success: txHash ? true : false, txHash },
          }));
        }
      } catch (chainErr) {
        console.error("On-chain error:", chainErr);

        // Provide more specific error messages
        let errorMessage = chainErr?.message || String(chainErr);
        if (errorMessage.includes("Only issuer can perform this action")) {
          errorMessage = `Access denied: Only the contract owner can issue credentials. Your wallet (${walletAddress}) may not be authorized. Please contact the system administrator.`;
        } else if (errorMessage.includes("execution reverted")) {
          errorMessage = `Transaction failed: ${
            errorMessage.split("execution reverted: ")[1] ||
            "Unknown smart contract error"
          }`;
        } else if (
          errorMessage.includes("Contract does not have issueCredential")
        ) {
          errorMessage = `Contract configuration error: The contract at ${VC_ADDRESS} does not have the expected issueCredential function. Please check that the correct contract ABI is being used.`;
        } else if (errorMessage.includes("formatJson")) {
          errorMessage = `Ethers.js formatting error: There was an issue formatting the transaction data. This might be due to incompatible contract ABI or ethers version.`;
        } else if (
          errorMessage.includes("bad_key") ||
          errorMessage.includes("Invalid private key")
        ) {
          errorMessage = `Wallet connection error: Invalid or missing private key. Please ensure your wallet is properly connected and unlocked. Try disconnecting and reconnecting your wallet.`;
        } else if (errorMessage.includes("Wallet not connected")) {
          errorMessage = `Please connect your wallet first before attempting to issue credentials.`;
        } else if (errorMessage.includes("user rejected transaction")) {
          errorMessage = `Transaction was rejected by user. Please try again and approve the transaction in your wallet.`;
        }

        const possibleHash =
          chainErr?.transactionHash ||
          chainErr?.txHash ||
          chainErr?.receipt?.transactionHash ||
          null;
        setChainStatus((s) => ({
          ...s,
          [statusKey]: {
            error: errorMessage,
            txHash: possibleHash,
          },
        }));
      }

      await fetchCredentials();
    } catch (err) {
      console.error("IPFS/store error:", err);
      const statusKey = idx ?? "latest";
      let errorMessage = err?.message || String(err);

      if (
        errorMessage.includes("No wallet connected") ||
        errorMessage.includes("Wallet not connected")
      ) {
        errorMessage = "Please connect your Ethereum wallet first.";
      } else if (
        errorMessage.includes("bad_key") ||
        errorMessage.includes("Invalid private key")
      ) {
        errorMessage =
          "Wallet connection issue: Invalid private key. Please disconnect and reconnect your wallet, then try again.";
      } else if (errorMessage.includes("Web3 wallet not available")) {
        errorMessage =
          "Web3 wallet not detected. Please install MetaMask or another compatible wallet.";
      } else if (errorMessage.includes("user rejected")) {
        errorMessage =
          "Transaction was rejected. Please try again and approve the transaction in your wallet.";
      }

      setIpfsStatus((s) => ({
        ...s,
        [statusKey]: {
          error: errorMessage,
          uploading: false,
        },
      }));
      alert("IPFS upload / store failed: " + errorMessage);
    }
  };

  const computeCredentialHash = (cred) => {
    if (!cred) return "";
    const sortedKeys = Object.keys(cred).sort();
    const json = JSON.stringify(cred, sortedKeys, 2);
    if (
      typeof ethers.keccak256 === "function" &&
      typeof ethers.toUtf8Bytes === "function"
    ) {
      return ethers.keccak256(ethers.toUtf8Bytes(json));
    }
    if (ethers.utils && typeof ethers.utils.keccak256 === "function") {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json));
    }
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (h << 5) - h + json.charCodeAt(i);
    return "0x" + (h >>> 0).toString(16);
  };

  // ---------------- on-chain fetch helpers (unchanged) ----------------
  const getIdsForDid = async (did) => {
    try {
      const readContract = await getContractReadonly();

      // Check if the contract has the expected function
      if (!readContract.getCredentialsForStudent) {
        console.warn(
          "Contract does not have getCredentialsForStudent function"
        );
        setLastOnchainIds([]);
        return [];
      }

      const variants = normalizeDidVariants(did);
      let ids = [];
      let usedVariant = null;

      for (const v of variants) {
        try {
          const res = await readContract.getCredentialsForStudent(v);
          const idStrings = Array.isArray(res)
            ? res.map((x) => safeToString(x))
            : [];
          if (idStrings && idStrings.length > 0) {
            ids = idStrings;
            usedVariant = v;
            break;
          }
        } catch (inner) {}
      }

      if ((!ids || ids.length === 0) && walletAddress) {
        try {
          const res2 = await readContract.getCredentialsForStudent(
            walletAddress
          );
          const idStrings2 = Array.isArray(res2)
            ? res2.map((x) => safeToString(x))
            : [];
          if (idStrings2 && idStrings2.length > 0) {
            ids = idStrings2;
            usedVariant = walletAddress;
          }
        } catch (_) {}
      }

      setLastOnchainIds(ids);
      console.log(
        "getCredentialsForStudent tried variant:",
        usedVariant,
        "->",
        ids
      );
      return ids;
    } catch (err) {
      console.error("getIdsForDid error", err);
      setLastOnchainIds([]);
      return [];
    }
  };

  const fetchOnChainCredentialsForDid = async (did) => {
    try {
      const readContract = await getContractReadonly();

      const variants = normalizeDidVariants(did);
      let idsRaw = [];
      let usedVariant = null;

      for (const v of variants) {
        try {
          const res = await readContract.getCredentialsForStudent(v);
          const idList = Array.isArray(res)
            ? res.map((x) => safeToString(x))
            : [];
          if (idList && idList.length > 0) {
            idsRaw = idList;
            usedVariant = v;
            break;
          }
        } catch (inner) {}
      }

      if ((!idsRaw || idsRaw.length === 0) && walletAddress) {
        try {
          const res2 = await readContract.getCredentialsForStudent(
            walletAddress
          );
          const idList2 = Array.isArray(res2)
            ? res2.map((x) => safeToString(x))
            : [];
          if (idList2 && idList2.length > 0) {
            idsRaw = idList2;
            usedVariant = walletAddress;
          }
        } catch (_) {}
      }

      const idList = idsRaw;
      setLastOnchainIds(idList);

      const results = [];
      const rowsDebug = [];

      for (const idStr of idList) {
        try {
          const row = await readContract.credentials(idStr);
          rowsDebug.push({ idStr, row });
          const mappingCID = row?.[8] ? safeToString(row[8]) : "";
          const issuerDID = row?.[2] ? safeToString(row[2]) : "";
          const issueDateRaw = row?.[4];
          const issueDate =
            issueDateRaw && typeof issueDateRaw?.toString === "function"
              ? issueDateRaw.toNumber
                ? new Date(issueDateRaw.toNumber() * 1000).toISOString()
                : new Date(Number(issueDateRaw) * 1000).toISOString()
              : undefined;
          const valid = !!row?.[9];

          let ipfsJson = null;
          if (mappingCID) {
            try {
              ipfsJson = await fetchDidDocument(mappingCID);
            } catch (fetchErr) {
              console.warn(
                "fetchDidDocument failed, will fallback to public gateway",
                fetchErr
              );
              const gateways = [
                `https://dweb.link/ipfs/${mappingCID}`,
                `https://ipfs.io/ipfs/${mappingCID}`,
                `https://cloudflare-ipfs.com/ipfs/${mappingCID}`,
              ];
              for (const g of gateways) {
                try {
                  const res = await fetch(g);
                  if (res.ok) {
                    ipfsJson = await res.json();
                    break;
                  }
                } catch (gerr) {
                  console.warn("gateway fetch failed", g, gerr);
                }
              }
            }
          }

          let displayed;
          if (ipfsJson) {
            displayed = {
              ...ipfsJson,
              issuanceDate: ipfsJson.issuanceDate || issueDate,
              issuer: ipfsJson.issuer || { id: issuerDID },
            };
          } else {
            let metadata = row?.[5] ?? "";
            try {
              metadata =
                typeof metadata === "string" ? JSON.parse(metadata) : metadata;
            } catch (e) {
              // leave as string
            }
            displayed = {
              credentialSubject:
                metadata &&
                typeof metadata === "object" &&
                Object.keys(metadata).length > 0
                  ? metadata
                  : { id: row?.[1] ?? did },
              issuer: { id: issuerDID },
              issuanceDate: issueDate,
            };
          }

          const credObj = {
            ...displayed,
            onchain: {
              id: safeToString(row?.[0] ?? idStr),
              mappingCID,
              issuerDID,
              issueDate,
              valid,
              usedVariant,
            },
          };
          results.push(credObj);
        } catch (inner) {
          console.warn("failed to load onchain id", idStr, inner);
        }
      }

      setLastOnchainRowsDebug(rowsDebug);
      return results;
    } catch (err) {
      console.warn("fetchOnChainCredentialsForDid error", err);
      setLastOnchainRowsDebug([]);
      return [];
    }
  };

  const fetchAllOnChainCredentials = async () => {
    try {
      const readContract = await getContractReadonly();
      const count = await readContract.credentialCount();
      const n =
        count && typeof count?.toString === "function"
          ? Number(safeToString(count))
          : Number(count || 0);
      const out = [];
      for (let i = 1; i <= n; i++) {
        try {
          const row = await readContract.credentials(i);
          const mappingCID = row?.[8] ? safeToString(row[8]) : "";
          let ipfsJson = null;
          if (mappingCID) {
            try {
              ipfsJson = await fetchDidDocument(mappingCID);
            } catch (err) {
              try {
                const res = await fetch(`https://dweb.link/ipfs/${mappingCID}`);
                if (res.ok) ipfsJson = await res.json();
              } catch (e) {}
            }
          }
          const issuerDID = row?.[2] ? safeToString(row[2]) : "";
          const issueDateRaw = row?.[4];
          const issueDate = issueDateRaw
            ? issueDateRaw.toNumber
              ? new Date(issueDateRaw.toNumber() * 1000).toISOString()
              : new Date(Number(issueDateRaw) * 1000).toISOString()
            : undefined;
          const credObj = {
            ...(ipfsJson || {}),
            issuanceDate: issueDate,
            onchain: {
              id: safeToString(row?.[0] ?? i),
              mappingCID,
              issuerDID,
              valid: !!row?.[9],
            },
          };
          out.push(credObj);
        } catch (inner) {}
      }
      return out;
    } catch (err) {
      console.warn("fetchAllOnChainCredentials error", err);
      return [];
    }
  };

  const fetchCredentials = async () => {
    setListLoading(true);
    setError("");
    try {
      if (walletDid) {
        const onchainForWallet = await fetchOnChainCredentialsForDid(walletDid);
        if (onchainForWallet && onchainForWallet.length > 0) {
          setCredentials(onchainForWallet);
          setListLoading(false);
          return;
        }
        const variants = normalizeDidVariants(walletDid);
        for (const v of variants) {
          const tryRes = await fetchOnChainCredentialsForDid(v);
          if (tryRes && tryRes.length > 0) {
            setCredentials(tryRes);
            setListLoading(false);
            return;
          }
        }
        if (walletAddress) {
          const tryAddr = await fetchOnChainCredentialsForDid(walletAddress);
          if (tryAddr && tryAddr.length > 0) {
            setCredentials(tryAddr);
            setListLoading(false);
            return;
          }
        }
      }

      const res = await axios.get(`${API_BASE}/credential/list`);
      const creds = res.data?.credentials ?? res.data ?? [];

      if (!creds || creds.length === 0) {
        const onchainAll = await fetchAllOnChainCredentials();
        setCredentials(onchainAll);
        setListLoading(false);
        return;
      }

      setCredentials(creds);
    } catch (err) {
      console.error("fetchCredentials error:", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to fetch credentials"
      );
    } finally {
      setListLoading(false);
    }
  };

  const retryFetchIpfs = async (mappingCID, index) => {
    if (!mappingCID) return alert("No mapping CID");
    setIpfsStatus((s) => ({ ...s, ["retry-" + index]: { fetching: true } }));
    let ipfsJson = null;
    try {
      ipfsJson = await fetchDidDocument(mappingCID);
    } catch (err) {
      console.warn("Pinata fetch failed, trying public gateway", err);
      try {
        const res = await fetch(`https://dweb.link/ipfs/${mappingCID}`);
        if (res.ok) ipfsJson = await res.json();
      } catch (gerr) {
        console.warn("public gateway fetch failed", gerr);
      }
    }
    setIpfsStatus((s) => ({
      ...s,
      ["retry-" + index]: { fetching: false, json: ipfsJson, mappingCID },
    }));
    // update credentials array to include fetched JSON if found
    if (ipfsJson) {
      setCredentials((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...ipfsJson } : c))
      );
    } else {
      alert(
        "Failed to fetch IPFS JSON for " +
          mappingCID +
          " — see console for details"
      );
    }
  };

  // ---------------- QR / clipboard / downloads (unchanged) ----------------
  const generateQr = async (text) => {
    if (!text) return alert("No text to create QR for");
    try {
      const url = await QRCode.toDataURL(text, { errorCorrectionLevel: "M" });
      setQrDataUrl(url);
    } catch (err) {
      console.error("QR error:", err);
      alert("Failed to generate QR code");
    }
  };

  const copyToClipboard = async (text, label = "Text") => {
    if (!text) return alert(`${label} is empty`);
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied to clipboard`);
    } catch (err) {
      console.error("Clipboard error:", err);
      alert("Failed to copy");
    }
  };

  const downloadFile = (filename, content, mime = "application/json") => {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadJSON = (cred) => {
    if (!cred) return alert("No credential");
    downloadFile(
      `credential-${Date.now()}.json`,
      JSON.stringify(cred, null, 2),
      "application/json"
    );
  };

  const downloadPDF = (cred) => {
    if (!cred) return alert("No credential");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Verifiable Credential", 20, 20);
    let y = 30;
    const cs = cred.credentialSubject || {};
    const lines = [
      `Name: ${cs.name ?? "N/A"}`,
      `Role: ${cs.role ?? "N/A"}`,
      `Organization: ${cs.organization ?? "N/A"}`,
      `Subject DID: ${cs.id ?? "N/A"}`,
      `Issuer DID: ${cred.issuer?.id ?? "N/A"}`,
      `Issuance Date: ${cred.issuanceDate ?? "N/A"}`,
      `Expiration Date: ${cred.expirationDate ?? "N/A"}`,
    ];
    lines.forEach((ln) => {
      doc.setFontSize(11);
      doc.text(ln, 20, y);
      y += 8;
    });

    const jwt = cred?.proof?.jwt;
    if (jwt) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text("JWT (compact):", 20, 20);
      doc.setFontSize(9);
      const chunk = 80;
      let pos = 28;
      for (let i = 0; i < jwt.length; i += chunk) {
        doc.text(jwt.slice(i, i + chunk), 20, pos);
        pos += 6;
        if (pos > 280) {
          doc.addPage();
          pos = 20;
        }
      }
    }
    doc.save(`credential-${Date.now()}.pdf`);
  };

  // ---------------- Verify JWT ----------------
  const handleJwtVerification = async () => {
    setVerificationResult(null);
    setError("");
    if (!jwtToVerify) {
      setVerificationResult({ verified: false, error: "No JWT provided" });
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/credential/verify`, {
        credential: jwtToVerify,
      });
      const ver = response.data?.verification ?? response.data;
      setVerificationResult(ver);
    } catch (err) {
      console.error(err);
      setVerificationResult({
        verified: false,
        error:
          err?.response?.data?.error || err?.message || "Verification failed",
      });
    }
  };

  // ---------- Small visual helper: status dot ----------
  const StatusDot = ({ status }) => {
    if (!status) return null;
    const cls = status.error
      ? "bg-red-500"
      : status.success
      ? "bg-emerald-500"
      : status.sending || status.uploading
      ? "bg-yellow-400"
      : "bg-slate-300";
    return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2`} />;
  };

  // ---------------- Navigation: render EthrPresentation when requested ----------------
  if (currentPage === "ethrpresent") {
    return <EthrPresentation onBack={() => setCurrentPage("home")} />;
  }

  // ---------------- Render (only UI changed) ----------------
  return (
    <div className="min-h-screen bg-transparentpx-4 py-16">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-30">
          <h1 className="text-5xl font-bold text-blue-900 dark-text-yellow mb-4 text-center">
            Ethereum Credential Manager
          </h1>
          <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">
            Create, manage, and verify Ethereum-based Verifiable Credentials
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="mb-16 backdrop-blur-md rounded-3xl darkcard shadow-lg p-10">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-2xl font-bold text-blue-900 dark-text-yellow flex items-center">
              Connection Status
            </h3>
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                walletAddress
                  ? "bg-emerald-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {walletAddress ? "✓ Connected" : "✗ Disconnected"}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-emerald-50 rounded-2xl p-4">
              <div className="flex items-center justify-center w-20 h-20 rounded-xl bg-blue-100 mb-10 mx-auto shadow-inner">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="57"
                  height="48"
                  viewBox="0 0 38 32"
                >
                  <g fill="#f0ce00">
                    <path d="M32.509 7.5a.5.5 0 0 0 .5-.5V5.335a1.64 1.64 0 0 0-1.638-1.638h-2.687l-.613-1.809a.5.5 0 0 0-.619-.318L12.899 5.994a.501.501 0 0 0 .292.957L27.28 2.667l1.343 3.965a.499.499 0 1 0 .947-.321l-.547-1.615h2.349c.352 0 .638.286.638.638V7c-.001.276.223.5.499.5" />
                    <path d="M36.5 15a.5.5 0 0 0 0 1c.351 0 .5.149.5.5v6c0 .351-.149.5-.5.5h-8c-.351 0-.5-.149-.5-.5v-5c0-.351.149-.5.5-.5h6a.5.5 0 0 0 .5-.5v-6c0-.911-.589-1.5-1.5-1.5H3c-1.233 0-2-.767-2-2s.767-2 2-2h5.076l-3.026.998a.5.5 0 1 0 .313.949L23.482.974a.5.5 0 1 0-.314-.95l-12.1 3.99C11.045 4.01 11.024 4 11 4H3C1.206 4 0 5.206 0 7v22c0 1.794 1.206 3 3 3h30.5c.911 0 1.5-.589 1.5-1.5v-5a.5.5 0 0 0-1 0v5c0 .351-.149.5-.5.5H3c-1.233 0-2-.767-2-2V9.312c.513.433 1.192.688 2 .688h30.5c.351 0 .5.149.5.5V16h-5.5c-.911 0-1.5.589-1.5 1.5v5c0 .911.589 1.5 1.5 1.5h8c.911 0 1.5-.589 1.5-1.5v-6c0-.911-.589-1.5-1.5-1.5" />
                    <circle cx="32" cy="20" r="1" />
                  </g>
                </svg>
              </div>
              <label className="text-sm font-medium text-gray-600 block mb-2">
                Wallet Address
              </label>
              <div
                className={`font-mono text-sm break-all mb-20 ${
                  walletAddress ? "text-emerald-700" : "text-gray-400"
                }`}
              >
                {walletAddress || "Not connected"}
              </div>
            </div>

            <div className="bg-emerald-50 rounded-2xl p-4">
              <div className="flex items-center justify-center w-20 h-20 rounded-xl bg-blue-100 mb-10 mx-auto shadow-inner">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="68"
                  height="68"
                  viewBox="0 0 48 48"
                >
                  <rect
                    width="36.65"
                    height="26.043"
                    x="5.675"
                    y="10.979"
                    fill="none"
                    stroke="#f0ce00"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    rx="3"
                    ry="3"
                    stroke-width="1"
                  />
                  <circle
                    cx="14.838"
                    cy="21.487"
                    r="3.563"
                    fill="none"
                    stroke="#f0ce00"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                  />
                  <path
                    fill="none"
                    stroke="#f0ce00"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M10.328 31.095h9.783a.92.92 0 0 0 .7-1.52a7.172 7.172 0 0 0-11.183 0a.92.92 0 0 0 .7 1.52M28.709 20.85h6.999m-6.999 6.872h6.999m-6.999-3.436h9.671"
                    stroke-width="1"
                  />
                </svg>
              </div>
              <label className="text-sm font-medium text-gray-600 block mb-2">
                Wallet DID
              </label>
              <div
                className={`font-mono text-sm break-all ${
                  walletDid ? "text-emerald-700" : "text-orange-600"
                }`}
              >
                {didLoading ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-orange-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading...
                  </span>
                ) : (
                  walletDid || "Not available"
                )}
              </div>
            </div>
          </div>

          {/* Contract Info */}
          <div className="bg-transparent rounded-lg p-4 mb-8">
            <div className="font-mono text-sm break-all text-emerald-600">
              {VC_ADDRESS}
            </div>
            <div className="text-xs text-gray-500 mt-1 mb-4">
              Contract Type:{" "}
              {VC_ABI && VC_ABI.length
                ? `${VC_ABI.length} functions available`
                : "ABI not loaded"}
            </div>
            {/* <div className="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <strong>Network:</strong> This contract is configured for
                  SKALE Titan (Chain ID: 1020352220).
                  <br />
                  <strong>Note:</strong> Make sure your wallet is connected to
                  the correct network to avoid "bad_key" errors.
                </div>
                <button
                  onClick={switchToSkaleTitan}
                  className="ml-3 px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
                >
                  Switch Network
                </button>
              </div>
            </div> */}
          </div>

          {/* IPFS Status */}
          <div className="rounded-lg p-4">
            <div
              className={`flex items-center ${
                isPinataAvailable() ? "text-emerald-700" : "text-orange-600"
              }`}
            >
              <svg
                className={`w-4 h-4 mr-2 ${
                  isPinataAvailable() ? "text-emerald-500" : "text-orange-500"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    isPinataAvailable()
                      ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  }
                />
              </svg>
              <span className="text-sm font-medium">
                {isPinataAvailable()
                  ? "Pinata IPFS - Ready"
                  : "Fallback Storage - LocalStorage"}
              </span>
            </div>
            {!isPinataAvailable() && (
              <div className="mt-2 text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                <strong>Note:</strong>{" "}
                {getPinataInitError() || "Pinata not configured"}
                <br />
                <span className="italic">
                  Credentials will be stored locally for development.{" "}
                  <a
                    href="/.env.example"
                    target="_blank"
                    className="underline text-blue-600"
                  >
                    Configure Pinata
                  </a>{" "}
                  for production use.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Wallet Readiness Warning */}
        {(!walletAddress || !window?.ethereum) && (
          <div className="mb-8 backdrop-blur-md border border-red-600 rounded-2xl p-6">
            <div className="flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 mr-2 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-red-600">
                Wallet Connection Required
              </h3>
            </div>
            <div className="text-red-600">
              {!window?.ethereum ? (
                <div>
                  <p className="mb-2">
                    <strong>No Web3 wallet detected:</strong> Please install
                    MetaMask or another compatible wallet to interact with smart
                    contracts.
                  </p>
                  <a
                    href="https://metamask.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 underline"
                  >
                    Install MetaMask →
                  </a>
                </div>
              ) : !walletAddress ? (
                <p>
                  <strong>Wallet not connected:</strong> Please connect your
                  wallet to create and publish credentials on-chain. This will
                  prevent "Invalid private key" errors during transactions.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* Wallet Connection Warning */}
        {!walletAddress && (
          <div className="mb-8 bg-gradient-to-br from-blue-100 to-white border border-red-600 rounded-2xl p-6">
            <div className="flex justify-center items-center mb-4 p-4">
              <svg
                className="w-6 h-6 mr-2 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-red-600">
                Wallet Connection Required:
              </h3>

              <div className="ml-4">
                <p className="text-red-600 mt-1">
                  Connect your Ethereum wallet (MetaMask, etc.) to create and
                  manage verifiable credentials.
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                if (typeof window !== "undefined" && window.ethereum) {
                  try {
                    await window.ethereum.request({
                      method: "eth_requestAccounts",
                    });
                    // The EthrContext should automatically detect this and update
                  } catch (err) {
                    console.error("Failed to connect wallet:", err);
                    alert("Failed to connect wallet: " + err.message);
                  }
                } else {
                  alert(
                    "No Ethereum wallet detected. Please install MetaMask or another Web3 wallet."
                  );
                }
              }}
              className="bg-blue-900 darkcard text-white dark-text-yellow px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <span className="flex items-center">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                Connect Wallet
              </span>
            </button>
          </div>
        )}

        {/* Main Interface */}
        {!walletAddress ? (
          <div className="text-center py-16 bg-white border border-red-600 rounded-2xl shadow-lg">
            <div className="mx-auto w-24 h-24 bg-gray-100 darkcard rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-12 h-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>

            <div className="flex justify-center items-center mb-4 p-4">
              <svg
                className="w-6 h-6 mr-2 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <h3 className="text-xl font-semibold text-red-600 mb-2">
                Wallet Connection Required!
              </h3>
              <p className="text-red-600">
                Please connect your Ethereum wallet to continue with credential
                management.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Create VC Form */}
            <div className="backdrop-blur-md darkcard shadow-lg rounded-3xl p-10">
              <div className="flex justify-center items-center mb-30">
                <div className="ml-4">
                  <h3 className="text-4xl font-bold text-blue-900 dark-text-yellow flex items-center">
                    Create Ethereum Verifiable Credential
                  </h3>
                  <p className="text-gray-600">
                    Fill in the details to issue a new credential
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Issuer DID (Auto-filled, read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark-text-yellow mb-2">
                      Issuer DID <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      name="issuerDid"
                      value={formData.issuerDid}
                      className="w-full px-4 py-3 bg-slate-200 border border-yellow-200 darkcard rounded-3xl text-gray-700 dark-text-white cursor-not-allowed"
                      readOnly
                      placeholder="Issuer DID (auto-filled from connected wallet)"
                    />
                    <div className="mt-2 p-3 bg-emerald-50 rounded-2xl">
                      <div className="flex items-start">
                        <svg
                          className="w-5 h-5 text-emerald-500 mt-0.5 mr-2 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div className="text-sm text-emerald-700">
                          <strong>Auto-configured:</strong> The issuer must be
                          your connected wallet address. This ensures only you
                          can issue credentials from your account.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subject DID */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark-text-yellow mb-2">
                      Subject DID <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      name="subjectDid"
                      value={formData.subjectDid}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-yellow-200 rounded-3xl darkcard text-gray-700 dark-text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      disabled={didLoading}
                      required
                      placeholder="Enter subject DID"
                    />
                    <div className="mt-2 p-3 bg-blue-50 darkcard overflow-x-auto rounded-lg">
                      <div className="flex items-start">
                        <svg
                          className="w-5 h-5 text-blue-900 dark-text-yellow mt-0.5 mr-2 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div className="text-sm text-blue-700 dark-text-white">
                          {didLoading ? (
                            <span className="flex items-center">
                              <svg
                                className="animate-spin h-4 w-4 mr-2"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              Loading wallet DID...
                            </span>
                          ) : walletDid ? (
                            <div>
                              <span className="font-medium">
                                Using wallet DID:
                              </span>
                              <br />
                              <code className="bg-white px-2 py-1 rounded border text-xs font-mono">
                                {walletDid}
                              </code>
                            </div>
                          ) : (
                            <span>
                              No wallet DID available — please enter a subject
                              DID manually.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Other fields */}
                  {["name", "role", "organization", "expirationDate"].map(
                    (field) => (
                      <div
                        key={field}
                        className={
                          field === "expirationDate" ? "md:col-span-2" : ""
                        }
                      >
                        <label className="block text-sm font-medium text-gray-700 dark-text-yellow mb-2 capitalize">
                          {field.replace(/([A-Z])/g, " $1").trim()}
                          {field !== "expirationDate" && (
                            <span className="text-red-500 ml-2">*</span>
                          )}
                        </label>
                        <input
                          type={
                            field === "expirationDate"
                              ? "datetime-local"
                              : "text"
                          }
                          name={field}
                          value={formData[field]}
                          onChange={handleChange}
                          className="w-full mb-10 px-4 py-4 border border-yellow-200 darkcard rounded-3xl text-gray-700 dark-text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                          required={field !== "expirationDate"}
                          placeholder={
                            field === "expirationDate"
                              ? "Optional expiration date"
                              : `Enter ${field
                                  .replace(/([A-Z])/g, " $1")
                                  .trim()
                                  .toLowerCase()}`
                          }
                        />
                      </div>
                    )
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading || didLoading}
                    className="bg-blue-900 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200 font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:transform-none disabled:hover:shadow-md"
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      "Create Credential"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={fetchCredentials}
                    className="bg-gray-100 darkcard text-gray-700 dark-text-yellow px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium"
                  >
                    {listLoading ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Refreshing...
                      </span>
                    ) : (
                      "Refresh List"
                    )}
                  </button>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center">
                      <svg
                        className="w-5 h-5 text-red-500 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-red-700 font-medium">
                        Error:{" "}
                        {typeof error === "object"
                          ? JSON.stringify(error)
                          : error}
                      </span>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Created Credential Preview */}
            {credential && (
              <div className="backdrop-blur-md rounded-2xl shadow-lg p-6 border-l-4 border-emerald-600">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-8 h-8 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-xl font-semibold text-emerald-700">
                      Credential Created Successfully
                    </h3>
                  </div>
                </div>

                <div className="bg-white-100 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm text-gray-800 dark-text-white whitespace-pre-wrap">
                    {JSON.stringify(credential, null, 2)}
                  </pre>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(credential, null, 2),
                        "Credential JSON"
                      )
                    }
                    className="bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <CopyIcon size={14} /> JSON
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      credential?.proof?.jwt &&
                      copyToClipboard(credential.proof.jwt, "JWT")
                    }
                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <CopyIcon size={14} /> JWT
                  </button>

                  <button
                    onClick={() =>
                      credential?.proof?.jwt && generateQr(credential.proof.jwt)
                    }
                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <QrCodeIcon size={14} /> QR
                  </button>

                  <button
                    onClick={() => downloadJSON(credential)}
                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <DownloadIcon size={14} /> JSON
                  </button>

                  <button
                    onClick={() => downloadPDF(credential)}
                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <DownloadIcon size={14} /> PDF
                  </button>

                  <button
                    onClick={() => {
                      if (credential?.proof?.jwt)
                        setJwtToVerify(credential.proof.jwt);
                      else alert("No JWT present");
                    }}
                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-emerald-200 transition-colors duration-200 font-medium"
                  >
                    <VerifiedIcon size={14} /> Verify
                  </button>

                  <button
                    onClick={() =>
                      publishCredentialToIpfsAndStoreOnChain(
                        credential,
                        "latest"
                      )
                    }
                    className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-4 py-2 rounded-lg hover:from-emerald-700 hover:to-green-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    {ipfsStatus["latest"]?.uploading
                      ? "Uploading..."
                      : chainStatus["latest"]?.sending
                      ? "Storing on-chain..."
                      : "Publish to IPFS & Blockchain"}
                  </button>
                </div>

                {/* Status indicators */}
                <div className="mt-4 space-y-2">
                  {ipfsStatus["latest"]?.cid && (
                    <div className="flex items-center p-3 backdrop-blur-md rounded-lg">
                      <svg
                        className="w-5 h-5 text-emerald-500 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span className="text-sm text-emerald-500">
                        IPFS CID :{" "}
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`https://dweb.link/ipfs/${ipfsStatus["latest"].cid}`}
                          className="underline font-mono dark-text-white"
                        >
                          {ipfsStatus["latest"].cid}
                        </a>
                      </span>
                    </div>
                  )}

                  {chainStatus["latest"]?.txHash && (
                    <div className="backdrop-blur-md flex items-center p-3 rounded-lg">
                      <svg
                        className="w-5 h-5 text-emerald-500 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-sm text-emerald-500">
                        Transaction :{" "}
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`https://etherscan.io/tx/${chainStatus["latest"].txHash}`}
                          className="underline font-mono dark-text-white"
                        >
                          {chainStatus["latest"].txHash}
                        </a>
                      </span>
                    </div>
                  )}

                  {chainStatus["latest"]?.error && (
                    <div className="flex items-center p-3 bg-red-50 rounded-lg">
                      <svg
                        className="w-5 h-5 text-red-500 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-sm text-red-700">
                        On-chain error:{" "}
                        {typeof chainStatus["latest"].error === "object"
                          ? JSON.stringify(chainStatus["latest"].error)
                          : chainStatus["latest"].error}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* QR Code Viewer */}
            {qrDataUrl && (
              <div className="backdrop-blur-md rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-semibold text-blue-900 dark-text-yellow flex items-center">
                    <svg
                      className="w-6 h-6 mr-2 text-blue-900 dark-text-yellow"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                    QR Code
                  </h4>
                  <button
                    onClick={() => setQrDataUrl(null)}
                    className="text-gray-500 hover:text-red-500 transition-colors duration-200"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex justify-center">
                  <div className="p-4 bg-white border-2 border-gray-200 rounded-lg shadow-inner">
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="max-w-xs mx-auto"
                    />
                  </div>
                </div>
                <p className="text-center text-sm text-gray-600 mt-4">
                  Scan this QR code to access the credential JWT
                </p>
              </div>
            )}

            {/* Credentials List */}
            <div className="bg-transparent rounded-xl p-6 mt-40">
              <div className="flex justify-center items-center mb-16">
                <div className="flex-shrink-0"></div>
                <div className="mb-4">
                  <h3 className="text-4xl font-semibold text-blue-900 dark-text-yellow">
                    Stored Verifiable Credentials
                  </h3>
                  <p className="text-gray-600">
                    Manage your verifiable credentials
                  </p>
                </div>
              </div>

              {listLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <svg
                      className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <p className="text-gray-600 dark-text-yellow">
                      Loading credentials...
                    </p>
                  </div>
                </div>
              ) : credentials.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-24 h-24 bg-blue-100 darkcard rounded-full flex items-center justify-center mb-4">
                    <svg
                      className="w-12 h-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-blue-900 dark-text-yellow mb-2">
                    No Credentials Found
                  </h3>
                  <p className="text-gray-500 dark-text-yellow mb-6">
                    Create your first verifiable credential to get started
                  </p>

                  {/* Diagnostics */}
                  <div className="backdrop-blur-md rounded-lg p-4 text-left max-w-md mx-auto">
                    <h4 className="font-bold text-blue-900 dark-text-yellow mb-3">
                      Connection Details
                    </h4>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-blue-900 dark-text-yellow font-semibold">
                          Wallet DID:
                        </span>
                        <code className="px-2 py-1 rounded overflow-y-auto text-gray-600 text-xs font-mono">
                          {walletDid || "—"}
                        </code>
                      </div>
                      <div className="flex justify-between mt-8">
                        <span className="text-blue-900 dark-text-yellow font-semibold">
                          Wallet Address:
                        </span>
                        <code className="px-2 py-1 rounded text-xs text-gray-600 font-mono">
                          {walletAddress || "—"}
                        </code>
                      </div>
                      <div className="flex justify-between mt-8">
                        <span className="text-blue-900 dark-text-yellow font-semibold">
                          On-chain IDs:
                        </span>
                        <span className="text-xs text-gray-600">
                          {lastOnchainIds.length > 0
                            ? lastOnchainIds.join(", ")
                            : "none"}
                        </span>
                      </div>
                    </div>

                    {lastOnchainRowsDebug.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-gray-600 dark-text-yellow hover:text-gray-800">
                          Show raw on-chain data
                        </summary>
                        <div className="mt-2 bg-white rounded p-2 max-h-32 overflow-auto">
                          <pre className="text-xs text-gray-600 dark-text-white">
                            {JSON.stringify(lastOnchainRowsDebug, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}

                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          if (!walletDid)
                            return alert(
                              "Connect wallet / set walletDid first"
                            );
                          setListLoading(true);
                          const ids = await getIdsForDid(walletDid);
                          setListLoading(false);
                          if ((ids?.length ?? 0) === 0)
                            alert("No on-chain IDs returned for this DID");
                        }}
                        className="bg-yellow-400 hover:bg-yellow-300 font-semibold text-blue-900 px-3 py-2 rounded text-sm transition-colors duration-200"
                      >
                        Fetch IDs for Wallet DID
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {credentials.map((cred, i) => {
                    const jwt =
                      cred?.proof?.jwt ||
                      cred?.jwt ||
                      (typeof cred === "string" ? cred : null);
                    const subjectId =
                      cred?.credentialSubject?.id ||
                      cred?.credentialSubject?.sub ||
                      cred?.onchain?.studentDID ||
                      cred?.subject ||
                      cred?.id ||
                      "N/A";

                    return (
                      <div
                        key={i}
                        className="backdrop-blur-md rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          {/* Credential Info */}
                          <div className="flex-1">
                            <div className="grid md:grid-cols-2 gap-3 mb-4 p-1">
                              <div className="flex flex-col mb-4">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                  Subject
                                </label>
                                <p className="text-sm font-mono text-gray-800 dark-text-white break-all">
                                  {subjectId}
                                </p>
                              </div>
                              <div className="flex flex-col mb-4">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                  Name
                                </label>
                                <p className="text-sm text-gray-800 dark-text-white">
                                  {cred?.credentialSubject?.name ??
                                    cred?.name ??
                                    cred?.credentialSubject?.fullName ??
                                    "N/A"}
                                </p>
                              </div>
                              <div className="flex flex-col mb-4">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                  Issuer
                                </label>
                                <p className="text-sm font-mono text-gray-800 dark-text-white break-all">
                                  {cred?.issuer?.id ?? cred?.issuer ?? "N/A"}
                                </p>
                              </div>
                              <div className="flex flex-col mb-4">
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                  Issued
                                </label>
                                <p className="text-sm text-gray-800 dark-text-white">
                                  {cred?.issuanceDate
                                    ? new Date(
                                        cred.issuanceDate
                                      ).toLocaleDateString()
                                    : "N/A"}
                                </p>
                              </div>
                            </div>

                            {/* On-chain info */}
                            {cred?.onchain?.mappingCID ? (
                              <div className="flex items-center p-3 bg-blue-100 rounded-lg">
                                <svg
                                  className="w-4 h-4 text-blue-400 dark-text-white mr-2 flex-shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                  />
                                </svg>
                                <span className="text-sm text-blue-400 dark-text-white">
                                  On-chain CID:{" "}
                                  <a
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://dweb.link/ipfs/${cred.onchain.mappingCID}`}
                                    className="underline font-mono"
                                  >
                                    {cred.onchain.mappingCID}
                                  </a>
                                  {cred.onchain?.id && (
                                    <span className="ml-2">
                                      (ID #{cred.onchain.id})
                                    </span>
                                  )}
                                  {cred.onchain?.valid === false && (
                                    <span className="ml-2 text-red-600 font-medium">
                                      (revoked)
                                    </span>
                                  )}
                                </span>
                              </div>
                            ) : (
                              cred?.onchain && (
                                <div className="flex items-center p-3 bg-yellow-50 rounded-lg">
                                  <svg
                                    className="w-4 h-4 text-yellow-500 mr-2"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                                    />
                                  </svg>
                                  <span className="text-sm text-yellow-700">
                                    On-chain: ID {cred.onchain.id ?? "?"},{" "}
                                    <span className="italic">
                                      no IPFS mapping
                                    </span>
                                  </span>
                                </div>
                              )
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex-shrink-0 space-y-3">
                            {/* Quick actions */}
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => downloadJSON(cred)}
                                className="flex items-center gap-2 bg-blue-100 darkcard text-yellow-600 hover:text-yellow-500 px-3 py-2 rounded-lg hover:bg-yellow-200 transition-colors duration-200 text-sm font-medium"
                              >
                                <DownloadIcon size={14} /> JSON
                              </button>
                              <button
                                onClick={() => downloadPDF(cred)}
                                className="flex items-center gap-2 bg-blue-100 darkcard text-yellow-600 hover:text-yellow-500 px-3 py-2 rounded-lg hover:bg-yellow-200 transition-colors duration-200 text-sm font-medium"
                              >
                                <DownloadIcon size={14} /> PDF
                              </button>
                              <button
                                onClick={() =>
                                  jwt
                                    ? copyToClipboard(jwt, "JWT")
                                    : alert("No JWT for this credential")
                                }
                                className="flex items-center gap-2 bg-blue-100 darkcard text-yellow-600 hover:text-yellow-500 px-3 py-2 rounded-lg hover:bg-yellow-200 transition-colors duration-200 text-sm font-medium"
                              >
                                <CopyIcon size={14} /> JWT
                              </button>
                              <button
                                onClick={() =>
                                  jwt
                                    ? generateQr(jwt)
                                    : alert("No JWT to generate QR")
                                }
                                className="flex items-center gap-2 bg-blue-100 darkcard text-yellow-600 hover:text-yellow-500 px-3 py-2 rounded-lg hover:bg-yellow-200 transition-colors duration-200 text-sm font-medium"
                              >
                                QR
                              </button>
                            </div>

                            {/* IPFS token input */}
                            <input
                              placeholder="IPFS token (optional)"
                              value={ipfsToken}
                              onChange={(e) => setIpfsToken(e.target.value)}
                              className="w-full border border-gray-100 text-blue-900 dark-text-white px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />

                            {/* Publish actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  publishCredentialToIpfsAndStoreOnChain(
                                    cred,
                                    i
                                  )
                                }
                                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                              >
                                {ipfsStatus[i]?.uploading
                                  ? "Uploading..."
                                  : chainStatus[i]?.sending
                                  ? "Storing..."
                                  : "Publish & Store"}
                              </button>

                              {cred?.onchain?.mappingCID && (
                                <button
                                  onClick={() =>
                                    retryFetchIpfs(cred.onchain.mappingCID, i)
                                  }
                                  className="bg-gray-100 text-yellow-600 hover:text-yellow-500 darkcard font-bold px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm"
                                >
                                  {ipfsStatus["retry-" + i]?.fetching
                                    ? "..."
                                    : "↻"}
                                </button>
                              )}
                            </div>

                            {/* Status indicators */}
                            <div className="space-y-1">
                              {ipfsStatus[i]?.cid && (
                                <div className="text-xs">
                                  <a
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://dweb.link/ipfs/${ipfsStatus[i].cid}`}
                                    className="text-blue-600 hover:text-blue-800 underline"
                                  >
                                    View IPFS ({ipfsStatus[i].cid.slice(0, 8)}
                                    ...)
                                  </a>
                                </div>
                              )}
                              {ipfsStatus[i]?.error && (
                                <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                  {typeof ipfsStatus[i].error === "object"
                                    ? JSON.stringify(ipfsStatus[i].error)
                                    : ipfsStatus[i].error}
                                </div>
                              )}
                              {chainStatus[i]?.txHash && (
                                <div className="text-xs">
                                  <a
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`https://etherscan.io/tx/${chainStatus[i].txHash}`}
                                    className="text-green-600 hover:text-green-800 underline"
                                  >
                                    View TX ({chainStatus[i].txHash.slice(0, 8)}
                                    ...)
                                  </a>
                                </div>
                              )}
                              {chainStatus[i]?.error && (
                                <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                  {typeof chainStatus[i].error === "object"
                                    ? JSON.stringify(chainStatus[i].error)
                                    : chainStatus[i].error}
                                </div>
                              )}
                            </div>

                            {/* Retry IPFS result */}
                            {ipfsStatus["retry-" + i]?.json && (
                              <div className="bg-gray-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-gray-700 mb-2">
                                  Fetched IPFS Data:
                                </div>
                                <div className="bg-white rounded p-2 max-h-24 overflow-auto">
                                  <pre className="text-xs text-gray-600">
                                    {JSON.stringify(
                                      ipfsStatus["retry-" + i].json,
                                      null,
                                      2
                                    )}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* JWT Verification */}
            <div className="backdrop-blur-md rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-6">
                <div className="flex-shrink-0">
                  <svg
                    className="w-30 h-30 text-blue-900 dark-text-yellow"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-3xl font-semibold text-blue-900 mb-2 dark-text-yellow">
                    JWT Verification
                  </h3>
                  <p className="text-gray-600">
                    Verify the authenticity of a credential JWT
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark-text-yellow mb-2">
                    JWT Token <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={jwtToVerify}
                    onChange={(e) => setJwtToVerify(e.target.value.trim())}
                    rows={4}
                    className="w-full border border-gray-100 text-gray-900 dark-text-white px-4 py-3 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors duration-200 font-mono text-sm"
                    placeholder="Paste JWT token here for verification..."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleJwtVerification}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <span className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Verify JWT
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setJwtToVerify("");
                      setVerificationResult(null);
                    }}
                    className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors duration-200 font-medium"
                  >
                    <span className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      Clear
                    </span>
                  </button>
                </div>

                {/* Verification Results */}
                {verificationResult && (
                  <div className="mt-6">
                    <div
                      className={`p-4 rounded-lg border-l-4 ${
                        verificationResult.verified
                          ? "bg-green-50 darkcard border-green-500"
                          : "bg-red-50 border-red-500"
                      }`}
                    >
                      <div className="flex items-center mb-3">
                        {verificationResult.verified ? (
                          <>
                            <svg
                              className="w-6 h-6 text-green-600 mr-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-green-800 font-semibold text-lg">
                              Verification Successful ✅
                            </span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-6 h-6 text-red-600 mr-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-red-800 font-semibold text-lg">
                              Verification Failed —{" "}
                              {typeof verificationResult?.error === "object"
                                ? JSON.stringify(verificationResult.error)
                                : verificationResult?.error ?? "Unknown error"}
                            </span>
                          </>
                        )}
                      </div>

                      {verificationResult.payload && (
                        <div className="grid md:grid-cols-3 gap-4 mb-4">
                          <div className="bg-white rounded-lg p-3">
                            <label className="text-xs font-medium text-emerald-500 uppercase tracking-wide">
                              Issuer
                            </label>
                            <p className="text-sm font-mono text-emerald-800 break-all">
                              {verificationResult.payload?.iss ?? "N/A"}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <label className="text-xs font-medium text-emerald-500 uppercase tracking-wide">
                              Subject
                            </label>
                            <p className="text-sm font-mono text-emerald-800 break-all">
                              {verificationResult.payload?.sub ?? "N/A"}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <label className="text-xs font-medium text-emerald-500 uppercase tracking-wide">
                              Expiry
                            </label>
                            <p className="text-sm text-emerald-800">
                              {verificationResult.payload?.exp
                                ? new Date(
                                    verificationResult.payload.exp * 1000
                                  ).toLocaleDateString()
                                : "N/A"}
                            </p>
                          </div>
                        </div>
                      )}

                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-gray-100 hover:text-gray-900">
                          View full verification details
                        </summary>
                        <div className="mt-2 bg-white rounded-lg p-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                            {JSON.stringify(verificationResult, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EthrVcManager;
