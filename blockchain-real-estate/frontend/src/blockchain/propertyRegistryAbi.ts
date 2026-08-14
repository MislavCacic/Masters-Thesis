export const propertyRegistryAbi = [
	// ==================================================
	// ULOGE
	// ==================================================
	"function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
	"function VERIFIER_ROLE() view returns (bytes32)",
	"function TRANSFER_ROLE() view returns (bytes32)",
	"function hasRole(bytes32 role, address account) view returns (bool)",

	// ==================================================
	// OBVEZNI DOKUMENTI
	// ==================================================
	"function REQUIRED_DOCUMENT_COUNT() view returns (uint8)",

	// ==================================================
	// REGISTRACIJA NEKRETNINE
	// ==================================================
	"function registerProperty(string cadastralMunicipality, string parcelNumber, string propertyAddress) returns (uint256 propertyId)",

	// ==================================================
	// PREDAJA DOKUMENTACIJE
	// ==================================================
	"function submitPropertyDocument(uint256 propertyId, uint8 documentType, bytes32 documentHash)",

	// ==================================================
	// VERIFIKACIJA DOKUMENTACIJE
	// ==================================================
	"function verifyPropertyDocument(uint256 propertyId, uint8 documentType)",
	"function rejectPropertyDocument(uint256 propertyId, uint8 documentType)",

	// ==================================================
	// PROVJERA DOKUMENTACIJE
	// ==================================================
	"function hasAllRequiredDocuments(uint256 propertyId) view returns (bool)",
	"function hasValidDocuments(uint256 propertyId) view returns (bool)",
	"function isPropertyVerified(uint256 propertyId) view returns (bool)",

	// ==================================================
	// ČITANJE DOKUMENTA
	// ==================================================
	"function getPropertyDocument(uint256 propertyId, uint8 documentType) view returns (tuple(bytes32 documentHash, uint8 verificationStatus, bool submitted))",

	// ==================================================
	// ČITANJE NEKRETNINE
	// ==================================================
	"function getPropertyCount() view returns (uint256)",
	"function getDigitalOwner(uint256 propertyId) view returns (address)",
	"function getProperty(uint256 propertyId) view returns (tuple(uint256 id, string cadastralMunicipality, string parcelNumber, string propertyAddress, address digitalOwner, uint8 verificationStatus, bool exists))",

	// ==================================================
	// BLOCKCHAIN DOGAĐAJI
	// ==================================================
	"event PropertyRegistered(uint256 indexed propertyId, address indexed digitalOwner, string cadastralMunicipality, string parcelNumber)",
] as const;
