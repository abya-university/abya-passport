import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import Int "mo:base/Int";
import Map "mo:base/HashMap";
import Random "mo:base/Random";
import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Nat8 "mo:base/Nat8";

persistent actor class DIDRegistry() = this {
  
  // VC Type Definition
  type VC = {
    id: Text;
    issuer: Text;
    credentialSubject: {
      id: Text;
      claims: [(Text, Text)];
    };
    issuanceDate: Text;
    expirationDate: ?Text;
    proof: ?{
      proofType: Text;
      created: Text;
      proofPurpose: Text;
      verificationMethod: Text;
      signature: Text;
    };
  };

  // Storage for issued VCs
  private stable var vcEntries : [(Text, VC)] = [];
  private var vcs : Map.HashMap<Text, VC> = Map.HashMap<Text, VC>(0, Text.equal, Text.hash);

  // Pre/post upgrade hooks
  system func preupgrade() {
    vcEntries := Iter.toArray(vcs.entries());
  };

  system func postupgrade() {
    vcs := Map.HashMap<Text, VC>(0, Text.equal, Text.hash);
    for ((id, vc) in vcEntries.vals()) {
      vcs.put(id, vc);
    };
    vcEntries := [];
  };
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

  // ==================== VC ISSUANCE FUNCTIONS ====================

  // Issue a VC for a DID
  public shared(msg) func issueVC(
    recipientDid: Text,
    claims: [(Text, Text)],
    expiresInHours: ?Nat
  ) : async Text {
    assert(not Principal.isAnonymous(msg.caller));
    assert(isValidDid(recipientDid));

    let issuerDid = "did:icp:" # Principal.toText(msg.caller);
    let now = Int.toText(Time.now());
    let expiration = switch (expiresInHours) {
      case (?hours) ?Int.toText(Time.now() + hours * 3_600_000_000_000);
      case null null;
    };

    let vcId = await generateUUID();
    let vc : VC = {
      id = vcId;
      issuer = issuerDid;
      credentialSubject = { id = recipientDid; claims };
      issuanceDate = now;
      expirationDate = expiration;
      proof = null; // Added after signing
    };

    let signedVC = await signVC(vc);
    vcs.put(vcId, signedVC);
    return vcToJson(signedVC);
  };

  // Get all VCs issued by the caller
  public shared(msg) func getMyIssuedVCs() : async [Text] {
    assert(not Principal.isAnonymous(msg.caller));
    let issuerDid = "did:icp:" # Principal.toText(msg.caller);
    
    let issuedVCs = Array.filter<VC>(
      Iter.toArray(vcs.vals()),
      func(vc: VC) : Bool { vc.issuer == issuerDid }
    );
    
    Array.map<VC, Text>(issuedVCs, vcToJson)
  };

  // Get all VCs for a specific recipient DID
  public shared func getVCsForDid(did: Text) : async [Text] {
    assert(isValidDid(did));
    
    let recipientVCs = Array.filter<VC>(
      Iter.toArray(vcs.vals()),
      func(vc: VC) : Bool { vc.credentialSubject.id == did }
    );
    
    Array.map<VC, Text>(recipientVCs, vcToJson)
  };

  // Get a specific VC by ID
  public shared func getVC(vcId: Text) : async ?Text {
    switch (vcs.get(vcId)) {
      case (?vc) ?vcToJson(vc);
      case null null;
    }
  };

  // ==================== VC VERIFICATION FUNCTIONS ====================

  // Verify a VC's signature and validity
  public shared func verifyVC(vcId: Text) : async {
    isValid: Bool;
    isExpired: Bool;
    issuerValid: Bool;
    signatureValid: Bool;
    errors: [Text];
  } {
    switch (vcs.get(vcId)) {
      case null {
        return {
          isValid = false;
          isExpired = false;
          issuerValid = false;
          signatureValid = false;
          errors = ["VC not found"];
        };
      };
      case (?vc) {
        var errors: [Text] = [];
        
        // Check expiration
        let isExpired = switch (vc.expirationDate) {
          case null false;
          case (?expDate) {
            // Parse expiration timestamp and compare with current time
            switch (textToInt(expDate)) {
              case null { 
                errors := Array.append(errors, ["Invalid expiration date format"]); 
                true 
              };
              case (?exp) Time.now() > exp;
            }
          };
        };

        // Check issuer DID validity
        let issuerValid = isValidDid(vc.issuer);
        if (not issuerValid) {
          errors := Array.append(errors, ["Invalid issuer DID"]);
        };

        // Check recipient DID validity
        let recipientValid = isValidDid(vc.credentialSubject.id);
        if (not recipientValid) {
          errors := Array.append(errors, ["Invalid recipient DID"]);
        };

        // Check signature (mock implementation)
        let signatureValid = await verifySignature(vc);
        if (not signatureValid) {
          errors := Array.append(errors, ["Invalid signature"]);
        };

        let isValid = issuerValid and recipientValid and signatureValid and not isExpired;

        return {
          isValid;
          isExpired;
          issuerValid;
          signatureValid;
          errors;
        };
      };
    }
  };

  // Revoke a VC (only by issuer)
  public shared(msg) func revokeVC(vcId: Text) : async Bool {
    assert(not Principal.isAnonymous(msg.caller));
    let callerDid = "did:icp:" # Principal.toText(msg.caller);
    
    switch (vcs.get(vcId)) {
      case null false;
      case (?vc) {
        if (vc.issuer != callerDid) {
          false // Only issuer can revoke
        } else {
          vcs.delete(vcId);
          true
        }
      };
    }
  };

  // ==================== HELPER FUNCTIONS ====================

  // Helper: Parse text to integer
  func textToInt(text: Text) : ?Int {
    var result: Int = 0;
    var negative = false;
    let chars = Text.toIter(text);
    
    // Check for negative sign
    switch (chars.next()) {
      case null return null;
      case (?'-') { negative := true };
      case (?c) {
        switch (charToDigit(c)) {
          case null return null;
          case (?digit) result := digit;
        };
      };
    };
    
    // Parse remaining digits
    for (c in chars) {
      switch (charToDigit(c)) {
        case null return null;
        case (?digit) {
          result := result * 10 + digit;
        };
      };
    };
    
    if (negative) ?(-result) else ?result
  };

  // Helper: Convert character to digit
  func charToDigit(c: Char) : ?Int {
    switch (c) {
      case '0' ?0; case '1' ?1; case '2' ?2; case '3' ?3; case '4' ?4;
      case '5' ?5; case '6' ?6; case '7' ?7; case '8' ?8; case '9' ?9;
      case _ null;
    }
  };

  // Helper: Sign VC with canister's key (mock implementation)
  func signVC(vc: VC) : async VC {
    let signature = await generateSignature(vc);
    {
      vc with
      proof = ?{
        proofType = "Ed25519Signature2020";
        created = vc.issuanceDate;
        proofPurpose = "assertionMethod";
        verificationMethod = vc.issuer # "#keys-1";
        signature;
      };
    }
  };

  // Helper: Generate mock signature
  func generateSignature(vc: VC) : async Text {
    // In production, use threshold ECDSA or Internet Identity
    let content = vc.id # vc.issuer # vc.credentialSubject.id # vc.issuanceDate;
    let truncated = truncateText(content, 16);
    "sig_" # truncated # "_mock"
  };

  // Helper: Truncate text to specified length
  func truncateText(text: Text, maxLength: Nat) : Text {
    let chars = Text.toIter(text);
    var result = "";
    var count = 0;
    
    for (c in chars) {
      if (count >= maxLength) {
        return result;
      };
      result #= Text.fromChar(c);
      count += 1;
    };
    result
  };

  // Helper: Verify signature (mock implementation)
  func verifySignature(vc: VC) : async Bool {
    switch (vc.proof) {
      case null false;
      case (?proof) {
        // In production, verify using public key from DID document
        let expectedSig = await generateSignature(vc);
        proof.signature == expectedSig
      };
    }
  };

  // Helper: Generate UUID
  func generateUUID() : async Text {
    let seed = await Random.blob();
    let chars = Blob.toArray(seed);
    var uuid = "vc_";
    var i = 0;
    while (i < 8 and i < chars.size()) {
      let byteValue = Nat8.toNat(chars[i]);
      uuid #= Int.toText(byteValue % 10);
      i += 1;
    };
    uuid #= "_" # Int.toText(Time.now());
    uuid
  };

  // Helper: Convert VC to JSON string
  func vcToJson(vc: VC) : Text {
    let proofJson = switch (vc.proof) {
      case null "null";
      case (?proof) {
        "{" #
          "\"type\": \"" # proof.proofType # "\"," #
          "\"created\": \"" # proof.created # "\"," #
          "\"proofPurpose\": \"" # proof.proofPurpose # "\"," #
          "\"verificationMethod\": \"" # proof.verificationMethod # "\"," #
          "\"signature\": \"" # proof.signature # "\"" #
        "}"
      };
    };

    let claimsArray = Array.map<(Text, Text), Text>(
      vc.credentialSubject.claims,
      func((key, value): (Text, Text)) : Text {
        "\"" # key # "\": \"" # value # "\""
      }
    );
    let claimsJson = Text.join(",", claimsArray.vals());

    let expirationJson = switch (vc.expirationDate) {
      case null "null";
      case (?date) "\"" # date # "\"";
    };

    "{" #
      "\"@context\": [\"https://www.w3.org/2018/credentials/v1\"]," #
      "\"id\": \"" # vc.id # "\"," #
      "\"type\": [\"VerifiableCredential\"]," #
      "\"issuer\": \"" # vc.issuer # "\"," #
      "\"issuanceDate\": \"" # vc.issuanceDate # "\"," #
      "\"expirationDate\": " # expirationJson # "," #
      "\"credentialSubject\": {" #
        "\"id\": \"" # vc.credentialSubject.id # "\"," #
        claimsJson #
      "}," #
      "\"proof\": " # proofJson #
    "}"
  };
};