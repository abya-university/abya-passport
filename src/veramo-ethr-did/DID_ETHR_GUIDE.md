# DID:ETHR Wallet Address Integration

This document explains how to use wallet addresses with the `did:ethr` method in the Veramo backend service.

## Configuration

The service is configured to use SKALE testnet by default. Configuration is handled through environment variables:

```env
ETH_NETWORK=skale
ETH_PROVIDER_URL=https://testnet.skalenodes.com/v1/aware-fake-trim-testnet
```

## Creating DID:ETHR with Wallet Address

### Basic Usage

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "alias": "my-wallet-did"
  }'
```

### Parameters

- **provider**: Must be `"did:ethr"`
- **walletAddress**: Ethereum address (40-character hex string starting with '0x')
- **alias**: (Optional) Human-readable alias for the DID
- **network**: (Optional) Network name (defaults to 'skale' from environment)

### Response Format

```json
{
  "success": true,
  "identifier": {
    "did": "did:ethr:skale:0x03406b8de31fc2b7eb247e406e5b4952436a85911c889d5dffd87a01a7c059aed5",
    "controllerKeyId": "04406b8de31fc2b7eb247e406e5b4952436a85911c889d5dffd87a01a7c059aed5...",
    "keys": [...],
    "services": [],
    "provider": "did:ethr",
    "alias": "my-wallet-did"
  }
}
```

## Examples

### 1. Create DID from MetaMask Address

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "alias": "vitalik-test"
  }'
```

### 2. Create DID with Custom Network

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "alias": "custom-network-did",
    "network": "skale"
  }'
```

### 3. Regular DID:ETHR (Generated Key)

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "alias": "generated-ethr-did"
  }'
```

## Error Handling

### Invalid Wallet Address

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "invalid-address"
  }'
```

Response:

```json
{
  "success": false,
  "error": "Invalid Ethereum wallet address format. Must be a 40-character hex string starting with '0x'"
}
```

### Duplicate Alias

```json
{
  "success": false,
  "error": "illegal_argument: Identifier with alias: my-wallet-did already exists: did:ethr:skale:0x..."
}
```

## Workflow Integration

### Complete Wallet-to-Credential Flow

1. **Create Issuer DID**:

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "alias": "issuer-wallet"
  }'
```

2. **Create Subject DID**:

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "walletAddress": "0xAbCdEf1234567890123456789012345678901234",
    "alias": "subject-wallet"
  }'
```

3. **Create Verifiable Credential**:

```bash
curl -X POST http://localhost:3000/credential/create \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "did:ethr:skale:0x1234567890123456789012345678901234567890",
    "subjectDid": "did:ethr:skale:0xAbCdEf1234567890123456789012345678901234",
    "credentialSubject": {
      "name": "John Doe",
      "walletAddress": "0xAbCdEf1234567890123456789012345678901234",
      "verified": true
    }
  }'
```

## Network Configuration

### Supported Networks

- **SKALE Testnet** (default): `skale`
- **Ethereum Mainnet**: `mainnet`
- **Goerli Testnet**: `goerli`

### Adding Custom Networks

To add support for additional networks, update the `.env` file:

```env
ETH_NETWORK=my-custom-network
ETH_PROVIDER_URL=https://my-rpc-endpoint.com
ETH_REGISTRY_ADDRESS=0x... # Optional custom registry
```

## Security Considerations

1. **Wallet Address Validation**: The service validates Ethereum address format
2. **Network Isolation**: DIDs are network-specific
3. **Key Management**: Private keys are stored encrypted in the local database
4. **No Private Key Import**: The service doesn't import private keys from wallet addresses

## Limitations

- The service creates DIDs that reference wallet addresses but doesn't control the private keys
- Signing operations require the actual wallet to be connected for blockchain transactions
- DID resolution works through the configured RPC endpoint
