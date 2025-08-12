// src/veramo-ethr-did/server.js

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createAgent } from "@veramo/core";
import { CredentialPlugin } from "@veramo/credential-w3c";
import {
  DataStoreORM,
  KeyStore,
  DIDStore,
  PrivateKeyStore,
  Entities,
} from "@veramo/data-store";
import { DIDManager } from "@veramo/did-manager";
import { EthrDIDProvider } from "@veramo/did-provider-ethr";
import { KeyDIDProvider } from "@veramo/did-provider-key";
import { DIDResolverPlugin } from "@veramo/did-resolver";
import { KeyManager } from "@veramo/key-manager";
import { KeyManagementSystem, SecretBox } from "@veramo/kms-local";
import { MessageHandler } from "@veramo/message-handler";
import { createConnection } from "typeorm";
import { Resolver } from "did-resolver";
import { getResolver as ethrDidResolver } from "ethr-did-resolver";
import { getResolver as keyDidResolver } from "key-did-resolver";

console.log("ENV:", {
  ETH_NETWORK: process.env.ETH_NETWORK,
  ETH_PROVIDER_URL: process.env.ETH_PROVIDER_URL,
  ETH_REGISTRY_ADDRESS: process.env.ETH_REGISTRY_ADDRESS,
  INFURA_PROJECT_ID: process.env.INFURA_PROJECT_ID,
});

// SKALE Titan Network Configuration
const SKALE_TITAN_CONFIG = {
  name: "skale-titan",
  chainId: 1020352220,
  rpcUrl: "https://mainnet.skalenodes.com/v1/parallel-stormy-spica",
  // Use a known deployed registry or fallback to zero address for custom handling
  registry:
    process.env.ETH_REGISTRY_ADDRESS ||
    "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b", // ERC1056 registry on SKALE mainnet
};

// Network-specific configurations
const NETWORK_CONFIGS = {
  "skale-titan": SKALE_TITAN_CONFIG,
  skale: SKALE_TITAN_CONFIG, // Alias for backward compatibility
  sepolia: {
    name: "sepolia",
    chainId: 11155111,
    rpcUrl: "https://sepolia.infura.io/v3/0ab3a5daf9d64bbaaeac8ae7c09af18e",
    registry: "0xc0660d54f4655dC3B045D69ced4308f1709FD35e",
  },
};

// Get network configuration
const getNetworkConfig = () => {
  const networkName = process.env.ETH_NETWORK || "skale-titan";
  const config = NETWORK_CONFIGS[networkName] || SKALE_TITAN_CONFIG;

  return {
    name: config.name,
    rpcUrl: process.env.ETH_PROVIDER_URL || config.rpcUrl,
    registry: process.env.ETH_REGISTRY_ADDRESS || config.registry,
    chainId: config.chainId,
  };
};

// Function to check registry contract deployment
async function checkRegistryDeployment(networkConfig) {
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

    // Check if registry contract has code
    const code = await provider.getCode(networkConfig.registry);
    const isDeployed = code && code !== "0x";

    console.log(
      `Registry ${networkConfig.registry} on ${networkConfig.name}:`,
      isDeployed ? "✅ Deployed" : "❌ Not deployed or no code"
    );

    // If the current registry is not deployed, try some known registry addresses
    if (!isDeployed && networkConfig.name === "skale-titan") {
      const knownRegistries = [
        "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b", // Common ERC1056 address
        "0xd1d374dda6c5e1c0fd927de1c6c0e9cb7d7f12d3", // Alternative registry
        "0x0000000000000000000000000000000000000000", // Zero address (fallback)
      ];

      for (const registry of knownRegistries) {
        try {
          const registryCode = await provider.getCode(registry);
          const registryDeployed = registryCode && registryCode !== "0x";

          if (registryDeployed) {
            console.log(`Found working registry at: ${registry}`);
            return { isDeployed: true, registry };
          }
        } catch (err) {
          console.log(`Failed to check registry ${registry}:`, err.message);
        }
      }
    }

    return { isDeployed, registry: networkConfig.registry };
  } catch (error) {
    console.error(`Error checking registry deployment:`, error.message);
    return { isDeployed: false, registry: networkConfig.registry };
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
let dbConnection;
let agent;

// Secret key for encryption - In production, use environment variables
const SECRET_KEY =
  process.env.SECRET_KEY ||
  "3c186fb58980777698bab8e95f010f40fd0d04e14de8f49b551108351aefaf28";

// Initialize Veramo agent with proper network configuration
async function initializeAgent() {
  try {
    dbConnection = await createConnection({
      type: "sqlite",
      database: "./database.sqlite",
      synchronize: true,
      logging: false,
      entities: Entities,
    });
    console.log("Database connected successfully");

    const networkConfig = getNetworkConfig();
    console.log("Using network configuration:", networkConfig);

    // Check if registry is deployed
    const registryCheck = await checkRegistryDeployment(networkConfig);
    const actualRegistry = registryCheck.registry;

    if (!registryCheck.isDeployed) {
      console.warn(
        `⚠️  Warning: ERC1056 registry not found at ${networkConfig.registry} on ${networkConfig.name}`
      );
      console.warn(
        `⚠️  DID resolution may fail. Consider using a different registry address or deploying the contract.`
      );
      console.warn(
        `⚠️  For SKALE networks, you may need to deploy the ERC1056 registry contract.`
      );
    }

    agent = createAgent({
      plugins: [
        new KeyManager({
          store: new KeyStore(dbConnection),
          kms: {
            local: new KeyManagementSystem(
              new PrivateKeyStore(dbConnection, new SecretBox(SECRET_KEY))
            ),
          },
        }),
        new DIDManager({
          store: new DIDStore(dbConnection),
          defaultProvider: "did:key",
          providers: {
            "did:ethr": new EthrDIDProvider({
              defaultKms: "local",
              network: networkConfig.name,
              rpcUrl: networkConfig.rpcUrl,
              registry: actualRegistry,
            }),
            "did:key": new KeyDIDProvider({ defaultKms: "local" }),
          },
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...ethrDidResolver({
              networks: [
                {
                  name: networkConfig.name,
                  rpcUrl: networkConfig.rpcUrl,
                  registry: actualRegistry,
                },
                // Add support for 'skale' network name as alias for skale-titan
                {
                  name: "skale",
                  rpcUrl: networkConfig.rpcUrl,
                  registry: actualRegistry,
                },
                // Keep Sepolia as fallback for testing
                {
                  name: "sepolia",
                  rpcUrl:
                    "https://sepolia.infura.io/v3/0ab3a5daf9d64bbaaeac8ae7c09af18e",
                  registry: "0xc0660d54f4655dC3B045D69ced4308f1709FD35e",
                },
              ],
            }),
            ...keyDidResolver(),
          }),
        }),
        new CredentialPlugin(),
        new DataStoreORM(dbConnection),
        new MessageHandler({ messageHandlers: [] }),
      ],
    });
    console.log(
      "Veramo agent initialized successfully with network:",
      networkConfig.name
    );
  } catch (error) {
    console.error("Error initializing agent:", error);
    process.exit(1);
  }
}

// Routes

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Veramo Backend Service is running",
    timestamp: new Date().toISOString(),
  });
});

// Get agent information
app.get("/agent/info", async (req, res) => {
  try {
    const methods = await agent.availableMethods();
    res.json({
      availableMethods: methods,
      dataStoreConnected: !!dbConnection,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new DID
app.post("/did/create", async (req, res) => {
  try {
    const { provider = "did:key", alias, walletAddress, network } = req.body;

    let createOptions = {
      provider,
      alias: alias || `did-${Date.now()}`,
    };

    // If creating did:ethr and wallet address is provided
    if (provider === "did:ethr" && walletAddress) {
      // Validate Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid Ethereum wallet address format. Must be a 40-character hex string starting with '0x'",
        });
      }

      const networkConfig = getNetworkConfig();
      const targetNetwork = network || networkConfig.name;

      createOptions.options = {
        anchor: false, // Don't anchor to blockchain immediately
        network: targetNetwork,
      };

      // For did:ethr with wallet address, we create a DID that references the address
      const didIdentifier = `did:ethr:${targetNetwork}:${walletAddress}`;

      console.log(
        `Creating DID for network: ${targetNetwork}, address: ${walletAddress}`
      );

      // Check if DID already exists
      try {
        const existing = await agent.didManagerGet({ did: didIdentifier });
        return res.json({
          success: true,
          identifier: existing,
          message: "DID already exists for this wallet address",
        });
      } catch (error) {
        // DID doesn't exist, continue with creation
      }

      // Import the DID with the wallet address
      try {
        const identifier = await agent.didManagerImport({
          did: didIdentifier,
          provider: "did:ethr",
          controllerKeyId: walletAddress,
          alias: alias || `ethr-${walletAddress}`,
        });

        res.json({
          success: true,
          identifier,
          message: `DID created for wallet address on ${targetNetwork}`,
        });
      } catch (importError) {
        console.error("Import error:", importError);
        // If import fails, try regular creation
        const identifier = await agent.didManagerCreate({
          ...createOptions,
          options: {
            ...createOptions.options,
            address: walletAddress,
          },
        });

        res.json({
          success: true,
          identifier,
        });
      }
    } else {
      // Regular DID creation (did:key or did:ethr without specific wallet)
      const identifier = await agent.didManagerCreate(createOptions);

      res.json({
        success: true,
        identifier,
      });
    }
  } catch (error) {
    console.error("DID creation error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get all DIDs
app.get("/did/list", async (req, res) => {
  try {
    const identifiers = await agent.didManagerFind();
    res.json({
      success: true,
      identifiers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get a specific DID
app.get("/did/:did", async (req, res) => {
  try {
    const { did } = req.params;
    const identifier = await agent.didManagerGet({ did });
    res.json({
      success: true,
      identifier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create a Verifiable Credential
app.post("/credential/create", async (req, res) => {
  try {
    const {
      issuerDid,
      subjectDid,
      credentialSubject,
      type = ["VerifiableCredential"],
      expirationDate,
    } = req.body;

    if (!issuerDid || !subjectDid || !credentialSubject) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: issuerDid, subjectDid, credentialSubject",
      });
    }

    const credential = await agent.createVerifiableCredential({
      credential: {
        issuer: { id: issuerDid },
        credentialSubject: {
          id: subjectDid,
          ...credentialSubject,
        },
        type,
        ...(expirationDate && { expirationDate }),
      },
      proofFormat: "jwt",
    });

    res.json({
      success: true,
      credential,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Verify a Verifiable Credential
app.post("/credential/verify", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: credential",
      });
    }

    const result = await agent.verifyCredential({ credential });

    res.json({
      success: true,
      verification: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get all credentials
app.get("/credential/list", async (req, res) => {
  try {
    const credentials = await agent.dataStoreORMGetVerifiableCredentials();
    res.json({
      success: true,
      credentials,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create a Verifiable Presentation
app.post("/presentation/create", async (req, res) => {
  try {
    const {
      holderDid,
      verifiableCredentials,
      type = ["VerifiablePresentation"],
      domain,
      challenge,
    } = req.body;

    if (
      !holderDid ||
      !verifiableCredentials ||
      !Array.isArray(verifiableCredentials)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: holderDid, verifiableCredentials (array)",
      });
    }

    const presentation = await agent.createVerifiablePresentation({
      presentation: {
        holder: holderDid,
        verifiableCredential: verifiableCredentials,
        type,
        ...(domain && { domain }),
        ...(challenge && { challenge }),
      },
      proofFormat: "jwt",
    });

    res.json({
      success: true,
      presentation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Verify a Verifiable Presentation
app.post("/presentation/verify", async (req, res) => {
  try {
    const { presentation, domain, challenge } = req.body;

    if (!presentation) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: presentation",
      });
    }

    const result = await agent.verifyPresentation({
      presentation,
      ...(domain && { domain }),
      ...(challenge && { challenge }),
    });

    res.json({
      success: true,
      verification: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get all presentations
app.get("/presentation/list", async (req, res) => {
  try {
    const presentations = await agent.dataStoreORMGetVerifiablePresentations();
    res.json({
      success: true,
      presentations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Resolve a DID Document
app.get("/did/:did/resolve", async (req, res) => {
  try {
    const { did } = req.params;
    console.log(`Attempting to resolve DID: ${did}`);

    // Check if it's an ethr DID and validate network
    if (did.startsWith("did:ethr:")) {
      const parts = did.split(":");
      if (parts.length >= 4) {
        const network = parts[2];
        const address = parts[3];

        console.log(
          `DID components - Network: ${network}, Address: ${address}`
        );

        // Check if we have configuration for this network
        const networkConfig = getNetworkConfig();
        if (
          network !== networkConfig.name &&
          network !== "skale" &&
          network !== "skale-titan"
        ) {
          return res.status(400).json({
            success: false,
            error: `Network '${network}' is not configured. Available networks: ${networkConfig.name}`,
          });
        }
      }
    }

    const resolution = await agent.resolveDid({ didUrl: did });
    res.json({
      success: true,
      resolution,
    });
  } catch (error) {
    console.error(`DID resolution error for ${req.params.did}:`, error);

    let errorMessage = error.message;
    if (error.message.includes("could not decode result data")) {
      errorMessage = `Registry contract error: The ERC1056 registry may not be deployed or properly configured on this network. Original error: ${error.message}`;
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      did: req.params.did,
    });
  }
});

// New endpoint to check network and registry status
app.get("/network/status", async (req, res) => {
  try {
    const networkConfig = getNetworkConfig();
    const registryCheck = await checkRegistryDeployment(networkConfig);

    res.json({
      success: true,
      network: {
        name: networkConfig.name,
        chainId: networkConfig.chainId,
        rpcUrl: networkConfig.rpcUrl,
        registry: registryCheck.registry,
        registryDeployed: registryCheck.isDeployed,
        configuredRegistry: networkConfig.registry,
        actualRegistry: registryCheck.registry,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Start server
async function startServer() {
  await initializeAgent();

  app.listen(PORT, () => {
    console.log(`🚀 Veramo Backend Service is running on port ${PORT}`);
    console.log(
      `📖 API Documentation available at http://localhost:${PORT}/health`
    );
    console.log("🔑 Available endpoints:");
    console.log("  GET  /health - Health check");
    console.log("  GET  /agent/info - Agent information");
    console.log("  GET  /network/status - Network and registry status");
    console.log("  POST /did/create - Create new DID");
    console.log("  GET  /did/list - List all DIDs");
    console.log("  GET  /did/:did - Get specific DID");
    console.log("  GET  /did/:did/resolve - Resolve DID document");
    console.log("  POST /credential/create - Create verifiable credential");
    console.log("  POST /credential/verify - Verify verifiable credential");
    console.log("  GET  /credential/list - List all credentials");
    console.log("  POST /presentation/create - Create verifiable presentation");
    console.log("  POST /presentation/verify - Verify verifiable presentation");
    console.log("  GET  /presentation/list - List all presentations");
  });
}

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n⏱️  Shutting down gracefully...");
  if (dbConnection) {
    await dbConnection.close();
    console.log("📦 Database connection closed");
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n⏱️  Shutting down gracefully...");
  if (dbConnection) {
    await dbConnection.close();
    console.log("📦 Database connection closed");
  }
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
