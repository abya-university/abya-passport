// ipfsService.js

import { PinataSDK } from "pinata-web3";

// Initialize Pinata SDK using JWT and Gateway URL from environment variables
const pinata = new PinataSDK({
  pinataJwt: import.meta.env.VITE_PINATA_JWT,
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY,
});

/**
 * Uploads a DID document to Pinata with a filename that includes the DID.
 * @param {string} did - The DID for which the document is generated.
 * @param {Object} didDocument - The DID document object.
 * @returns {Promise<string>} - The IPFS hash (CID) of the uploaded document.
 */
export const storeDidDocument = async (did, didDocument) => {
  try {
    const documentString = JSON.stringify(didDocument, null, 2);
    const blob = new Blob([documentString], { type: "application/json" });
    const safeDid = did.replace(/:/g, ":");
    const fileName = `diddoc-${safeDid}.json`;
    const file = new File([blob], fileName, { type: "application/json" });
    const uploadResponse = await pinata.upload.file(file);
    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading DID document to Pinata:", error);
    throw error;
  }
};

/**
 * Fetches a DID document from Pinata using the provided CID.
 * @param {string} cid - The IPFS CID of the DID document.
 * @returns {Promise<Object>} - The fetched DID document object.
 */
export const fetchDidDocument = async (cid) => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_PINATA_GATEWAY}/ipfs/${cid}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch DID document from IPFS");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching DID document from Pinata:", error);
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
    const profileString = JSON.stringify(profileData, null, 2);
    const blob = new Blob([profileString], { type: "application/json" });
    const safeDid = did.replace(/:/g, ":");
    const fileName = `vc-${safeDid}.json`;
    const file = new File([blob], fileName, { type: "application/json" });
    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: `profile-${safeDid}` },
    });
    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading student profile to Pinata:", error);
    throw error;
  }
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
    const credentialString = JSON.stringify(credentialData, null, 2);
    const blob = new Blob([credentialString], { type: "application/json" });
    const safeDid = did.replace(/:/g, ":");
    const fileName = `vc-${safeDid}.json`;
    const file = new File([blob], fileName, { type: "application/json" });
    const uploadResponse = await pinata.upload.file(file, {
      pinataMetadata: { name: `credential-${safeDid}` },
    });
    return uploadResponse.IpfsHash;
  } catch (error) {
    console.error("Error uploading credential to Pinata:", error);
    throw error;
  }
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
 * @param {string} did
 * @returns {Promise<string>}  the new registry CID
 */
export const registerDidOnIpfs = async (did) => {
  try {
    const existingCid = await getDidRegistryCid();
    let registry;

    if (existingCid) {
      registry = await fetchDidDocument(existingCid);
    } else {
      registry = { dids: [] };
    }

    registry.dids.push({
      did,
      timestamp: new Date().toISOString(),
    });

    const registryString = JSON.stringify(registry, null, 2);
    const blob = new Blob([registryString], { type: "application/json" });
    const file = new File([blob], "did-registry.json", { type: "application/json" });

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
 * by searching for a file with metadata name "did.json".
 * @returns {Promise<string|null>} - The current registry CID or null if not found.
 */
const getDidRegistryCid = async () => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_APP_PINATA_GATEWAY}/data/pinList?metadata[name]=did.json`,
      {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_APP_PINATA_JWT}`,
        },
      }
    );
    const data = await response?.json();
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
