export const realEstateEscrowAbi = [
	// Kreiranje i upravljanje prodajom
	"function createSale(uint256 propertyId, uint256 price)",
	"function cancelSale(uint256 saleId)",
	"function fundSale(uint256 saleId)",

	// Čitanje prodaja
	"function getSaleCount() view returns (uint256)",

	"function getSale(uint256 saleId) view returns (tuple(uint256 id, uint256 propertyId, address seller, address buyer, uint256 price, uint8 status, bool exists))",

	// Adrese povezanih ugovora
	"function propertyRegistry() view returns (address)",
	"function paymentToken() view returns (address)",
] as const;
