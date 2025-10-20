import axios from "axios";
import FormData from "form-data";

const pinataApiKey = import.meta.env.VITE_APP_PINATA_API_KEY;
const pinataSecretApiKey = import.meta.env.VITE_APP_PINATA_SECRET_KEY;

const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cf-ipfs.com/ipfs/",
  "https://gateway.ipfs.io/ipfs/"
];

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
  if (!ipfsHash || ipfsHash === 'undefined') {
    throw new Error("Invalid IPFS hash provided");
  }

  console.log(`📥 Retrieving from IPFS: ${ipfsHash}`);

  // Try each gateway with timeout and retry logic
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    const gateway = IPFS_GATEWAYS[i];
    const url = `${gateway}${ipfsHash}`;

    try {
      console.log(`Trying gateway ${i + 1}/${IPFS_GATEWAYS.length}: ${gateway}`);

      const response = await axios.get(url, {
        timeout: 15000, // 15 second timeout
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        // Add retry logic for rate limits
        validateStatus: function (status) {
          return status < 500; // Resolve only if the status code is less than 500
        }
      });
      if (response.status === 429) {
        console.warn(`Rate limited by ${gateway}, trying next gateway...`);
        continue;
      }

      if (response.status === 200) {
        console.log(`✅ Successfully retrieved from: ${gateway}`);
        return response.data;
      }

    } catch (error) {
      console.warn(`Gateway ${gateway} failed:`, error.message);

      // If this is the last gateway, throw the error
      if (i === IPFS_GATEWAYS.length - 1) {
        console.error("❌ All IPFS gateways failed");
        throw new Error(`Failed to retrieve from IPFS after trying ${IPFS_GATEWAYS.length} gateways. Last error: ${error.message}`);
      }

      // Wait before trying next gateway (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, i), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error("All IPFS gateways exhausted");
};

// ...existing code...

export const getFromIPFSWithRetry = async (ipfsHash, maxRetries = 3) => {
  if (!ipfsHash || ipfsHash === 'undefined') {
    throw new Error("Invalid IPFS hash provided");
  }

  console.log(`📥 Retrieving from IPFS: ${ipfsHash}`);

  // Try each gateway with different CORS strategies
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
      const gateway = IPFS_GATEWAYS[i];
      const url = `${gateway}${ipfsHash}`;

      try {
        console.log(`Attempt ${attempt}/${maxRetries}, Gateway ${i + 1}/${IPFS_GATEWAYS.length}: ${gateway}`);

        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            // Remove potentially problematic headers
          },
          // Disable preflight for simple requests
          maxRedirects: 5,
          validateStatus: (status) => status < 500,
          // Add CORS mode explicitly
          mode: 'cors',
          credentials: 'omit'
        });

        if (response.status === 429) {
          console.warn(`Rate limited by ${gateway}, trying next gateway...`);
          continue;
        }

        if (response.status === 200) {
          console.log(`✅ Successfully retrieved from: ${gateway}`);
          return response.data;
        }

      } catch (error) {
        console.warn(`Gateway ${gateway} failed:`, error.message);
        continue; // Try next gateway immediately
      }
    }

    // If all gateways failed this attempt, wait before retrying
    if (attempt < maxRetries) {
      const delay = 2000 * attempt;
      console.log(`All gateways failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error("All IPFS gateways exhausted after retries");
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