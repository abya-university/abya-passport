import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import Int "mo:base/Int";
import Nat "mo:base/Nat";
import Map "mo:base/HashMap";
import Random "mo:base/Random";
import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Nat8 "mo:base/Nat8";
import Result "mo:base/Result";

persistent actor DIDRegistry {
  
  // DID Metadata for IPFS storage
  type DIDMetadata = {
    did: Text;
    ipfsCid: Text;
    owner: Principal;
    createdAt: Int;
    updatedAt: Int;
    isActive: Bool;
  };

  // VC Metadata for IPFS storage
  type VCMetadata = {
    id: Text;
    ipfsCid: Text;
    issuer: Principal;
    subject: Text; // DID of the credential subject
    credentialTypes: [Text];
    issuedAt: Int;
    expiresAt: ?Int;
    isRevoked: Bool;
    revokedAt: ?Int;
  };

  // Legacy VC Type Definition (for backward compatibility)
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

  // IPFS-based storage
  private stable var didMetadataEntries : [(Text, DIDMetadata)] = [];
  private transient var didMetadataMap = Map.HashMap<Text, DIDMetadata>(0, Text.equal, Text.hash);
  
  private stable var vcMetadataEntries : [(Text, VCMetadata)] = [];
  private transient var vcMetadataMap = Map.HashMap<Text, VCMetadata>(0, Text.equal, Text.hash);
  
  private stable var principalToDid : [(Principal, Text)] = [];
  private transient var principalDidMap = Map.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);

  // Legacy storage for backward compatibility
  private stable var vcEntries : [(Text, VC)] = [];
  private transient var vcs = Map.HashMap<Text, VC>(0, Text.equal, Text.hash);

  // Pre/post upgrade hooks
  system func preupgrade() {
    vcEntries := Iter.toArray(vcs.entries());
    didMetadataEntries := Iter.toArray(didMetadataMap.entries());
    vcMetadataEntries := Iter.toArray(vcMetadataMap.entries());
    principalToDid := Iter.toArray(principalDidMap.entries());
  };

  system func postupgrade() {
    vcs := Map.HashMap<Text, VC>(0, Text.equal, Text.hash);
    for ((id, vc) in vcEntries.vals()) {
      vcs.put(id, vc);
    };
    vcEntries := [];

    didMetadataMap := Map.HashMap<Text, DIDMetadata>(0, Text.equal, Text.hash);
    for ((did, metadata) in didMetadataEntries.vals()) {
      didMetadataMap.put(did, metadata);
    };
    didMetadataEntries := [];

    vcMetadataMap := Map.HashMap<Text, VCMetadata>(0, Text.equal, Text.hash);
    for ((id, metadata) in vcMetadataEntries.vals()) {
      vcMetadataMap.put(id, metadata);
    };
    vcMetadataEntries := [];

    principalDidMap := Map.HashMap<Principal, Text>(0, Principal.equal, Principal.hash);
    for ((principal, did) in principalToDid.vals()) {
      principalDidMap.put(principal, did);
    };
    principalToDid := [];
  };

  // ==================== DID FUNCTIONS ====================

  // Public function to get DID for the CALLER's principal
  public shared(msg) func getMyDid() : async Text {
    let did = "did:icp:" # Principal.toText(msg.caller);
    return did;
  };

  // Optional: Get DID for any principal (authenticated)
  public shared(_msg) func getDidForPrincipal(principal : Principal) : async Text {
    let did = "did:icp:" # Principal.toText(principal);
    return did;
  };

  // Returns a minimal W3C-compliant DID document
  public shared func resolveDid(did : Text) : async Text {
    assert(isValidDid(did));

    let principal = extractPrincipal(did);
    let publicKey = await getPublicKey(principal);

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

  // ==================== IPFS DID FUNCTIONS ====================

  // Store DID document metadata with IPFS CID
  public shared(msg) func storeDIDDocument(ipfsCid: Text) : async Result.Result<Text, Text> {
    assert(not Principal.isAnonymous(msg.caller));
    
    // Validate IPFS CID format (basic validation)
    if (not isValidIPFSCid(ipfsCid)) {
      return #err("Invalid IPFS CID format");
    };

    let did = "did:icp:" # Principal.toText(msg.caller);
    
    // Check if DID already exists
    switch (didMetadataMap.get(did)) {
      case (?existingDid) {
        return #err("DID already exists");
      };
      case null {
        let metadata: DIDMetadata = {
          did = did;
          ipfsCid = ipfsCid;
          owner = msg.caller;
          createdAt = Time.now();
          updatedAt = Time.now();
          isActive = true;
        };
        
        didMetadataMap.put(did, metadata);
        principalDidMap.put(msg.caller, did);
        return #ok(did);
      };
    };
  };

  // Get DID metadata including IPFS CID
  public shared func getDIDMetadata(did: Text) : async ?{did: Text; ipfsCid: Text; createdAt: Int; updatedAt: Int} {
    switch (didMetadataMap.get(did)) {
      case (?metadata) {
        ?{
          did = metadata.did;
          ipfsCid = metadata.ipfsCid;
          createdAt = metadata.createdAt;
          updatedAt = metadata.updatedAt;
        }
      };
      case null null;
    };
  };

  // Check if caller has a DID registered
  public shared(msg) func hasMyDID() : async Bool {
    let did = "did:icp:" # Principal.toText(msg.caller);
    switch (didMetadataMap.get(did)) {
      case (?metadata) metadata.isActive;
      case null false;
    };
  };

  // ==================== IPFS VC FUNCTIONS ====================

  // Issue a VC with IPFS storage
  public shared(msg) func issueVCWithIPFS(
    vcId: Text,
    ipfsCid: Text,
    recipientDid: Text,
    credentialTypes: [Text],
    expiresInHours: ?Nat
  ) : async Result.Result<Text, Text> {
    assert(not Principal.isAnonymous(msg.caller));
    assert(isValidDid(recipientDid));
    
    // Validate IPFS CID format
    if (not isValidIPFSCid(ipfsCid)) {
      return #err("Invalid IPFS CID format");
    };

    // Check if VC ID already exists
    switch (vcMetadataMap.get(vcId)) {
      case (?existingVC) {
        return #err("VC ID already exists");
      };
      case null {
        let now = Time.now();
        let expiresAt = switch (expiresInHours) {
          case (?hours) {
            let hoursInNanos: Int = hours * 3_600_000_000_000;
            ?(now + hoursInNanos)
          };
          case null null;
        };

        let metadata: VCMetadata = {
          id = vcId;
          ipfsCid = ipfsCid;
          issuer = msg.caller;
          subject = recipientDid;
          credentialTypes = credentialTypes;
          issuedAt = now;
          expiresAt = expiresAt;
          isRevoked = false;
          revokedAt = null;
        };
        
        vcMetadataMap.put(vcId, metadata);
        return #ok(vcId);
      };
    };
  };

  // Get VC metadata including IPFS CID
  public shared func getVCMetadata(vcId: Text) : async ?{id: Text; ipfsCid: Text; issuer: Text; subject: Text; issuedAt: Int; isRevoked: Bool} {
    switch (vcMetadataMap.get(vcId)) {
      case (?metadata) {
        ?{
          id = metadata.id;
          ipfsCid = metadata.ipfsCid;
          issuer = Principal.toText(metadata.issuer);
          subject = metadata.subject;
          issuedAt = metadata.issuedAt;
          isRevoked = metadata.isRevoked;
        }
      };
      case null null;
    };
  };

  // Get all VCs issued by the caller (returns metadata with IPFS CIDs)
  public shared(msg) func getMyIssuedVCsMetadata() : async [{id: Text; ipfsCid: Text; subject: Text; issuedAt: Int; isRevoked: Bool}] {
    let issuerPrincipal = msg.caller;
    var results: [{id: Text; ipfsCid: Text; subject: Text; issuedAt: Int; isRevoked: Bool}] = [];
    
    for ((id, metadata) in vcMetadataMap.entries()) {
      if (Principal.equal(metadata.issuer, issuerPrincipal)) {
        let vcInfo = {
          id = metadata.id;
          ipfsCid = metadata.ipfsCid;
          subject = metadata.subject;
          issuedAt = metadata.issuedAt;
          isRevoked = metadata.isRevoked;
        };
        results := Array.append(results, [vcInfo]);
      };
    };
    
    results
  };

  // Get all VCs for a specific DID (returns metadata with IPFS CIDs)
  public shared func getVCsForDidMetadata(did: Text) : async [{id: Text; ipfsCid: Text; issuer: Text; issuedAt: Int; isRevoked: Bool}] {
    var results: [{id: Text; ipfsCid: Text; issuer: Text; issuedAt: Int; isRevoked: Bool}] = [];
    
    for ((id, metadata) in vcMetadataMap.entries()) {
      if (Text.equal(metadata.subject, did)) {
        let vcInfo = {
          id = metadata.id;
          ipfsCid = metadata.ipfsCid;
          issuer = Principal.toText(metadata.issuer);
          issuedAt = metadata.issuedAt;
          isRevoked = metadata.isRevoked;
        };
        results := Array.append(results, [vcInfo]);
      };
    };
    
    results
  };

  // Revoke a VC (only by issuer)
  public shared(msg) func revokeVCWithIPFS(vcId: Text) : async Result.Result<Bool, Text> {
    switch (vcMetadataMap.get(vcId)) {
      case (?metadata) {
        if (not Principal.equal(metadata.issuer, msg.caller)) {
          return #err("Only the issuer can revoke this VC");
        };
        
        if (metadata.isRevoked) {
          return #err("VC is already revoked");
        };
        
        let updatedMetadata: VCMetadata = {
          id = metadata.id;
          ipfsCid = metadata.ipfsCid;
          issuer = metadata.issuer;
          subject = metadata.subject;
          credentialTypes = metadata.credentialTypes;
          issuedAt = metadata.issuedAt;
          expiresAt = metadata.expiresAt;
          isRevoked = true;
          revokedAt = ?Time.now();
        };
        
        vcMetadataMap.put(vcId, updatedMetadata);
        return #ok(true);
      };
      case null {
        return #err("VC not found");
      };
    };
  };

  // Verify VC status (checks if not revoked and not expired)
  public shared func verifyVCStatus(vcId: Text) : async Result.Result<Bool, Text> {
    switch (vcMetadataMap.get(vcId)) {
      case (?metadata) {
        if (metadata.isRevoked) {
          return #err("VC has been revoked");
        };
        
        switch (metadata.expiresAt) {
          case (?expiry) {
            if (Time.now() > expiry) {
              return #err("VC has expired");
            };
          };
          case null {};
        };
        
        return #ok(true);
      };
      case null {
        return #err("VC not found");
      };
    };
  };

  // Helper function to validate IPFS CID format
  private func isValidIPFSCid(cid: Text) : Bool {
    // Basic validation - IPFS CIDs typically start with "Qm" (v0) or "ba" (v1)
    let cidLength = Text.size(cid);
    if (cidLength < 10) return false;
    
    // Get first 2 characters manually
    let chars = Text.toIter(cid);
    switch (chars.next()) {
      case null return false;
      case (?first) {
        switch (chars.next()) {
          case null return false;
          case (?second) {
            let prefix = Text.fromChar(first) # Text.fromChar(second);
            prefix == "Qm" or prefix == "ba" or prefix == "Qb" or prefix == "zb"
          };
        };
      };
    };
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
      case (?hours) {
        let hoursInNanos: Int = hours * 3_600_000_000_000;
        ?Int.toText(Time.now() + hoursInNanos)
      };
      case null null;
    };

    let vcId = await generateUUID();
    let vc : VC = {
      id = vcId;
      issuer = issuerDid;
      credentialSubject = { id = recipientDid; claims };
      issuanceDate = now;
      expirationDate = expiration;
      proof = null;
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

        // Check signature
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
          false
        } else {
          vcs.delete(vcId);
          true
        }
      };
    }
  };

  // ==================== HELPER FUNCTIONS ====================

  // Helper: Extract Principal from DID string
  func extractPrincipal(did : Text) : Principal {
    let parts = Text.split(did, #char ':');
    let principalPart = Iter.toArray(parts)[2];
    Principal.fromText(principalPart)
  };

  // Helper: Validate DID format
  func isValidDid(did : Text) : Bool {
    Text.startsWith(did, #text "did:icp:")
  };

  // Helper: Get public key (mock)
  func getPublicKey(_principal : Principal) : async Text {
    "z6Mk...abc123"
  };

  // Helper: Parse text to integer
  func textToInt(text: Text) : ?Int {
    var result: Int = 0;
    var negative = false;
    let chars = Text.toIter(text);
    
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

  // Helper: Sign VC
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

  // Helper: Generate signature
  func generateSignature(vc: VC) : async Text {
    let content = vc.id # vc.issuer # vc.credentialSubject.id # vc.issuanceDate;
    let truncated = truncateText(content, 16);
    "sig_" # truncated # "_mock"
  };

  // Helper: Truncate text
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

  // Helper: Verify signature
  func verifySignature(vc: VC) : async Bool {
    switch (vc.proof) {
      case null false;
      case (?proof) {
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

  // Helper: Convert VC to JSON
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
