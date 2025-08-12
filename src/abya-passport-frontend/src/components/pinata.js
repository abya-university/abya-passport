import axios from "axios";
import FormData from "form-data";

const pinataApiKey = "b5de97e4d7f291fffa29";
const pinataSecretApiKey =
  "3c186fb58980777698bab8e95f010f40fd0d04e14de8f49b551108351aefaf28";

export const uploadFileToPinata = async (file) => {
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  if (!url) {
    throw new Error("Pinata API endpoint URL is not defined");
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axios.post(url, formData, {
      maxContentLength: "Infinity", // Increase the maximum content length
      maxBodyLength: "Infinity", // Increase the maximum body length
      timeout: 600000,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataSecretApiKey,
      },
    });

    return response.data.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading to Pinata:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

export const uploadMetadataToIPFS = async (metadata) => {
  const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;

  try {
    const response = await axios.post(url, metadata, {
      maxContentLength: "Infinity", // Increase the maximum content length
      maxBodyLength: "Infinity", // Increase the maximum body length
      timeout: 600000,
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataSecretApiKey,
      },
    });

    console.log("Metadata IPFS hash:", response.data.IpfsHash);
    return response.data.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading metadata to IPFS:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};

export const getFromIPFS = async (ipfsHash) => {
  const url = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(
      "Error fetching from IPFS:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

export const getPinnedData = async () => {
  const url = `https://api.pinata.cloud/data/pinList?status=pinned`;

  try {
    const response = await axios.get(url, {
      headers: {
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataSecretApiKey,
      },
    });

    return response.data.rows; // This will return the array of pinned files
  } catch (error) {
    console.error(
      "Error fetching data from Pinata:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

// Unpin (delete) content from IPFS - for rollback purposes
export const unpinFromIPFS = async (ipfsHash) => {
  const url = `https://api.pinata.cloud/pinning/unpin/${ipfsHash}`;

  try {
    const response = await axios.delete(url, {
      headers: {
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataSecretApiKey,
      },
    });

    console.log("Content unpinned from IPFS:", ipfsHash);
    return true;
  } catch (error) {
    console.error(
      "Error unpinning from IPFS:",
      error.response ? error.response.data : error.message
    );
    return false;
  }
};
