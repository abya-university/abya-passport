# Veramo Backend Service Examples

This document provides example API calls for the Veramo backend service.

## Prerequisites

1. Start the server: `npm start` or `npm run dev`
2. The server will be running on `http://localhost:3000`

## API Examples

### 1. Health Check

```bash
curl -X GET http://localhost:3000/health
```

### 2. Get Agent Information

```bash
curl -X GET http://localhost:3000/agent/info
```

### 3. Create a DID

#### Create a did:key (default)

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "my-first-did"
  }'
```

#### Create a did:ethr

```bash
curl -X POST http://localhost:3000/did/create \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "did:ethr",
    "alias": "my-ethr-did"
  }'
```

### 4. List All DIDs

```bash
curl -X GET http://localhost:3000/did/list
```

### 5. Get Specific DID

```bash
curl -X GET http://localhost:3000/did/did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

### 6. Resolve DID Document

```bash
curl -X GET http://localhost:3000/did/did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK/resolve
```

### 7. Create a Verifiable Credential

```bash
curl -X POST http://localhost:3000/credential/create \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "subjectDid": "did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp",
    "credentialSubject": {
      "name": "John Doe",
      "degree": "Bachelor of Science",
      "university": "Example University"
    },
    "type": ["VerifiableCredential", "UniversityDegreeCredential"]
  }'
```

### 8. Verify a Verifiable Credential

```bash
curl -X POST http://localhost:3000/credential/verify \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ..."
  }'
```

### 9. List All Credentials

```bash
curl -X GET http://localhost:3000/credential/list
```

### 10. Create a Verifiable Presentation

```bash
curl -X POST http://localhost:3000/presentation/create \
  -H "Content-Type: application/json" \
  -d '{
    "holderDid": "did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp",
    "verifiableCredentials": [
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ..."
    ],
    "type": ["VerifiablePresentation"],
    "domain": "example.com",
    "challenge": "random-challenge-string"
  }'
```

### 11. Verify a Verifiable Presentation

```bash
curl -X POST http://localhost:3000/presentation/verify \
  -H "Content-Type: application/json" \
  -d '{
    "presentation": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ...",
    "domain": "example.com",
    "challenge": "random-challenge-string"
  }'
```

### 12. List All Presentations

```bash
curl -X GET http://localhost:3000/presentation/list
```

## Example Workflow

1. **Create two DIDs** (one for issuer, one for subject)
2. **Create a credential** using the issuer DID for the subject DID
3. **Verify the credential** to ensure it's valid
4. **Create a presentation** using the subject DID and the credential
5. **Verify the presentation** to ensure it's valid

## Response Formats

All responses follow this format:

```json
{
  "success": true/false,
  "data": { ... },  // or specific field names like "identifier", "credential", etc.
  "error": "error message if success is false"
}
```

## Notes

- Replace the DIDs in the examples with actual DIDs returned by your `/did/create` calls
- Replace credential and presentation JWTs with actual tokens returned by the API
- The server uses SQLite database stored in `./database.sqlite`
- All credentials and presentations are stored in the database automatically
