import React, { useState } from "react";
import { useInternetIdentity } from "../contexts/InternetContext";
import { useToast } from "./Toast";
import QRCode from "react-qr-code";
import QRCodeLib from "qrcode";

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
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
    >
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">
              Share Credential
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-600 mt-2">
            Generate QR codes or shareable links for your verifiable credential
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Share Method Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setShareMethod("qr")}
              className={`p-4 rounded-lg border-2 transition-colors ${
                shareMethod === "qr"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-3xl mb-2">📱</div>
              <div className="font-medium">QR Code</div>
              <div className="text-sm text-gray-600">Scannable QR code</div>
            </button>

            <button
              onClick={() => setShareMethod("url")}
              className={`p-4 rounded-lg border-2 transition-colors ${
                shareMethod === "url"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-3xl mb-2">🔗</div>
              <div className="font-medium">Shareable URL</div>
              <div className="text-sm text-gray-600">
                Direct verification link
              </div>
            </button>

            <button
              onClick={() => setShareMethod("selective")}
              className={`p-4 rounded-lg border-2 transition-colors ${
                shareMethod === "selective"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-3xl mb-2">🎯</div>
              <div className="font-medium">Selective Disclosure</div>
              <div className="text-sm text-gray-600">
                Share specific claims only
              </div>
            </button>
          </div>

          {/* QR Code Sharing */}
          {shareMethod === "qr" && (
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                QR Code Options
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  onClick={() => generateQRCode("reference")}
                  className="p-3 bg-blue-100 hover:bg-blue-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-blue-800">
                    Reference (Recommended)
                  </div>
                  <div className="text-sm text-blue-600">
                    Lightweight, requires internet
                  </div>
                </button>

                <button
                  onClick={() => generateQRCode("full")}
                  className="p-3 bg-green-100 hover:bg-green-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-green-800">
                    Full Document
                  </div>
                  <div className="text-sm text-green-600">
                    Complete VC, works offline
                  </div>
                </button>

                <button
                  onClick={() => generateQRCode("selective")}
                  className="p-3 bg-purple-100 hover:bg-purple-200 rounded-lg text-left transition-colors"
                >
                  <div className="font-medium text-purple-800">Selective</div>
                  <div className="text-sm text-purple-600">
                    Only chosen claims
                  </div>
                </button>
              </div>

              {qrCodeData && (
                <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-6">
                  {/* QR Code Display */}
                  <div className="flex-shrink-0">
                    {generateQRCodeSVG(qrCodeData)}
                  </div>

                  {/* QR Code Data */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        QR Code Data
                      </label>
                      <div className="bg-white border rounded-lg p-3">
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
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                      >
                        📋 Copy Data
                      </button>
                      <button
                        onClick={() => {
                          const filename = `vc-qr-${vc.id.substring(0, 8)}.png`;
                          downloadQRCode(qrCodeData, filename);
                        }}
                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                      >
                        💾 Download QR
                      </button>
                    </div>

                    <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
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
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Shareable URL
              </h3>

              <div className="space-y-4">
                <button
                  onClick={generateShareableUrl}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
                >
                  🔗 Generate Verification URL
                </button>

                {shareableUrl && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Verification URL
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={shareableUrl}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(shareableUrl, "Verification URL")
                          }
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          📋
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
                        className="flex items-center justify-center space-x-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                      >
                        <span>📧</span>
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
                        className="flex items-center justify-center space-x-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                      >
                        <span>📤</span>
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
                <strong>How it works:</strong> The URL contains a reference to
                your credential. When someone opens it, they'll be taken to a
                verification page that fetches your credential from IPFS and
                validates it.
              </div>
            </div>
          )}

          {/* Selective Disclosure */}
          {shareMethod === "selective" && (
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Selective Disclosure
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Choose which claims to share. Only selected information will
                    be included in the verification.
                  </p>

                  <div className="space-y-2">
                    {Object.entries(vc.credentialSubject || {})
                      .filter(([key]) => key !== "id")
                      .map(([key, value]) => (
                        <label
                          key={key}
                          className="flex items-start space-x-3 p-3 bg-white rounded-lg border"
                        >
                          <input
                            type="checkbox"
                            checked={!!selectiveClaims[key]}
                            onChange={() => toggleClaim(key)}
                            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-700 capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </div>
                            <div className="text-sm text-gray-500 break-words">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </div>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => generateQRCode("selective")}
                    disabled={
                      Object.keys(selectiveClaims).filter(
                        (key) => selectiveClaims[key]
                      ).length === 0
                    }
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 px-6 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    📱 Generate Selective QR
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
                    className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                  >
                    📋 Copy Data
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
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                      💾 Download
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
                        <div className="text-sm text-gray-600 mb-2">
                          Selected Claims Preview:
                        </div>
                        <div className="bg-white rounded-lg border p-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-700 overflow-x-auto">
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
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">
              Credential Information
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
              <div>
                <span className="font-medium">Type:</span>
                <div>
                  {Array.isArray(vc.type) ? vc.type.join(", ") : vc.type}
                </div>
              </div>
              <div>
                <span className="font-medium">Issuer:</span>
                <div className="break-all">
                  {vc.issuer?.id || vc.issuer || "Unknown"}
                </div>
              </div>
              <div>
                <span className="font-medium">Subject:</span>
                <div className="break-all">
                  {vc.credentialSubject?.id || "Anonymous"}
                </div>
              </div>
              <div>
                <span className="font-medium">Issued:</span>
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
