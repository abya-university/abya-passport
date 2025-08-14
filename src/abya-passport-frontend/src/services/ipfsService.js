// ipfsService.js

import { PinataSDK } from "pinata-web3";

// Debug environment variables
console.log("IPFS Service Environment Check:", {
  PINATA_JWT:
    import.meta.env.VITE_APP_PINATA_JWT || "b5de97e4d7f291fffa29"
      ? "✓ Present"
      : "✗ Missing",
  PINATA_GATEWAY:
    import.meta.env.VITE_APP_PINATA_GATEWAY ||
    "indigo-able-aphid-853.mypinata.cloud"
      ? "✓ Present"
      : "✗ Missing",
  JWT_LENGTH: import.meta.env.VITE_APP_PINATA_JWT?.length || 0,
  JWT_FORMAT: import.meta.env.VITE_APP_PINATA_JWT
    ? "Starts with: " +
      import.meta.env.VITE_APP_PINATA_JWT.substring(0, 10) +
      "..."
    : "N/A",
});

// Initialize Pinata SDK using JWT and Gateway URL from environment variables
let pinata;
let pinataInitError = null;

try {
  const jwtToken =
    import.meta.env.VITE_APP_PINATA_JWT ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJiNzY5NDU5NS1mN2FjLTQ2ODYtOWQzNy1lYzY4Y2M1MmY4MzIiLCJlbWFpbCI6Imt5YWxlcGV0ZXIyMDAwQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJiNWRlOTdlNGQ3ZjI5MWZmZmEyOSIsInNjb3BlZEtleVNlY3JldCI6IjNjMTg2ZmI1ODk4MDc3NzY5OGJhYjhlOTVmMDEwZjQwZmQwZDA0ZTE0ZGU4ZjQ5YjU1MTEwODM1MWFlZmFmMjgiLCJleHAiOjE3ODYyOTE1NDh9.4I210vbOit7J2OC0e9yiyq7QGkHIGq14CuS5v1t6zWQ";
  const gateway =
    import.meta.env.VITE_APP_PINATA_GATEWAY ||
    "indigo-able-aphid-853.mypinata.cloud";

  if (!jwtToken || jwtToken.trim() === "") {
    pinataInitError =
      "VITE_APP_PINATA_JWT environment variable is missing or empty";
    console.warn("⚠️ " + pinataInitError);
    pinata = null;
  } else if (!gateway || gateway.trim() === "") {
    pinataInitError =
      "VITE_APP_PINATA_GATEWAY environment variable is missing or empty";
    console.warn("⚠️ " + pinataInitError);
    pinata = null;
  } else {
    pinata = new PinataSDK({
      pinataJwt: jwtToken,
      pinataGateway: gateway,
    });

    console.log("✓ Pinata SDK initialized successfully");

    // Test the SDK by checking if upload method exists
    if (!pinata.upload || typeof pinata.upload.file !== "function") {
      pinataInitError = "Pinata SDK upload methods not available";
      console.error("✗ " + pinataInitError);
      pinata = null;
    }
  }
} catch (error) {
  pinataInitError = `Failed to initialize Pinata SDK: ${error.message}`;
  console.error("✗ " + pinataInitError);
  pinata = null;
}

/**
 * Check if Pinata is properly initialized and available
 * @returns {boolean} - True if Pinata is ready to use
 */
export const isPinataAvailable = () => {
  return (
    pinata !== null && pinata.upload && typeof pinata.upload.file === "function"
  );
};

/**
 * Get the current Pinata initialization error (if any)
 * @returns {string|null} - Error message or null if no error
 */
export const getPinataInitError = () => {
  return pinataInitError;
};

/**
 * Stores a DID document using available IPFS services.
 * First tries Pinata, falls back to local storage or mock storage if needed.
 * @param {string} did - The DID for which the document is generated.
 * @param {Object} didDocument - The DID document object.
 * @returns {Promise<string>} - The IPFS hash (CID) of the stored document.
 */
export const storeDidDocument = async (did, didDocument) => {
  try {
    if (!isPinataAvailable()) {
      console.warn("Pinata SDK not available, using fallback storage");
      console.warn("Reason:", getPinataInitError());
      return await storeDidDocumentFallback(did, didDocument);
    }

    console.log("Storing DID document for:", did);
    console.log(
      "Document size:",
      JSON.stringify(didDocument).length,
      "characters"
    );

    const documentString = JSON.stringify(didDocument, null, 2);
    const blob = new Blob([documentString], { type: "application/json" });
    const safeDid = did.replace(/:/g, "_"); // Replace colons with underscores for filename safety
    const fileName = `diddoc-${safeDid}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    console.log("Uploading file:", fileName);
    const uploadResponse = await pinata.upload.file(file);
    console.log("Upload response:", uploadResponse);

    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading DID document to Pinata:", error);

    // Provide more specific error messages and try fallback
    if (error.message && error.message.includes("token is malformed")) {
      console.warn("Pinata authentication failed, trying fallback storage");
      return await storeDidDocumentFallback(did, didDocument);
    } else if (error.message && error.message.includes("INVALID_CREDENTIALS")) {
      console.warn("Pinata credentials invalid, trying fallback storage");
      return await storeDidDocumentFallback(did, didDocument);
    } else if (
      error.message &&
      error.message.includes("Cannot read properties of null")
    ) {
      console.warn(
        "Pinata SDK not properly initialized, trying fallback storage"
      );
      return await storeDidDocumentFallback(did, didDocument);
    }

    throw error;
  }
};

/**
 * Fallback storage method when Pinata is not available.
 * Generates a mock CID for development purposes.
 * @param {string} did - The DID for which the document is generated.
 * @param {Object} didDocument - The DID document object.
 * @returns {Promise<string>} - A mock IPFS hash for development.
 */
const storeDidDocumentFallback = async (did, didDocument) => {
  console.log("Using fallback storage for DID document");

  // Store in localStorage for development
  const safeDid = did.replace(/:/g, "_");
  const key = `diddoc_${safeDid}`;
  const data = JSON.stringify(didDocument, null, 2);

  try {
    localStorage.setItem(key, data);
    console.log(`DID document stored in localStorage with key: ${key}`);
  } catch (storageError) {
    console.warn("localStorage not available:", storageError);
  }

  // Generate a mock CID based on the content hash
  const mockCid = await generateMockCid(data);
  console.log("Generated mock CID:", mockCid);

  return mockCid;
};

/**
 * Generates a mock IPFS CID for development purposes.
 * @param {string} content - The content to generate a CID for.
 * @returns {Promise<string>} - A mock CID.
 */
const generateMockCid = async (content) => {
  // Create a simple hash of the content
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Format as a mock IPFS CID (starts with Qm for base58btc encoding simulation)
  return `Qm${hashHex.substring(0, 44)}`;
};

/**
 * Fetches a DID document from IPFS using the provided CID.
 * Tries Pinata gateway first, falls back to localStorage for development.
 * @param {string} cid - The IPFS CID of the DID document.
 * @returns {Promise<Object>} - The fetched DID document object.
 */
export const fetchDidDocument = async (cid) => {
  try {
    // Try Pinata gateway first
    if (import.meta.env.VITE_APP_PINATA_GATEWAY) {
      console.log("Fetching from Pinata gateway:", cid);
      const response = await fetch(
        `${import.meta.env.VITE_APP_PINATA_GATEWAY}/ipfs/${cid}`
      );
      if (response.ok) {
        return await response.json();
      } else {
        console.warn(
          "Pinata gateway fetch failed:",
          response.status,
          response.statusText
        );
      }
    }

    // Fallback to localStorage for mock CIDs
    console.log("Trying localStorage fallback for CID:", cid);
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith("diddoc_")
    );

    for (const key of keys) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          const mockCid = await generateMockCid(data);
          if (mockCid === cid) {
            console.log("Found matching document in localStorage");
            return JSON.parse(data);
          }
        }
      } catch (parseError) {
        console.warn("Failed to parse localStorage data for key:", key);
      }
    }

    throw new Error(`DID document with CID ${cid} not found in any storage`);
  } catch (error) {
    console.error("Error fetching DID document:", error);
    throw error;
  }
};

/**
 * Stores a student profile on Pinata by creating a JSON file that maps the student profile
 * with the associated DID and the CID of the DID document.
 *
 * @param {string} did - The DID of the student.
 * @param {Object} profileData - The profile data including student information.
 * @returns {Promise<string>} - The IPFS hash (CID) of the stored profile.
 */
export const storeStudentProfile = async (did, profileData) => {
  try {
    if (!isPinataAvailable()) {
      console.warn(
        "Pinata SDK not available, using fallback storage for student profile"
      );
      console.warn("Reason:", getPinataInitError());
      return await storeStudentProfileFallback(did, profileData);
    }

    console.log("Storing student profile for:", did);
    console.log(
      "Profile size:",
      JSON.stringify(profileData).length,
      "characters"
    );

    const profileString = JSON.stringify(profileData, null, 2);
    const blob = new Blob([profileString], { type: "application/json" });
    const safeDid = did.replace(/:/g, "_"); // Use underscore instead of colon for safety
    const fileName = `profile-${safeDid}-${Date.now()}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    console.log("Uploading profile file:", fileName);
    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: `profile-${safeDid}` },
    });
    console.log("Profile upload response:", uploadResponse);

    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading student profile to Pinata:", error);

    // Provide more specific error messages and try fallback
    if (error.message && error.message.includes("token is malformed")) {
      console.warn(
        "Pinata authentication failed, trying fallback storage for profile"
      );
      return await storeStudentProfileFallback(did, profileData);
    } else if (error.message && error.message.includes("INVALID_CREDENTIALS")) {
      console.warn(
        "Pinata credentials invalid, trying fallback storage for profile"
      );
      return await storeStudentProfileFallback(did, profileData);
    } else if (
      error.message &&
      error.message.includes("Cannot read properties of null")
    ) {
      console.warn(
        "Pinata SDK not properly initialized, trying fallback storage for profile"
      );
      return await storeStudentProfileFallback(did, profileData);
    }

    throw error;
  }
};

/**
 * Fallback storage method for student profiles when Pinata is not available.
 * Generates a mock CID for development purposes.
 * @param {string} did - The DID for which the profile is stored.
 * @param {Object} profileData - The profile data object.
 * @returns {Promise<string>} - A mock IPFS hash for development.
 */
const storeStudentProfileFallback = async (did, profileData) => {
  console.log("Using fallback storage for student profile");

  // Store in localStorage for development
  const safeDid = did.replace(/:/g, "_");
  const timestamp = Date.now();
  const key = `profile_${safeDid}_${timestamp}`;
  const data = JSON.stringify(profileData, null, 2);

  try {
    localStorage.setItem(key, data);
    console.log(`Student profile stored in localStorage with key: ${key}`);
  } catch (storageError) {
    console.warn("localStorage not available:", storageError);
  }

  // Generate a mock CID based on the content hash
  const mockCid = await generateMockCid(data);
  console.log("Generated mock profile CID:", mockCid);

  return mockCid;
};

/**
 * Stores a credential on Pinata by creating a JSON file that maps the credentials
 * with the associated DID and the CID of the credential document.
 *
 * @param {string} did - The DID of the student.
 * @param {Object} credentialData - The profile data including student information.
 * @returns {Promise<string>} - The IPFS hash (CID) of the stored profile.
 */
export const storeCredential = async (did, credentialData) => {
  try {
    if (!isPinataAvailable()) {
      console.warn(
        "Pinata SDK not available, using fallback storage for credential"
      );
      console.warn("Reason:", getPinataInitError());
      return await storeCredentialFallback(did, credentialData);
    }

    console.log("Storing credential for:", did);
    console.log(
      "Credential size:",
      JSON.stringify(credentialData).length,
      "characters"
    );

    const credentialString = JSON.stringify(credentialData, null, 2);
    const blob = new Blob([credentialString], { type: "application/json" });
    const safeDid = did.replace(/:/g, "_"); // Use underscore instead of colon for safety
    const fileName = `vc-${safeDid}-${Date.now()}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    console.log("Uploading credential file:", fileName);
    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: `credential-${safeDid}` },
    });
    console.log("Credential upload response:", uploadResponse);

    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading credential to Pinata:", error);

    // Provide more specific error messages and try fallback
    if (error.message && error.message.includes("token is malformed")) {
      console.warn(
        "Pinata authentication failed, trying fallback storage for credential"
      );
      return await storeCredentialFallback(did, credentialData);
    } else if (error.message && error.message.includes("INVALID_CREDENTIALS")) {
      console.warn(
        "Pinata credentials invalid, trying fallback storage for credential"
      );
      return await storeCredentialFallback(did, credentialData);
    } else if (
      error.message &&
      error.message.includes("Cannot read properties of null")
    ) {
      console.warn(
        "Pinata SDK not properly initialized, trying fallback storage for credential"
      );
      return await storeCredentialFallback(did, credentialData);
    }

    throw error;
  }
};

/**
 * Fallback storage method for credentials when Pinata is not available.
 * Generates a mock CID for development purposes.
 * @param {string} did - The DID for which the credential is stored.
 * @param {Object} credentialData - The credential data object.
 * @returns {Promise<string>} - A mock IPFS hash for development.
 */
const storeCredentialFallback = async (did, credentialData) => {
  console.log("Using fallback storage for credential");

  // Store in localStorage for development
  const safeDid = did.replace(/:/g, "_");
  const timestamp = Date.now();
  const key = `credential_${safeDid}_${timestamp}`;
  const data = JSON.stringify(credentialData, null, 2);

  try {
    localStorage.setItem(key, data);
    console.log(`Credential stored in localStorage with key: ${key}`);
  } catch (storageError) {
    console.warn("localStorage not available:", storageError);
  }

  // Generate a mock CID based on the content hash
  const mockCid = await generateMockCid(data);
  console.log("Generated mock credential CID:", mockCid);

  return mockCid;
};
/**
 * Stores a credential on Pinata by creating a JSON file that maps the credentials
 * with the associated DID and the CID of the credential document.
 *
 * @param {string} did - The DID of the student.
 * @param {Object} presentationData - The profile data including student information.
 * @returns {Promise<string>} - The IPFS hash (CID) of the stored profile.
 */
export const storePresentation = async (did, presentationData) => {
  try {
    const presentationString = JSON.stringify(presentationData, null, 2);
    const blob = new Blob([presentationString], { type: "application/json" });
    const safeDid = did.replace(/:/g, ":");
    const fileName = `vp-${safeDid}.json`;
    const file = new File([blob], fileName, { type: "application/json" });
    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: `presentation-${safeDid}` },
    });
    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading credential presentation to Pinata:", error);
    throw error;
  }
};

/**
 * Unpins a given CID from Pinata to free up space.
 * @param {string} cid - The IPFS CID to unpin.
 */
export const unpinCID = async (cid) => {
  try {
    await pinata.unpin(cid);
    console.log(`Successfully unpinned CID: ${cid}`);
  } catch (error) {
    console.error(`Failed to unpin CID ${cid}:`, error);
    throw error;
  }
};

/**
 * Append a new DID + timestamp to a global DID registry on Pinata.
 * @param {string} did - The DID to register
 * @param {string} didDocumentCid - The IPFS CID of the DID document (optional)
 * @returns {Promise<string>}  the new registry CID
 */
export const registerDidOnIpfs = async (did, didDocumentCid = null) => {
  try {
    const existingCid = await getDidRegistryCid();
    let registry;

    if (existingCid) {
      registry = await fetchDidDocument(existingCid);
    } else {
      registry = { dids: [] };
    }

    const entry = {
      did,
      timestamp: new Date().toISOString(),
    };

    // Add the DID document CID if provided
    if (didDocumentCid) {
      entry.didDocumentCid = didDocumentCid;
    }

    registry.dids.push(entry);

    const registryString = JSON.stringify(registry, null, 2);
    const blob = new Blob([registryString], { type: "application/json" });
    const file = new File([blob], "did-registry.json", {
      type: "application/json",
    });

    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: "did-registry.json" },
    });

    return uploadResponse.IpfsHash;
  } catch (err) {
    console.error("Error updating DID registry:", err);
    throw err;
  }
};

/**
 * Helper function to retrieve the current DID registry CID (if it exists)
 * by searching for a file with metadata name "did-registry.json".
 * @returns {Promise<string|null>} - The current registry CID or null if not found.
 */
const getDidRegistryCid = async () => {
  try {
    // Check if JWT token is available
    const jwtToken = import.meta.env.VITE_APP_PINATA_JWT;
    if (!jwtToken || jwtToken.trim() === "") {
      console.warn("Pinata JWT token not found or empty");
      return null;
    }

    const response = await fetch(
      `${
        import.meta.env.VITE_APP_PINATA_GATEWAY
      }/data/pinList?metadata[name]=did-registry.json`,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        "Failed to fetch DID registry from Pinata:",
        response.status,
        errorText
      );
      return null;
    }

    const data = await response.json();
    console.log("Pinata response for DID registry:", data);

    if (data.count > 0 && data.rows.length > 0) {
      return data.rows[0].ipfs_pin_hash;
    }
    return null;
  } catch (error) {
    console.error("Error fetching DID registry from Pinata:", error);
    return null;
  }
};
