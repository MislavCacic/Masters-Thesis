export const realEstateEscrowAbi = [
	// ==================================================
	// KREIRANJE I UPRAVLJANJE PRODAJOM
	// ==================================================
	"function createSale(uint256 propertyId, uint256 price) returns (uint256 saleId)",
	"function cancelSale(uint256 saleId)",
	"function fundSale(uint256 saleId)",

	// ==================================================
	// PROVJERA UVJETA KUPOPRODAJE
	// ==================================================
	"function getPurchaseConditions(uint256 saleId, address buyer) view returns (tuple(bool saleExists, bool saleActive, bool documentsValid, bool sellerIsOwner, bool buyerIsNotSeller, bool buyerHasSufficientBalance, bool buyerHasSufficientAllowance, bool readyForPurchase))",

	// ==================================================
	// ČITANJE PRODAJA
	// ==================================================
	"function getSaleCount() view returns (uint256)",

	"function getSale(uint256 saleId) view returns (tuple(uint256 id, uint256 propertyId, address seller, address buyer, uint256 price, uint8 status, bool exists))",

	// ==================================================
	// ADRESE POVEZANIH UGOVORA
	// ==================================================
	"function propertyRegistry() view returns (address)",
	"function paymentToken() view returns (address)",

	// ==================================================
	// BLOCKCHAIN DOGAĐAJI
	// ==================================================
	"event SaleCreated(uint256 indexed saleId, uint256 indexed propertyId, address indexed seller, uint256 price)",

	"event SaleFunded(uint256 indexed saleId, address indexed buyer, uint256 amount)",

	"event SaleCompleted(uint256 indexed saleId, uint256 indexed propertyId, address indexed buyer, address seller, uint256 amount)",

	"event SaleCancelled(uint256 indexed saleId, uint256 indexed propertyId, address indexed seller)",
] as const;
