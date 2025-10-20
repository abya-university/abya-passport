import { createThirdwebClient } from "thirdweb";
import { sepolia, mainnet, polygon } from "thirdweb/chains";

const CLIENT_ID =
  import.meta.env.VITE_APP_THIRDWEB_CLIENT_ID ||
  "d225024adb116ac9e910710610762001";

if (!CLIENT_ID) {
  console.error("Missing VITE_THIRDWEB_CLIENT_ID environment variable");
}

export const client = createThirdwebClient({
  clientId: CLIENT_ID,
  // Optional: Add domain whitelist for security

  chain: sepolia,
  chains: [sepolia, mainnet, polygon],

  domains: [
    "localhost:3000",
    "localhost:5173", // Vite default port
    window.location.hostname,
  ],
});