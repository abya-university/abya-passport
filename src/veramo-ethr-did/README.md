# Veramo Backend Service

A complete backend service built with the Veramo SDK for managing decentralized identities, verifiable credentials, and verifiable presentations.

## Features

- ✅ **DID Management**: Create and manage decentralized identifiers (DIDs)
- ✅ **Verifiable Credentials**: Issue, verify, and store verifiable credentials
- ✅ **Verifiable Presentations**: Create and verify verifiable presentations
- ✅ **Multiple DID Methods**: Support for `did:key` and `did:ethr`
- ✅ **Secure Storage**: Encrypted local key management with SQLite database
- ✅ **RESTful API**: Complete REST API for all operations
- ✅ **CORS Support**: Cross-origin resource sharing enabled
- ✅ **Error Handling**: Comprehensive error handling and validation

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/peter-mwau/veramo_backend_service.git
cd veramo_backend_service

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration:

```env
PORT=3000
SECRET_KEY=your-super-secret-key-change-this-in-production
```

### Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health & Agent Info

- `GET /health` - Health check
- `GET /agent/info` - Get agent information and available methods

### DID Management

- `POST /did/create` - Create a new DID
- `GET /did/list` - List all DIDs
- `GET /did/:did` - Get specific DID information
- `GET /did/:did/resolve` - Resolve DID document

### Verifiable Credentials

- `POST /credential/create` - Create a verifiable credential
- `POST /credential/verify` - Verify a verifiable credential
- `GET /credential/list` - List all stored credentials

### Verifiable Presentations

- `POST /presentation/create` - Create a verifiable presentation
- `POST /presentation/verify` - Verify a verifiable presentation
- `GET /presentation/list` - List all stored presentations

## Usage Examples

### 1. Create a DID

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{"alias": "my-first-did"}'
```

### 2. Create a Verifiable Credential

```bash
  curl -X POST http://localhost:3000/credential/create \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "did:key:z6MkfGoemGBMEkxj6YKkcScKNrS8VDUyUPoF3CqGabp4LUMp",
    "subjectDid": "did:key:z6MkvioxLE3eYFLpZbkZLgMPuMsM6AM8yHmY4GPNz8goiKnC",
    "credentialSubject": {
      "name": "John Doe",
      "degree": "Bachelor of Science in Computer Science",
      "university": "ABYA University"
    },
    "type": ["VerifiableCredential", "UniversityDegreeCredential"]
  }'
```

For more detailed examples, see [API_EXAMPLES.md](./API_EXAMPLES.md).

## Architecture

### Core Components

- **Veramo Agent**: The main agent handling all cryptographic operations
- **Key Management**: Local encrypted key storage using SecretBox
- **Data Store**: SQLite database for persistent storage
- **DID Providers**: Support for multiple DID methods
- **Credential Plugin**: W3C Verifiable Credentials support

### Database Schema

The service uses TypeORM with SQLite to store:

- Identity keys and metadata
- DIDs and their associated keys
- Verifiable credentials
- Verifiable presentations
- Message history

### Security Features

- 🔐 **Encrypted Key Storage**: All private keys are encrypted using SecretBox
- 🛡️ **Input Validation**: Comprehensive request validation
- 🔒 **Secure Defaults**: Sensible security defaults throughout
- 📝 **Audit Trail**: All operations are logged and stored

## Development

### Project Structure

```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── database.sqlite        # SQLite database (auto-created)
├── .env.example          # Environment variables template
├── API_EXAMPLES.md       # API usage examples
└── README.md            # This file
```

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run tests (not implemented yet)

### Adding New Features

1. **New Endpoints**: Add routes in `server.js`
2. **New DID Methods**: Add providers to the agent configuration
3. **Custom Plugins**: Create and register new Veramo plugins
4. **Database Changes**: Modify entity configurations for schema updates

## Production Deployment

### Environment Variables

Set these environment variables in production:

```env
PORT=3000
SECRET_KEY=your-production-secret-key
DATABASE_PATH=/path/to/database.sqlite
ETH_NETWORK=mainnet
ETH_PROVIDER_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
```

### Security Considerations

1. **Change the secret key** in production
2. **Use HTTPS** for all communications
3. **Backup the database** regularly
4. **Monitor access logs** for suspicious activity
5. **Keep dependencies updated**

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Resources

- [Veramo Documentation](https://veramo.io)
- [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)
- [Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-core/)
- [JSON Web Tokens (JWT)](https://jwt.io/)

## Support

If you encounter any issues or have questions:

1. Check the [API Examples](./API_EXAMPLES.md)
2. Review the [Veramo documentation](https://veramo.io)
3. Open an issue on GitHub
4. Contact the maintainers

---

Built with ❤️ using [Veramo](https://veramo.io) and [Express.js](https://expressjs.com)
