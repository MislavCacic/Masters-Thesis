import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, toBytes } from "viem";

const { viem } = await hre.network.create();

/*
 * DocumentType enum iz PropertyRegistry.sol:
 *
 * 0 = LandRegistryExtract
 * 1 = CadastralDocument
 * 2 = OwnershipDocument
 */
const DOCUMENT_TYPE = {
	LAND_REGISTRY_EXTRACT: 0,
	CADASTRAL_DOCUMENT: 1,
	OWNERSHIP_DOCUMENT: 2,
} as const;

const REQUIRED_DOCUMENT_TYPES = [
	DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
	DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
	DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
] as const;

function createDocumentHash(content: string) {
	return keccak256(toBytes(content));
}

function createDocumentURI(content: string) {
	const documentHash = createDocumentHash(content);

	return `ipfs://test/${documentHash.slice(2)}`;
}

async function createEscrowTestContext() {
	const [administrator, seller, buyer, verifier, unauthorizedUser] =
		await viem.getWalletClients();

	const publicClient = await viem.getPublicClient();

	const propertyRegistry = await viem.deployContract("PropertyRegistry");

	const mockEUR = await viem.deployContract("MockEUR");

	const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
		propertyRegistry.address,
		mockEUR.address,
	]);

	/* ==================================================
	   ULOGE
	   ================================================== */

	const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

	const grantVerifierRoleTransactionHash =
		await propertyRegistry.write.grantRole(
			[verifierRole, verifier.account.address],
			{
				account: administrator.account,
			},
		);

	await publicClient.waitForTransactionReceipt({
		hash: grantVerifierRoleTransactionHash,
	});

	async function grantTransferRoleToEscrow(): Promise<void> {
		const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

		const transactionHash = await propertyRegistry.write.grantRole(
			[transferRole, realEstateEscrow.address],
			{
				account: administrator.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transactionHash,
		});
	}

	/* ==================================================
	   REGISTRACIJA NEKRETNINE
	   ================================================== */

	async function registerProperty(
		cadastralMunicipality = "Osijek",
		parcelNumber = "6000/6",
		propertyAddress = "Trg slobode 1, Osijek",
	): Promise<void> {
		const transactionHash = await propertyRegistry.write.registerProperty(
			[cadastralMunicipality, parcelNumber, propertyAddress],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transactionHash,
		});
	}

	/* ==================================================
	   DOKUMENTACIJA
	   ================================================== */

	async function submitDocument(
		propertyId: bigint,
		documentType: 0 | 1 | 2,
		content: string,
	): Promise<void> {
		const documentHash = createDocumentHash(content);
		const documentURI = createDocumentURI(content);

		const transactionHash = await propertyRegistry.write.submitPropertyDocument(
			[propertyId, documentType, documentHash, documentURI],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transactionHash,
		});
	}

	async function submitAllRequiredDocuments(propertyId: bigint): Promise<void> {
		await submitDocument(
			propertyId,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
			`zemljisnoknjizni izvadak ${propertyId}`,
		);

		await submitDocument(
			propertyId,
			DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
			`katastarski dokument ${propertyId}`,
		);

		await submitDocument(
			propertyId,
			DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
			`dokaz vlasnistva ${propertyId}`,
		);
	}

	async function verifyDocument(
		propertyId: bigint,
		documentType: 0 | 1 | 2,
	): Promise<void> {
		const transactionHash = await propertyRegistry.write.verifyPropertyDocument(
			[propertyId, documentType],
			{
				account: verifier.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transactionHash,
		});
	}

	async function verifyAllRequiredDocuments(propertyId: bigint): Promise<void> {
		for (const documentType of REQUIRED_DOCUMENT_TYPES) {
			await verifyDocument(propertyId, documentType);
		}
	}

	/* ==================================================
	   KOMPLETNO PRIPREMLJENA NEKRETNINA
	   ================================================== */

	async function prepareVerifiedProperty(
		propertyId: bigint = 1n,
		cadastralMunicipality = "Osijek",
		parcelNumber = "6000/6",
		propertyAddress = "Trg slobode 1, Osijek",
	): Promise<void> {
		await registerProperty(
			cadastralMunicipality,
			parcelNumber,
			propertyAddress,
		);

		await submitAllRequiredDocuments(propertyId);

		await verifyAllRequiredDocuments(propertyId);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			propertyId,
		]);

		assert.equal(
			hasValidDocuments,
			true,
			"Testna nekretnina mora imati valjanu dokumentaciju",
		);
	}

	return {
		administrator,
		seller,
		buyer,
		verifier,
		unauthorizedUser,
		publicClient,
		propertyRegistry,
		mockEUR,
		realEstateEscrow,
		grantTransferRoleToEscrow,
		registerProperty,
		submitDocument,
		submitAllRequiredDocuments,
		verifyDocument,
		verifyAllRequiredDocuments,
		prepareVerifiedProperty,
	};
}

describe("RealEstateEscrow", function () {
	it("postavlja escrow i povezuje ga s registrom i tokenom", async function () {
		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const storedRegistryAddress =
			await realEstateEscrow.read.propertyRegistry();

		const storedPaymentTokenAddress =
			await realEstateEscrow.read.paymentToken();

		console.log("\n--- REAL ESTATE ESCROW ---");
		console.log("PropertyRegistry:", propertyRegistry.address);
		console.log("MockEUR:", mockEUR.address);
		console.log("RealEstateEscrow:", realEstateEscrow.address);
		console.log("--------------------------\n");

		assert.equal(
			storedRegistryAddress.toLowerCase(),
			propertyRegistry.address.toLowerCase(),
			"Escrow mora sadržavati ispravnu adresu registra",
		);

		assert.equal(
			storedPaymentTokenAddress.toLowerCase(),
			mockEUR.address.toLowerCase(),
			"Escrow mora sadržavati ispravnu adresu tokena",
		);
	});

	it("vlasnik nekretnine s potpuno potvrđenom dokumentacijom kreira prodaju", async function () {
		const {
			seller,
			publicClient,
			propertyRegistry,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;

		await prepareVerifiedProperty();

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		assert.equal(
			hasValidDocuments,
			true,
			"Dokumentacija mora biti valjana prije kreiranja prodaje",
		);

		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		const sale = await realEstateEscrow.read.getSale([1n]);

		console.log("\n--- KREIRANA PRODAJA ---");
		console.log("ID prodaje:", sale.id.toString());
		console.log("ID nekretnine:", sale.propertyId.toString());
		console.log("Prodavatelj:", sale.seller);
		console.log("Kupac:", sale.buyer);
		console.log("Cijena:", sale.price.toString());
		console.log("Status:", sale.status);
		console.log("-------------------------\n");

		assert.equal(sale.id, 1n);
		assert.equal(sale.propertyId, 1n);

		assert.equal(
			sale.seller.toLowerCase(),
			seller.account.address.toLowerCase(),
		);

		assert.equal(sale.buyer, "0x0000000000000000000000000000000000000000");

		assert.equal(sale.price, propertyPrice);

		assert.equal(sale.status, 0, "Nova prodaja mora imati status Created");

		assert.equal(sale.exists, true);
	});

	it("ne dopušta kreiranje prodaje ako nisu potvrđena sva tri dokumenta", async function () {
		const {
			seller,
			propertyRegistry,
			realEstateEscrow,
			registerProperty,
			submitAllRequiredDocuments,
			verifyDocument,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;

		await registerProperty();

		await submitAllRequiredDocuments(1n);

		/*
		 * Namjerno potvrđujemo samo 2/3 dokumenta.
		 */
		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		await verifyDocument(1n, DOCUMENT_TYPE.CADASTRAL_DOCUMENT);

		const hasAllDocuments = await propertyRegistry.read.hasAllRequiredDocuments(
			[1n],
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		console.log("\n--- NEPOTPUNA VERIFIKACIJA ---");
		console.log("Svi dokumenti predani:", hasAllDocuments);
		console.log("Potvrđeno:", "2/3");
		console.log("Dokumentacija valjana:", hasValidDocuments);
		console.log("------------------------------\n");

		assert.equal(
			hasAllDocuments,
			true,
			"Sva tri dokumenta moraju biti predana",
		);

		assert.equal(
			hasValidDocuments,
			false,
			"2/3 potvrđena dokumenta nisu dovoljna",
		);

		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, propertyPrice], {
				account: seller.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		assert.equal(
			saleCount,
			0n,
			"Nekretnina bez kompletne valjane dokumentacije ne smije biti ponuđena na prodaju",
		);
	});

	it("ne dopušta korisniku koji nije vlasnik nekretnine kreiranje prodaje", async function () {
		const {
			seller,
			unauthorizedUser,
			propertyRegistry,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;

		await prepareVerifiedProperty();

		const ownerBefore = await propertyRegistry.read.getDigitalOwner([1n]);

		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, propertyPrice], {
				account: unauthorizedUser.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		const ownerAfter = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(
			saleCount,
			0n,
			"Neovlašteni korisnik ne smije kreirati prodaju",
		);

		assert.equal(
			ownerBefore.toLowerCase(),
			seller.account.address.toLowerCase(),
		);

		assert.equal(
			ownerAfter.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Vlasništvo se ne smije promijeniti",
		);
	});

	it("ne dopušta dvije aktivne prodaje za istu nekretninu", async function () {
		const { seller, publicClient, realEstateEscrow, prepareVerifiedProperty } =
			await createEscrowTestContext();

		await prepareVerifiedProperty();

		const firstPrice = 15_000_000n;
		const secondPrice = 16_000_000n;

		const firstSaleHash = await realEstateEscrow.write.createSale(
			[1n, firstPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstSaleHash,
		});

		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, secondPrice], {
				account: seller.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		const sale = await realEstateEscrow.read.getSale([1n]);

		assert.equal(saleCount, 1n, "Mora postojati samo jedna aktivna prodaja");

		assert.equal(sale.price, firstPrice);

		assert.equal(sale.status, 0, "Prva prodaja mora ostati Created");
	});

	it("ne dopušta kreiranje prodaje s cijenom nula", async function () {
		const { seller, realEstateEscrow, prepareVerifiedProperty } =
			await createEscrowTestContext();

		await prepareVerifiedProperty(
			1n,
			"Osijek",
			"17000/17",
			"Županijska ulica 17, Osijek",
		);

		let caughtError: unknown;

		try {
			await realEstateEscrow.write.createSale([1n, 0n], {
				account: seller.account,
			});
		} catch (error) {
			caughtError = error;
		}

		assert.ok(caughtError, "Pametni ugovor mora odbiti prodaju s cijenom nula");

		const errorMessage =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		assert.match(
			errorMessage,
			/Cijena mora biti veca od nule/,
			"Greška mora sadržavati razlog odbijanja",
		);

		const saleCount = await realEstateEscrow.read.getSaleCount();

		console.log("\n--- CIJENA NULA ---");
		console.log("Greška:", errorMessage);
		console.log("-------------------\n");

		assert.equal(saleCount, 0n);
	});

	it("prodavatelj otkazuje prodaju prije uplate i zatim može kreirati novu", async function () {
		const { seller, publicClient, realEstateEscrow, prepareVerifiedProperty } =
			await createEscrowTestContext();

		await prepareVerifiedProperty(
			1n,
			"Osijek",
			"9000/9",
			"Radićeva ulica 30, Osijek",
		);

		const firstPrice = 15_000_000n;
		const secondPrice = 16_000_000n;

		const firstSaleHash = await realEstateEscrow.write.createSale(
			[1n, firstPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstSaleHash,
		});

		const cancelHash = await realEstateEscrow.write.cancelSale([1n], {
			account: seller.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: cancelHash,
		});

		const cancelledSale = await realEstateEscrow.read.getSale([1n]);

		assert.equal(cancelledSale.status, 3, "Prodaja mora biti Cancelled");

		const secondSaleHash = await realEstateEscrow.write.createSale(
			[1n, secondPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: secondSaleHash,
		});

		const secondSale = await realEstateEscrow.read.getSale([2n]);

		assert.equal(secondSale.id, 2n);
		assert.equal(secondSale.propertyId, 1n);
		assert.equal(secondSale.price, secondPrice);
		assert.equal(secondSale.status, 0);
	});

	it("ne dopušta drugom korisniku otkazivanje prodaje", async function () {
		const {
			seller,
			unauthorizedUser,
			publicClient,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		await prepareVerifiedProperty();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, 15_000_000n],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		await assert.rejects(async () => {
			await realEstateEscrow.write.cancelSale([1n], {
				account: unauthorizedUser.account,
			});
		});

		const sale = await realEstateEscrow.read.getSale([1n]);

		assert.equal(sale.status, 0, "Prodaja mora ostati Created");

		assert.equal(
			sale.seller.toLowerCase(),
			seller.account.address.toLowerCase(),
		);
	});

	it("ne dopušta prodavatelju kupnju vlastite nekretnine", async function () {
		const {
			seller,
			publicClient,
			mockEUR,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const sellerInitialBalance = 20_000_000n;
		const propertyPrice = 15_000_000n;

		await prepareVerifiedProperty();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			seller.account.address,
			sellerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		await assert.rejects(async () => {
			await realEstateEscrow.write.fundSale([1n], {
				account: seller.account,
			});
		});

		const sale = await realEstateEscrow.read.getSale([1n]);

		const sellerBalance = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		assert.equal(sale.status, 0, "Prodaja mora ostati Created");

		assert.equal(
			sellerBalance,
			sellerInitialBalance,
			"Prodavatelju se sredstva ne smiju oduzeti",
		);
	});

	it("odbija kupnju ako kupac nema dovoljno sredstava", async function () {
		const {
			seller,
			buyer,
			publicClient,
			propertyRegistry,
			mockEUR,
			realEstateEscrow,
			grantTransferRoleToEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerBalance = 10_000_000n;

		await prepareVerifiedProperty();

		await grantTransferRoleToEscrow();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		/*
		 * Kupac ima samo 100.000 mEUR,
		 * a nekretnina košta 150.000 mEUR.
		 */
		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		/*
		 * Namjerno odobravamo dovoljan allowance kako bismo
		 * dokazali da transakcija pada konkretno zbog salda.
		 */
		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		let caughtError: unknown;

		try {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		} catch (error) {
			caughtError = error;
		}

		assert.ok(
			caughtError,
			"Pametni ugovor mora odbiti kupnju ako kupac nema dovoljno sredstava",
		);

		const errorMessage =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		assert.match(
			errorMessage,
			/Kupac nema dovoljno sredstava/,
			"Mora se vratiti eksplicitna greška za nedovoljan saldo kupca",
		);

		const sale = await realEstateEscrow.read.getSale([1n]);

		const buyerBalanceAfter = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const sellerBalanceAfter = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfter = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		const ownerAfter = await propertyRegistry.read.getDigitalOwner([1n]);

		console.log("\n--- NEDOVOLJNA SREDSTVA ---");
		console.log("Cijena:", propertyPrice.toString());
		console.log("Saldo kupca:", buyerBalance.toString());
		console.log("Greška:", errorMessage);
		console.log("----------------------------\n");

		assert.equal(sale.status, 0);

		assert.equal(
			buyerBalanceAfter,
			buyerBalance,
			"Kupcu se sredstva ne smiju oduzeti",
		);

		assert.equal(sellerBalanceAfter, 0n);

		assert.equal(escrowBalanceAfter, 0n);

		assert.equal(
			ownerAfter.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati vlasnik",
		);
	});

	it("odbija kupnju ako kupac nije odobrio escrowu korištenje sredstava", async function () {
		const {
			seller,
			buyer,
			publicClient,
			mockEUR,
			realEstateEscrow,
			grantTransferRoleToEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerBalance = 20_000_000n;

		await prepareVerifiedProperty();

		await grantTransferRoleToEscrow();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		/*
		 * Nema approve poziva.
		 * Allowance mora ostati 0.
		 */
		const allowanceBefore = await mockEUR.read.allowance([
			buyer.account.address,
			realEstateEscrow.address,
		]);

		assert.equal(allowanceBefore, 0n);

		let caughtError: unknown;

		try {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		} catch (error) {
			caughtError = error;
		}

		assert.ok(caughtError, "Pametni ugovor mora odbiti kupnju bez allowancea");

		const errorMessage =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		assert.match(
			errorMessage,
			/Kupac nije odobrio dovoljan iznos sredstava/,
			"Mora se vratiti eksplicitna greška za allowance",
		);

		const sale = await realEstateEscrow.read.getSale([1n]);

		const buyerBalanceAfter = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const escrowBalanceAfter = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		console.log("\n--- NEMA ALLOWANCEA ---");
		console.log("Saldo kupca:", buyerBalance.toString());
		console.log("Allowance:", allowanceBefore.toString());
		console.log("Greška:", errorMessage);
		console.log("----------------------\n");

		assert.equal(sale.status, 0);

		assert.equal(buyerBalanceAfter, buyerBalance);

		assert.equal(escrowBalanceAfter, 0n);
	});

	it("odbija kupnju ako je allowance manji od prodajne cijene", async function () {
		const {
			seller,
			buyer,
			publicClient,
			mockEUR,
			realEstateEscrow,
			grantTransferRoleToEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerInitialBalance = 20_000_000n;
		const approvedAmount = 10_000_000n;

		await prepareVerifiedProperty();

		await grantTransferRoleToEscrow();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, approvedAmount],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		let caughtError: unknown;

		try {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		} catch (error) {
			caughtError = error;
		}

		assert.ok(caughtError);

		const errorMessage =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		assert.match(errorMessage, /Kupac nije odobrio dovoljan iznos sredstava/);

		const buyerBalanceAfter = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const allowanceAfter = await mockEUR.read.allowance([
			buyer.account.address,
			realEstateEscrow.address,
		]);

		assert.equal(
			buyerBalanceAfter,
			buyerInitialBalance,
			"Kupcu se tokeni ne smiju oduzeti",
		);

		assert.equal(
			allowanceAfter,
			approvedAmount,
			"Premali allowance ne smije biti potrošen",
		);
	});

	it("automatski završava kupoprodaju kada su svi uvjeti ispunjeni", async function () {
		const {
			seller,
			buyer,
			publicClient,
			propertyRegistry,
			mockEUR,
			realEstateEscrow,
			grantTransferRoleToEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const buyerInitialBalance = 20_000_000n;
		const propertyPrice = 15_000_000n;

		/* ==================================================
		   1. VALJANA DOKUMENTACIJA
		   ================================================== */

		await prepareVerifiedProperty(
			1n,
			"Osijek",
			"8000/8",
			"Divaltova ulica 80, Osijek",
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		assert.equal(
			hasValidDocuments,
			true,
			"Sva dokumentacija mora biti potvrđena",
		);

		/* ==================================================
		   2. ESCROW DOBIVA TRANSFER_ROLE
		   ================================================== */

		await grantTransferRoleToEscrow();

		/* ==================================================
		   3. PRODAVATELJ KREIRA PRODAJU
		   ================================================== */

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		/* ==================================================
		   4. KUPAC DOBIVA SREDSTVA
		   ================================================== */

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const buyerBalanceBefore = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		assert.equal(
			buyerBalanceBefore >= propertyPrice,
			true,
			"Kupac mora imati dovoljno sredstava",
		);

		/* ==================================================
		   5. KUPAC ODOBRAVA ESCROW
		   ================================================== */

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		const allowanceBefore = await mockEUR.read.allowance([
			buyer.account.address,
			realEstateEscrow.address,
		]);

		assert.equal(
			allowanceBefore >= propertyPrice,
			true,
			"Allowance mora biti dovoljan",
		);

		/* ==================================================
		   6. STANJE PRIJE KUPOPRODAJE
		   ================================================== */

		const ownerBefore = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(
			ownerBefore.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora biti vlasnik prije kupnje",
		);

		console.log("\n--- UVJETI PRIJE KUPOPRODAJE ---");
		console.log("Dokumentacija valjana:", hasValidDocuments);
		console.log("Prodavatelj je vlasnik:", true);
		console.log(
			"Kupac ima dovoljno sredstava:",
			buyerBalanceBefore >= propertyPrice,
		);
		console.log("Allowance dovoljan:", allowanceBefore >= propertyPrice);
		console.log("--------------------------------\n");

		/* ==================================================
		   7. AUTOMATSKO IZVRŠENJE
		   ================================================== */

		const fundSaleHash = await realEstateEscrow.write.fundSale([1n], {
			account: buyer.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: fundSaleHash,
		});

		/* ==================================================
		   8. PROVJERA REZULTATA
		   ================================================== */

		const completedSale = await realEstateEscrow.read.getSale([1n]);

		const ownerAfter = await propertyRegistry.read.getDigitalOwner([1n]);

		const buyerBalanceAfter = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const sellerBalanceAfter = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfter = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		console.log("\n--- AUTOMATSKA KUPOPRODAJA ---");
		console.log("Vlasnik prije:", ownerBefore);
		console.log("Vlasnik nakon:", ownerAfter);
		console.log("Stanje kupca:", buyerBalanceAfter.toString());
		console.log("Stanje prodavatelja:", sellerBalanceAfter.toString());
		console.log("Stanje escrowa:", escrowBalanceAfter.toString());
		console.log("Status prodaje:", completedSale.status);
		console.log("-----------------------------\n");

		assert.equal(
			completedSale.status,
			2,
			"Prodaja mora automatski prijeći u Completed",
		);

		assert.equal(
			completedSale.buyer.toLowerCase(),
			buyer.account.address.toLowerCase(),
		);

		assert.equal(
			ownerAfter.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac mora postati novi digitalni vlasnik",
		);

		assert.equal(
			buyerBalanceAfter,
			5_000_000n,
			"Kupcu mora ostati 50.000,00 mEUR",
		);

		assert.equal(
			sellerBalanceAfter,
			propertyPrice,
			"Prodavatelj mora primiti puni iznos",
		);

		assert.equal(
			escrowBalanceAfter,
			0n,
			"Escrow nakon automatskog završetka ne smije zadržati sredstva",
		);
	});

	it("poništava cijelu transakciju ako escrow nema TRANSFER_ROLE", async function () {
		const {
			seller,
			buyer,
			publicClient,
			propertyRegistry,
			mockEUR,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const buyerInitialBalance = 20_000_000n;
		const propertyPrice = 15_000_000n;

		await prepareVerifiedProperty();

		/*
		 * Namjerno NE pozivamo grantTransferRoleToEscrow().
		 */

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		const ownerBefore = await propertyRegistry.read.getDigitalOwner([1n]);

		await assert.rejects(async () => {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		});

		const saleAfter = await realEstateEscrow.read.getSale([1n]);

		const ownerAfter = await propertyRegistry.read.getDigitalOwner([1n]);

		const buyerBalanceAfter = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const sellerBalanceAfter = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfter = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		console.log("\n--- ATOMSKO PONIŠTAVANJE ---");
		console.log("Status nakon greške:", saleAfter.status);
		console.log("Saldo kupca:", buyerBalanceAfter.toString());
		console.log("Saldo prodavatelja:", sellerBalanceAfter.toString());
		console.log("Saldo escrowa:", escrowBalanceAfter.toString());
		console.log("-----------------------------\n");

		assert.equal(saleAfter.status, 0, "Status se mora vratiti na Created");

		assert.equal(saleAfter.buyer, "0x0000000000000000000000000000000000000000");

		assert.equal(
			buyerBalanceAfter,
			buyerInitialBalance,
			"Kupac mora zadržati sva sredstva",
		);

		assert.equal(sellerBalanceAfter, 0n);

		assert.equal(escrowBalanceAfter, 0n, "Escrow ne smije zadržati sredstva");

		assert.equal(
			ownerBefore.toLowerCase(),
			ownerAfter.toLowerCase(),
			"Vlasništvo se ne smije promijeniti",
		);
	});

	it("vraća točan broj kreiranih prodaja", async function () {
		const {
			seller,
			publicClient,
			realEstateEscrow,
			registerProperty,
			submitAllRequiredDocuments,
			verifyAllRequiredDocuments,
		} = await createEscrowTestContext();

		/* Prva nekretnina */

		await registerProperty("Osijek", "12000/12", "Prva ulica 1, Osijek");

		await submitAllRequiredDocuments(1n);
		await verifyAllRequiredDocuments(1n);

		/* Druga nekretnina */

		await registerProperty("Osijek", "13000/13", "Druga ulica 2, Osijek");

		await submitAllRequiredDocuments(2n);
		await verifyAllRequiredDocuments(2n);

		const firstSaleHash = await realEstateEscrow.write.createSale(
			[1n, 15_000_000n],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstSaleHash,
		});

		const secondSaleHash = await realEstateEscrow.write.createSale(
			[2n, 20_000_000n],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: secondSaleHash,
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		assert.equal(
			saleCount,
			2n,
			"Escrow mora sadržavati dvije kreirane prodaje",
		);
	});

	it("vraća neispunjene uvjete za prodaju koja ne postoji", async function () {
		const { buyer, realEstateEscrow } = await createEscrowTestContext();

		const conditions = await realEstateEscrow.read.getPurchaseConditions([
			999n,
			buyer.account.address,
		]);

		console.log("\n--- NEPOSTOJEĆA PRODAJA ---");
		console.log("Prodaja postoji:", conditions.saleExists);
		console.log("Prodaja aktivna:", conditions.saleActive);
		console.log("Dokumentacija valjana:", conditions.documentsValid);
		console.log("Prodavatelj je vlasnik:", conditions.sellerIsOwner);
		console.log("Kupac nije prodavatelj:", conditions.buyerIsNotSeller);
		console.log(
			"Kupac ima dovoljno sredstava:",
			conditions.buyerHasSufficientBalance,
		);
		console.log("Allowance dovoljan:", conditions.buyerHasSufficientAllowance);
		console.log("Spremno za kupoprodaju:", conditions.readyForPurchase);
		console.log("----------------------------\n");

		assert.equal(conditions.saleExists, false);

		assert.equal(conditions.saleActive, false);

		assert.equal(conditions.documentsValid, false);

		assert.equal(conditions.sellerIsOwner, false);

		assert.equal(conditions.buyerIsNotSeller, false);

		assert.equal(conditions.buyerHasSufficientBalance, false);

		assert.equal(conditions.buyerHasSufficientAllowance, false);

		assert.equal(
			conditions.readyForPurchase,
			false,
			"Nepostojeća prodaja ne može biti spremna za kupoprodaju",
		);
	});

	it("prikazuje da dokumentacija i vlasništvo zadovoljavaju uvjete, ali kupac nema sredstva", async function () {
		const {
			seller,
			buyer,
			publicClient,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;

		await prepareVerifiedProperty();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const conditions = await realEstateEscrow.read.getPurchaseConditions([
			1n,
			buyer.account.address,
		]);

		console.log("\n--- UVJETI BEZ SREDSTAVA ---");
		console.log("Prodaja postoji:", conditions.saleExists);
		console.log("Prodaja aktivna:", conditions.saleActive);
		console.log("Dokumentacija valjana:", conditions.documentsValid);
		console.log("Prodavatelj je vlasnik:", conditions.sellerIsOwner);
		console.log("Kupac nije prodavatelj:", conditions.buyerIsNotSeller);
		console.log(
			"Kupac ima dovoljno sredstava:",
			conditions.buyerHasSufficientBalance,
		);
		console.log("Allowance dovoljan:", conditions.buyerHasSufficientAllowance);
		console.log("Spremno za kupoprodaju:", conditions.readyForPurchase);
		console.log("-----------------------------\n");

		assert.equal(conditions.saleExists, true);

		assert.equal(conditions.saleActive, true);

		assert.equal(conditions.documentsValid, true);

		assert.equal(conditions.sellerIsOwner, true);

		assert.equal(conditions.buyerIsNotSeller, true);

		assert.equal(
			conditions.buyerHasSufficientBalance,
			false,
			"Kupac bez mEUR tokena ne smije zadovoljiti uvjet sredstava",
		);

		assert.equal(conditions.buyerHasSufficientAllowance, false);

		assert.equal(
			conditions.readyForPurchase,
			false,
			"Kupoprodaja ne smije biti spremna bez sredstava",
		);
	});

	it("nakon dodjele sredstava još uvijek nije spremno dok kupac ne odobri allowance", async function () {
		const {
			seller,
			buyer,
			publicClient,
			mockEUR,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerInitialBalance = 20_000_000n;

		await prepareVerifiedProperty();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const conditions = await realEstateEscrow.read.getPurchaseConditions([
			1n,
			buyer.account.address,
		]);

		console.log("\n--- UVJETI PRIJE APPROVE ---");
		console.log("Prodaja postoji:", conditions.saleExists);
		console.log("Prodaja aktivna:", conditions.saleActive);
		console.log("Dokumentacija valjana:", conditions.documentsValid);
		console.log("Prodavatelj je vlasnik:", conditions.sellerIsOwner);
		console.log("Kupac nije prodavatelj:", conditions.buyerIsNotSeller);
		console.log(
			"Kupac ima dovoljno sredstava:",
			conditions.buyerHasSufficientBalance,
		);
		console.log("Allowance dovoljan:", conditions.buyerHasSufficientAllowance);
		console.log("Spremno za kupoprodaju:", conditions.readyForPurchase);
		console.log("-----------------------------\n");

		assert.equal(conditions.saleExists, true);

		assert.equal(conditions.saleActive, true);

		assert.equal(conditions.documentsValid, true);

		assert.equal(conditions.sellerIsOwner, true);

		assert.equal(conditions.buyerIsNotSeller, true);

		assert.equal(
			conditions.buyerHasSufficientBalance,
			true,
			"Kupac ima dovoljno sredstava",
		);

		assert.equal(
			conditions.buyerHasSufficientAllowance,
			false,
			"Bez approve poziva allowance mora biti nedovoljan",
		);

		assert.equal(
			conditions.readyForPurchase,
			false,
			"Samo raspoloživa sredstva nisu dovoljna bez allowancea",
		);
	});

	it("readyForPurchase postaje true tek kada su svi uvjeti kupoprodaje ispunjeni", async function () {
		const {
			seller,
			buyer,
			publicClient,
			propertyRegistry,
			mockEUR,
			realEstateEscrow,
			grantTransferRoleToEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerInitialBalance = 20_000_000n;

		/* ==================================================
		   1. DOKUMENTACIJA
		   ================================================== */

		await prepareVerifiedProperty();

		/* ==================================================
		   2. TRANSFER_ROLE ZA ESCROW
		   ================================================== */

		await grantTransferRoleToEscrow();

		/* ==================================================
		   3. AKTIVNA PRODAJA
		   ================================================== */

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		/* ==================================================
		   4. SREDSTVA KUPCA
		   ================================================== */

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		/* ==================================================
		   5. ALLOWANCE
		   ================================================== */

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		/* ==================================================
		   6. BLOCKCHAIN CHECKLISTA
		   ================================================== */

		const conditionsBeforePurchase =
			await realEstateEscrow.read.getPurchaseConditions([
				1n,
				buyer.account.address,
			]);

		console.log("\n======================================");
		console.log("   UVJETI ZA IZVRŠENJE KUPOPRODAJE");
		console.log("======================================");
		console.log(
			"Prodaja postoji:              ",
			conditionsBeforePurchase.saleExists,
		);
		console.log(
			"Prodaja je aktivna:           ",
			conditionsBeforePurchase.saleActive,
		);
		console.log(
			"Dokumentacija je valjana:     ",
			conditionsBeforePurchase.documentsValid,
		);
		console.log(
			"Prodavatelj je vlasnik:       ",
			conditionsBeforePurchase.sellerIsOwner,
		);
		console.log(
			"Kupac nije prodavatelj:       ",
			conditionsBeforePurchase.buyerIsNotSeller,
		);
		console.log(
			"Kupac ima dovoljno sredstava: ",
			conditionsBeforePurchase.buyerHasSufficientBalance,
		);
		console.log(
			"Allowance je dovoljan:        ",
			conditionsBeforePurchase.buyerHasSufficientAllowance,
		);
		console.log("--------------------------------------");
		console.log(
			"SPREMNO ZA KUPOPRODAJU:       ",
			conditionsBeforePurchase.readyForPurchase,
		);
		console.log("======================================\n");

		assert.equal(conditionsBeforePurchase.saleExists, true);

		assert.equal(conditionsBeforePurchase.saleActive, true);

		assert.equal(conditionsBeforePurchase.documentsValid, true);

		assert.equal(conditionsBeforePurchase.sellerIsOwner, true);

		assert.equal(conditionsBeforePurchase.buyerIsNotSeller, true);

		assert.equal(conditionsBeforePurchase.buyerHasSufficientBalance, true);

		assert.equal(conditionsBeforePurchase.buyerHasSufficientAllowance, true);

		assert.equal(
			conditionsBeforePurchase.readyForPurchase,
			true,
			"Smart contract mora označiti kupoprodaju spremnom tek kada su svi uvjeti ispunjeni",
		);

		/* ==================================================
		   7. AUTOMATSKO IZVRŠENJE
		   ================================================== */

		const fundSaleHash = await realEstateEscrow.write.fundSale([1n], {
			account: buyer.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: fundSaleHash,
		});

		const saleAfterPurchase = await realEstateEscrow.read.getSale([1n]);

		const newOwner = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(
			saleAfterPurchase.status,
			2,
			"Prodaja mora nakon izvršenja biti Completed",
		);

		assert.equal(
			newOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac mora postati novi digitalni vlasnik",
		);

		/* ==================================================
		   8. NAKON KUPOPRODAJE VIŠE NIJE AKTIVNA
		   ================================================== */

		const conditionsAfterPurchase =
			await realEstateEscrow.read.getPurchaseConditions([
				1n,
				buyer.account.address,
			]);

		assert.equal(
			conditionsAfterPurchase.saleExists,
			true,
			"Završena prodaja i dalje postoji u povijesti",
		);

		assert.equal(
			conditionsAfterPurchase.saleActive,
			false,
			"Završena prodaja više ne smije biti aktivna",
		);

		assert.equal(
			conditionsAfterPurchase.readyForPurchase,
			false,
			"Završena prodaja više ne smije biti dostupna za novu kupnju",
		);
	});

	it("otkazana prodaja više nije spremna za kupoprodaju", async function () {
		const {
			seller,
			buyer,
			publicClient,
			mockEUR,
			realEstateEscrow,
			prepareVerifiedProperty,
		} = await createEscrowTestContext();

		const propertyPrice = 15_000_000n;
		const buyerInitialBalance = 20_000_000n;

		await prepareVerifiedProperty();

		const createSaleHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleHash,
		});

		const mintHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintHash,
		});

		const approveHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveHash,
		});

		const beforeCancellation =
			await realEstateEscrow.read.getPurchaseConditions([
				1n,
				buyer.account.address,
			]);

		assert.equal(
			beforeCancellation.readyForPurchase,
			true,
			"Prije otkazivanja svi uvjeti moraju biti zadovoljeni",
		);

		const cancelHash = await realEstateEscrow.write.cancelSale([1n], {
			account: seller.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: cancelHash,
		});

		const afterCancellation = await realEstateEscrow.read.getPurchaseConditions(
			[1n, buyer.account.address],
		);

		console.log("\n--- OTKAZANA PRODAJA ---");
		console.log("Prodaja postoji:", afterCancellation.saleExists);
		console.log("Prodaja aktivna:", afterCancellation.saleActive);
		console.log("Spremno za kupoprodaju:", afterCancellation.readyForPurchase);
		console.log("------------------------\n");

		assert.equal(
			afterCancellation.saleExists,
			true,
			"Otkazana prodaja ostaje spremljena u povijesti",
		);

		assert.equal(
			afterCancellation.saleActive,
			false,
			"Otkazana prodaja više nije aktivna",
		);

		assert.equal(
			afterCancellation.readyForPurchase,
			false,
			"Otkazana prodaja ne smije biti spremna za izvršenje",
		);
	});
});
