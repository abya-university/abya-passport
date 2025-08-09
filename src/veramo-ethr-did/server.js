// src/veramo-ethr-did/server.js

import dotenv from 'dotenv';
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
const SECRET_KEY = process.env.SECRET_KEY ||
  "29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c";

// Initialize Veramo agent with Sepolia configuration
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
              network: process.env.ETH_NETWORK || "sepolia",
              rpcUrl:
                process.env.ETH_PROVIDER_URL ||
                `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
              registry: process.env.ETH_REGISTRY_ADDRESS,
            }),
            "did:key": new KeyDIDProvider({ defaultKms: "local" }),
          },
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...ethrDidResolver({
              networks: [
                {
                  name: process.env.ETH_NETWORK || "sepolia",
                  rpcUrl:
                    process.env.ETH_PROVIDER_URL ||
                    `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
                  registry: process.env.ETH_REGISTRY_ADDRESS,
                },
                {
                  name: "mainnet",
                  rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
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
    console.log("Veramo agent initialized successfully");
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

      createOptions.options = {
        anchor: false, // Don't anchor to blockchain immediately
        network: network || process.env.ETH_NETWORK || "skale",
      };

      // For did:ethr with wallet address, we create a DID that references the address
      const didIdentifier = `did:ethr:${
        network || process.env.ETH_NETWORK || "skale"
      }:${walletAddress}`;

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
          message: "DID created for wallet address",
        });
      } catch (importError) {
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
    const resolution = await agent.resolveDid({ didUrl: did });
    res.json({
      success: true,
      resolution,
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