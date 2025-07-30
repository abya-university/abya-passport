import Principal "mo:base/Principal";

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
};