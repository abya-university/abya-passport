import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Iter "mo:base/Iter";

persistent actor class DIDRegistry() = this {
  // Public function to get DID for the CALLER's principal
  public shared(msg) func getMyDid() : async Text {
    let did = "did:icp:" # Principal.toText(msg.caller);
    return did;
  };

  // Optional: Get DID for any principal (authenticated)
  public shared(_msg) func getDidForPrincipal(principal : Principal) : async Text {
    // Add admin/auth checks here if needed
    let did = "did:icp:" # Principal.toText(principal);
    return did;
  };

  // Returns a minimal W3C-compliant DID document
  public shared func resolveDid(did : Text) : async Text {
    assert(isValidDid(did)); // Verify DID format

    let principal = extractPrincipal(did); // Extract from "did:icp:xyz"
    let publicKey = await getPublicKey(principal); // Get user's public key

    let didDocument : Text = 
      "{" #
        "\"@context\": \"https://www.w3.org/ns/did/v1\"," #
        "\"id\": \"" # did # "\"," #
        "\"verificationMethod\": [{" #
          "\"id\": \"" # did # "#keys-1\"," #
          "\"type\": \"Ed25519VerificationKey2020\"," #
          "\"controller\": \"" # did # "\"," #
          "\"publicKeyMultibase\": \"" # publicKey # "\"" #
        "}]," #
        "\"authentication\": [\"" # did # "#keys-1\"]" #
      "}";

    didDocument
  };

  // Helper: Extract Principal from DID string
  func extractPrincipal(did : Text) : Principal {
    let parts = Text.split(did, #char ':');
    let principalPart = Iter.toArray(parts)[2]; // "did:icp:PRINCIPAL"
    Principal.fromText(principalPart)
  };

  // Helper: Validate DID format
  func isValidDid(did : Text) : Bool {
    Text.startsWith(did, #text "did:icp:")
  };

  // Mock: Replace with actual public key fetch (e.g., from Internet Identity)
  func getPublicKey(_principal : Principal) : async Text {
    // In production, fetch from Internet Identity or threshold ECDSA
    "z6Mk...abc123" // Multibase-encoded Ed25519 key
  };
};