export const propertyRegistryAbi = [
	// Uloge
	"function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
	"function VERIFIER_ROLE() view returns (bytes32)",
	"function TRANSFER_ROLE() view returns (bytes32)",
	"function hasRole(bytes32 role, address account) view returns (bool)",

	// Registracija nekretnine
	"function registerProperty(string cadastralMunicipality, string parcelNumber, string propertyAddress, bytes32 documentHash) returns (uint256 propertyId)",

	// Verifikacija nekretnine
	"function verifyProperty(uint256 propertyId)",
	"function rejectProperty(uint256 propertyId)",

	// Čitanje podataka
	"function getPropertyCount() view returns (uint256)",
	"function getDigitalOwner(uint256 propertyId) view returns (address)",
	"function isPropertyVerified(uint256 propertyId) view returns (bool)",
	"function getProperty(uint256 propertyId) view returns (tuple(uint256 id, string cadastralMunicipality, string parcelNumber, string propertyAddress, bytes32 documentHash, address digitalOwner, uint8 verificationStatus, bool exists))",

	// Blockchain događaji
	"event PropertyRegistered(uint256 indexed propertyId, address indexed digitalOwner, string cadastralMunicipality, string parcelNumber)",
] as const;
