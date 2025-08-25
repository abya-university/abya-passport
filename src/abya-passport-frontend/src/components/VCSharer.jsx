import React, { useState } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useToast } from "./Toast";
import QRCode from "react-qr-code";
import QRCodeLib from "qrcode";
import { Copy, CopyIcon, Download, DownloadIcon, LinkIcon, Pin, PinIcon, QrCode, QrCodeIcon, Share2, X } from "lucide-react";

const VCSharer = ({ vc, isOpen, onClose }) => {
  const { identity } = useInternetIdentity();
  const { showSuccess, showError } = useToast();

  const [shareMethod, setShareMethod] = useState("qr");
  const [qrCodeData, setQrCodeData] = useState("");
  const [shareableUrl, setShareableUrl] = useState("");
  const [selectiveClaims, setSelectiveClaims] = useState({});

  // Generate QR code data
  const generateQRCode = (method = "reference") => {
    if (!vc) return "";

    switch (method) {
      case "reference":
        // Lightweight reference format
        const reference = `vc://${vc.id}/${vc.metadata?.ipfsCid || vc.ipfsCid}`;
        setQrCodeData(reference);
        return reference;

      case "full":
        // Complete VC document
        const fullVC = JSON.stringify(vc.document || vc);
        setQrCodeData(fullVC);
        return fullVC;

      case "selective":
        // Selected claims only
        const selectedVC = {
          ...vc,
          credentialSubject: Object.fromEntries(
            Object.entries(vc.credentialSubject || {}).filter(
              ([key, _]) => selectiveClaims[key] || key === "id"
            )
          ),
        };
        const selectiveData = JSON.stringify(selectedVC);
        setQrCodeData(selectiveData);
        return selectiveData;

      default:
        return "";
    }
  };

  // Generate shareable URL
  const generateShareableUrl = () => {
    if (!vc) return "";

    const baseUrl = window.location.origin;
    const vcRef = `vc://${vc.id}/${vc.metadata?.ipfsCid || vc.ipfsCid}`;
    const encodedRef = encodeURIComponent(vcRef);

    // Create a verification URL
    const url = `${baseUrl}/verify?vc=${encodedRef}`;
    setShareableUrl(url);
    return url;
  };

  // Copy to clipboard
  const copyToClipboard = async (text, label = "Text") => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} copied to clipboard!`);
    } catch (error) {
      showError("Failed to copy to clipboard");
    }
  };

  // Generate QR Code SVG
  const generateQRCodeSVG = (text) => {
    if (!text) return null;

    return (
      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
        <QRCode
          value={text}
          size={256}
          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          viewBox={`0 0 256 256`}
        />
      </div>
    );
  };

  // Download QR Code as PNG
  const downloadQRCode = async (text, filename = "qr-code.png") => {
    try {
      const canvas = document.createElement("canvas");
      await QRCodeLib.toCanvas(canvas, text, {
        width: 512,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showSuccess("QR Code downloaded successfully!");
      }, "image/png");
    } catch (error) {
      console.error("Error generating QR code:", error);
      showError("Failed to download QR code");
    }
  };

  // Handle selective disclosure
  const toggleClaim = (claimKey) => {
    setSelectiveClaims((prev) => ({
      ...prev,
      [claimKey]: !prev[claimKey],
    }));
  };

  if (!isOpen || !vc) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
    >
      <div className="mt-100 mb-80 bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto z-999">
        {/* Header */}
        <div className="sticky top-0 bg-gray-100 darkcard border-b border-blue-200 p-6 rounded-t-xl">
          <div className="justify-center flex items-center">
            <h2 className="text-5xl font-bold text-blue-900 dark-text-yellow">
              Share Credential
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-xl text-gray-600 mt-8 mb-8 animate-fadein delay-500">
            Generate QR codes or shareable links for your verifiable credential
          </p>
        </div>

        <div className="p-6 space-y-6 mt-20">
          {/* Share Method Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setShareMethod("qr")}
              className={`p-4 rounded-2xl border-2 transition-colors ${
                shareMethod === "qr"
                  ? "border-yellow-500 bg-blue-50 text-blue-900 dark-text-yellow"
                  : "border-blue-200 hover:border-gray-300"
              }`}
            >
              <div className="justify-center flex text-3xl text-gray-600 mb-2"><QrCodeIcon size={34} /></div>
              <div className="font-medium text-gray-600">QR Code</div>
              <div className="text-sm text-gray-600">Scannable QR code</div>
            </button>

            <button
              onClick={() => setShareMethod("url")}
              className={`p-4 rounded-2xl border-2 transition-colors ${
                shareMethod === "url"
                  ? "border-yellow-500 bg-blue-50 text-blue-900 dark-text-yellow"
                  : "border-blue-200 hover:border-gray-300"
              }`}
            >
              <div className="justify-center flex text-3xl text-gray-600 mb-2"><LinkIcon size={34} /> </div>
              <div className="font-medium text-gray-600">Shareable URL</div>
              <div className="text-sm text-gray-600">
                Direct verification link
              </div>
            </button>

            <button
              onClick={() => setShareMethod("selective")}
              className={`p-4 rounded-2xl border-2 transition-colors ${
                shareMethod === "selective"
                  ? "border-yellow-500 bg-blue-50 text-blue-700"
                  : "border-blue-200 hover:border-gray-300"
              }`}
            >
              <div className="justify-center text-gray-600 flex text-3xl mb-2"><PinIcon size={34} /></div>
              <div className="font-medium text-gray-600">Selective Disclosure</div>
              <div className="text-sm text-gray-600">
                Share specific claims only
              </div>
            </button>
          </div>

          {/* QR Code Sharing */}
          {shareMethod === "qr" && (
            <div className="rounded-2xl p-6 mt-20">
              <h3 className="text-lg font-semibold text-blue-900 dark-text-yellow mb-8">
                QR Code Options
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  onClick={() => generateQRCode("reference")}
                  className="p-3 bg-blue-100 hover:bg-blue-200 rounded-2xl border border-blue-200 text-left transition-colors"
                >
                  <div className="font-medium text-blue-900 dark-text-yellow">
                    Reference (Recommended)
                  </div>
                  <div className="text-sm text-gray-600">
                    Lightweight, requires internet
                  </div>
                </button>

                <button
                  onClick={() => generateQRCode("full")}
                  className="p-3 bg-blue-100 hover:bg-blue-200 rounded-2xl border border-blue-200 text-left transition-colors"
                >
                  <div className="font-medium text-blue-900 dark-text-yellow">
                    Full Document
                  </div>
                  <div className="text-sm text-gray-600">
                    Complete VC, works offline
                  </div>
                </button>

                <button
                  onClick={() => generateQRCode("selective")}
                  className="p-3 bg-blue-100 hover:bg-blue-200 rounded-2xl border border-blue-200 text-left transition-colors"
                >
                  <div className="font-medium text-blue-900 dark-text-yellow">Selective</div>
                  <div className="text-sm text-gray-600">
                    Only chosen claims
                  </div>
                </button>
              </div>

              {qrCodeData && (
                <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-6 mt-20">
                  {/* QR Code Display */}
                  <div className="flex-shrink-0">
                    {generateQRCodeSVG(qrCodeData)}
                  </div>

                  {/* QR Code Data */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="font-bold block text-sm font-medium text-blue-900 dark-text-yellow mb-2">
                        QR Code Data
                      </label>
                      <div className="bg-white border border-blue-200 rounded-2xl p-3">
                        <code className="text-xs text-gray-600 break-all">
                          {qrCodeData.length > 200
                            ? qrCodeData.substring(0, 200) + "..."
                            : qrCodeData}
                        </code>
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() =>
                          copyToClipboard(qrCodeData, "QR Code data")
                        }
                        className="justify-center flex gap-2 bg-yellow-500 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                      >
                        <CopyIcon /> Copy Data
                      </button>
                      <button
                        onClick={() => {
                          const filename = `vc-qr-${vc.id.substring(0, 8)}.png`;
                          downloadQRCode(qrCodeData, filename);
                        }}
                        className="justify-center gap-2 flex bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                      >
                        <DownloadIcon /> QR
                      </button>
                    </div>

                    <div className="text-xs text-gray-600 bg-blue-100 p-3 rounded-lg mt-4">
                      <strong>QR Code Types:</strong>
                      <ul className="mt-1 space-y-1">
                        <li>
                          <strong>Reference:</strong> Lightweight, requires
                          internet to verify
                        </li>
                        <li>
                          <strong>Full Document:</strong> Complete VC data,
                          works offline
                        </li>
                        <li>
                          <strong>Selective:</strong> Only chosen claims
                          included
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* URL Sharing */}
          {shareMethod === "url" && (
            <div className="rounded-lg p-6 mt-20">
              <h3 className="text-lg font-semibold text-blue-900 dark-text-yellow mb-8">
                Shareable URL
              </h3>

              <div className="space-y-4">
                <button
                  onClick={generateShareableUrl}
                  className="w-full bg-amber-500 hover:bg-yellow-600 text-white py-3 px-6 rounded-3xl font-medium transition-colors mb-4"
                >
                  Generate Verification URL
                </button>

                {shareableUrl && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mt-8 mb-4">
                        Verification URL
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={shareableUrl}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-2xl text-sm"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(shareableUrl, "Verification URL")
                          }
                          className="justify-center flex gap-2 px-2 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <CopyIcon size={16} /> Copy
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          const emailSubject =
                            "Verifiable Credential Verification";
                          const emailBody = `Please verify my credential: ${shareableUrl}`;
                          window.open(
                            `mailto:?subject=${encodeURIComponent(
                              emailSubject
                            )}&body=${encodeURIComponent(emailBody)}`
                          );
                        }}
                        className="flex items-center justify-center space-x-2 py-2 px-4 text-gray-100 hover:bg-yellow-600 rounded-3xl text-gray-700 transition-colors"
                      >
                        <span>Email</span>
                      </button>

                      <button
                        onClick={() => {
                          const text = `Verify my credential: ${shareableUrl}`;
                          if (navigator.share) {
                            navigator.share({
                              title: "Credential Verification",
                              text,
                              url: shareableUrl,
                            });
                          } else {
                            copyToClipboard(text, "Share text");
                          }
                        }}
                        className="flex items-center justify-center space-x-2 py-2 px-4 text-gray-100 hover:bg-yellow-600 rounded-3xl text-gray-700 transition-colors"
                      >
                        <span><Share2 /></span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-gray-500 bg-blue-100 p-3 rounded-2xl mt-20 mb-20">
                <strong>How it works:</strong> The URL contains a reference to
                your credential. When someone opens it, they'll be taken to a
                verification page that fetches your credential from IPFS and
                validates it.
              </div>
            </div>
          )}

          {/* Selective Disclosure */}
          {shareMethod === "selective" && (
            <div className="rounded-2xl p-6 mt-20">
              <h3 className="text-lg font-semibold text-blue-900 dark-text-yellow mb-10">
                Selective Disclosure
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-6">
                    Choose which claims to share. Only selected information will
                    be included in the verification.
                  </p>

                  <div className="space-y-2">
                    {Object.entries(vc.credentialSubject || {})
                      .filter(([key]) => key !== "id")
                      .map(([key, value]) => (
                        <label
                          key={key}
                          className="flex items-start space-x-3 p-3 bg-white rounded-2xl border border-blue-200"
                        >
                          <input
                            type="checkbox"
                            checked={!!selectiveClaims[key]}
                            onChange={() => toggleClaim(key)}
                            className="mt-1 h-4 w-4 text-blue-600 dark-text-yellow focus:ring-blue-500 border-blue-200 rounded-2xl"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-blue-900 dark-text-yellow capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </div>
                            <div className="text-sm text-gray-600 break-words">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </div>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex space-x-3 mb-20">
                  <button
                    onClick={() => generateQRCode("selective")}
                    disabled={
                      Object.keys(selectiveClaims).filter(
                        (key) => selectiveClaims[key]
                      ).length === 0
                    }
                    className="justify-center gap-2 flex bg-blue-900 hover:border border-yellow-400 text-white hover:text-yellow-400 py-3 px-6 rounded-2xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <QrCode /> Generate Selective QR
                  </button>

                  <button
                    onClick={() => {
                      const selectedCount = Object.keys(selectiveClaims).filter(
                        (key) => selectiveClaims[key]
                      ).length;
                      if (selectedCount === 0) {
                        showError("Please select at least one claim to share");
                        return;
                      }
                      generateQRCode("selective");
                      copyToClipboard(qrCodeData, "Selective credential data");
                    }}
                    className="px-6 py-3 justify-center gap-2 flex bg-blue-900 hover:border border-yellow-400 text-white hover:text-yellow-400 rounded-2xl font-medium transition-colors"
                  >
                    <CopyIcon /> Data
                  </button>

                  {qrCodeData && shareMethod === "selective" && (
                    <button
                      onClick={() => {
                        const filename = `vc-selective-${vc.id.substring(
                          0,
                          8
                        )}.png`;
                        downloadQRCode(qrCodeData, filename);
                      }}
                      className="px-6 py-3 justify-center gap-2 flex bg-blue-900 hover:border border-yellow-400 text-white hover:text-yellow-400 rounded-2xl font-medium transition-colors"
                    >
                      <DownloadIcon /> Download
                    </button>
                  )}
                </div>

                {qrCodeData && shareMethod === "selective" && (
                  <div className="space-y-4">
                    {/* QR Code Display */}
                    <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-6">
                    <div className="flex-shrink-0">
                        {generateQRCodeSVG(qrCodeData)}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-blue-900 dark-text-yellow mb-2">
                          Selected Claims Preview:
                        </div>
                        <div className="bg-white rounded-2xl border border-blue-200 p-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-600 overflow-x-auto">
                            <code>
                              {JSON.stringify(JSON.parse(qrCodeData), null, 2)}
                            </code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VC Information */}
          <div className="rounded-2xl p-4 mt-20">
            <h4 className="font-medium text-blue-900 dark-text-yellow mb-15">
              Credential Information
            </h4>
            <div className="grid grid-cols-2 gap-10 text-sm text-gray-600">
              <div>
                <span className="font-bold dark-text-yellow">Type:</span>
                <div>
                  {Array.isArray(vc.type) ? vc.type.join(", ") : vc.type}
                </div>
              </div>
              <div>
                <span className="font-bold dark-text-yellow">Issuer:</span>
                <div className="break-all">
                  {vc.issuer?.id || vc.issuer || "Unknown"}
                </div>
              </div>
              <div>
                <span className="font-bold dark-text-yellow">Subject:</span>
                <div className="break-all">
                  {vc.credentialSubject?.id || "Anonymous"}
                </div>
              </div>
              <div>
                <span className="font-bold dark-text-yellow">Issued:</span>
                <div>
                  {vc.issuanceDate
                    ? new Date(vc.issuanceDate).toLocaleDateString()
                    : "Unknown"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VCSharer;
