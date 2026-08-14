import { Contract, JsonRpcProvider, formatUnits } from "ethers";

const provider = new JsonRpcProvider("http://127.0.0.1:8545");

const ADDRESSES = {
	propertyRegistry: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",

	mockEUR: "0x5FbDB2315678afecb367f032d93F642f64180aa3",

	realEstateEscrow: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
};

const ACCOUNTS = {
	seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",

	buyer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
};

const propertyRegistryAbi = [
	"function getPropertyCount() view returns (uint256)",

	"function getDigitalOwner(uint256 propertyId) view returns (address)",

	"function getProperty(uint256 propertyId) view returns (tuple(uint256 id, string cadastralMunicipality, string parcelNumber, string propertyAddress, address digitalOwner, uint8 verificationStatus, bool exists))",
];

const realEstateEscrowAbi = [
	"function getSaleCount() view returns (uint256)",

	"function getSale(uint256 saleId) view returns (tuple(uint256 id, uint256 propertyId, address seller, address buyer, uint256 price, uint8 status, bool exists))",
];

const mockEURAbi = [
	"function balanceOf(address account) view returns (uint256)",
];

const propertyRegistry = new Contract(
	ADDRESSES.propertyRegistry,
	propertyRegistryAbi,
	provider,
);

const realEstateEscrow = new Contract(
	ADDRESSES.realEstateEscrow,
	realEstateEscrowAbi,
	provider,
);

const mockEUR = new Contract(ADDRESSES.mockEUR, mockEURAbi, provider);

const network = await provider.getNetwork();

console.log("\n======================================");
console.log("BLOCKCHAIN STATE CHECK");
console.log("======================================");

console.log("Chain ID:", network.chainId.toString());

const propertyCount = await propertyRegistry.getPropertyCount();

const saleCount = await realEstateEscrow.getSaleCount();

console.log("\nBroj nekretnina:", propertyCount.toString());

console.log("Broj prodaja:", saleCount.toString());

console.log("\n--- NEKRETNINE ---");

for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
	const property = await propertyRegistry.getProperty(propertyId);

	console.log(`\nNekretnina ${propertyId.toString()}`);

	console.log("Adresa:", property.propertyAddress);

	console.log("Vlasnik:", property.digitalOwner);

	console.log("Status:", property.verificationStatus.toString());

	console.log("Postoji:", property.exists);
}

console.log("\n--- PRODAJE ---");

for (let saleId = 1n; saleId <= saleCount; saleId++) {
	const sale = await realEstateEscrow.getSale(saleId);

	console.log(`\nProdaja ${saleId.toString()}`);

	console.log("Nekretnina:", sale.propertyId.toString());

	console.log("Prodavatelj:", sale.seller);

	console.log("Kupac:", sale.buyer);

	console.log("Cijena:", formatUnits(sale.price, 2), "mEUR");

	console.log("Status:", sale.status.toString());

	console.log("Postoji:", sale.exists);
}

console.log("\n--- MOCKEUR ---");

const buyerBalance = await mockEUR.balanceOf(ACCOUNTS.buyer);

const sellerBalance = await mockEUR.balanceOf(ACCOUNTS.seller);

console.log("Kupac:", formatUnits(buyerBalance, 2), "mEUR");

console.log("Prodavatelj:", formatUnits(sellerBalance, 2), "mEUR");

console.log("\n======================================");
