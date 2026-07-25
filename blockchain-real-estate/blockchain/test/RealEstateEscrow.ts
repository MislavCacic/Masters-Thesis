import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { viem } = await hre.network.create();

describe("RealEstateEscrow", function () {
	it("postavlja escrow i povezuje ga s registrom i tokenom", async function () {
		// Postavljanje registra nekretnina.
		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		// Postavljanje simuliranog euro tokena.
		const mockEUR = await viem.deployContract("MockEUR");

		// Postavljanje escrow ugovora uz adrese registra i tokena.
		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		// Čitanje spremljenih adresa iz escrow ugovora.
		const storedRegistryAddress =
			await realEstateEscrow.read.propertyRegistry();

		const storedPaymentTokenAddress =
			await realEstateEscrow.read.paymentToken();

		console.log("\n--- REAL ESTATE ESCROW ---");
		console.log("Adresa PropertyRegistry ugovora:", propertyRegistry.address);
		console.log("Adresa MockEUR ugovora:", mockEUR.address);
		console.log("Adresa RealEstateEscrow ugovora:", realEstateEscrow.address);
		console.log("Registar spremljen u escrowu:", storedRegistryAddress);
		console.log("Token spremljen u escrowu:", storedPaymentTokenAddress);
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

	it("vlasnik potvrđene nekretnine kreira prodaju", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

		const propertyPrice = 15_000_000n; // 150.000,00 mEUR

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "6000/6", "Trg slobode 1, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Vlasnik nekretnine kreira ponudu za prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		// 4. Dohvat spremljene prodaje.
		const sale = await realEstateEscrow.read.getSale([1n]);

		console.log("\n--- KREIRANA PRODAJA ---");
		console.log("ID prodaje:", sale.id.toString());
		console.log("ID nekretnine:", sale.propertyId.toString());
		console.log("Prodavatelj:", sale.seller);
		console.log("Kupac:", sale.buyer);
		console.log("Cijena u najmanjim jedinicama:", sale.price.toString());
		console.log("Cijena u mEUR:", Number(sale.price) / 100);
		console.log("Status prodaje:", sale.status);
		console.log("Postoji:", sale.exists);
		console.log("-------------------------\n");

		assert.equal(sale.id, 1n);
		assert.equal(sale.propertyId, 1n);

		assert.equal(
			sale.seller.toLowerCase(),
			seller.account.address.toLowerCase(),
		);

		assert.equal(sale.buyer, "0x0000000000000000000000000000000000000000");

		assert.equal(sale.price, propertyPrice);
		assert.equal(sale.status, 0);
		assert.equal(sale.exists, true);
	});

	it("prodavatelj otkazuje prodaju prije uplate i ponovno kreira novu prodaju", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

		const firstPrice = 15_000_000n; // 150.000,00 mEUR
		const secondPrice = 16_000_000n; // 160.000,00 mEUR

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "9000/9", "Radićeva ulica 30, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Prodavatelj kreira prvu prodaju.
		const createFirstSaleTransactionHash =
			await realEstateEscrow.write.createSale([1n, firstPrice], {
				account: seller.account,
			});

		await publicClient.waitForTransactionReceipt({
			hash: createFirstSaleTransactionHash,
		});

		const saleBeforeCancellation = await realEstateEscrow.read.getSale([1n]);

		console.log("\n--- OTKAZIVANJE PRODAJE ---");
		console.log("Status prije otkazivanja:", saleBeforeCancellation.status);
		console.log(
			"Cijena prve prodaje:",
			saleBeforeCancellation.price.toString(),
		);

		// 4. Prodavatelj otkazuje prodaju.
		const cancelSaleTransactionHash = await realEstateEscrow.write.cancelSale(
			[1n],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: cancelSaleTransactionHash,
		});

		const cancelledSale = await realEstateEscrow.read.getSale([1n]);

		console.log("Status nakon otkazivanja:", cancelledSale.status);

		// 5. Za istu nekretninu kreira se nova prodaja.
		const createSecondSaleTransactionHash =
			await realEstateEscrow.write.createSale([1n, secondPrice], {
				account: seller.account,
			});

		await publicClient.waitForTransactionReceipt({
			hash: createSecondSaleTransactionHash,
		});

		const newSale = await realEstateEscrow.read.getSale([2n]);

		console.log("ID nove prodaje:", newSale.id.toString());
		console.log("Cijena nove prodaje:", newSale.price.toString());
		console.log("Status nove prodaje:", newSale.status);
		console.log("---------------------------\n");

		assert.equal(
			saleBeforeCancellation.status,
			0,
			"Početni status prodaje mora biti Created",
		);

		assert.equal(
			cancelledSale.status,
			3,
			"Status otkazane prodaje mora biti Cancelled",
		);

		assert.equal(newSale.id, 2n, "Nova prodaja mora imati ID 2");

		assert.equal(
			newSale.propertyId,
			1n,
			"Nova prodaja mora pripadati istoj nekretnini",
		);

		assert.equal(
			newSale.price,
			secondPrice,
			"Nova prodaja mora imati novu cijenu",
		);

		assert.equal(newSale.status, 0, "Nova prodaja mora biti u statusu Created");
	});

	it("ne dopušta korisniku koji nije prodavatelj otkazivanje prodaje", async function () {
		const [deployer, seller, unauthorizedUser] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

		const propertyPrice = 15_000_000n;

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				[
					"Osijek",
					"10000/10",
					"Strossmayerova ulica 100, Osijek",
					documentHash,
				],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Prodavatelj kreira prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		const saleBeforeAttempt = await realEstateEscrow.read.getSale([1n]);

		console.log("\n--- NEOVLAŠTENO OTKAZIVANJE PRODAJE ---");
		console.log("Prodavatelj:", seller.account.address);
		console.log("Neovlašteni korisnik:", unauthorizedUser.account.address);
		console.log("Status prije pokušaja:", saleBeforeAttempt.status);

		// 4. Drugi korisnik pokušava otkazati prodaju.
		await assert.rejects(async () => {
			await realEstateEscrow.write.cancelSale([1n], {
				account: unauthorizedUser.account,
			});
		});

		const saleAfterAttempt = await realEstateEscrow.read.getSale([1n]);

		console.log("Pokušaj otkazivanja: odbijen");
		console.log("Status nakon pokušaja:", saleAfterAttempt.status);
		console.log("----------------------------------------\n");

		assert.equal(
			saleBeforeAttempt.status,
			0,
			"Prodaja prije pokušaja mora biti u statusu Created",
		);

		assert.equal(
			saleAfterAttempt.status,
			0,
			"Prodaja nakon neovlaštenog pokušaja mora ostati Created",
		);

		assert.equal(
			saleAfterAttempt.seller.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj se ne smije promijeniti",
		);
	});

	it("automatski završava kupoprodaju nakon uplate kupca", async function () {
		const [deployer, seller, buyer] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

		const buyerInitialBalance = 20_000_000n; // 200.000,00 mEUR
		const propertyPrice = 15_000_000n; // 150.000,00 mEUR

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "8000/8", "Divaltova ulica 80, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Escrow ugovor dobiva TRANSFER_ROLE.
		const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole(
			[transferRole, realEstateEscrow.address],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		// 4. Prodavatelj kreira prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		// 5. Kupcu se dodjeljuju mEUR tokeni.
		const mintTransactionHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		// 6. Kupac odobrava escrowu korištenje sredstava.
		const approveTransactionHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveTransactionHash,
		});

		const propertyBeforePurchase = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- AUTOMATSKA KUPOPRODAJA ---");
		console.log("Vlasnik prije kupnje:", propertyBeforePurchase.digitalOwner);
		console.log("Stanje kupca prije kupnje:", buyerInitialBalance.toString());

		// 7. Kupac polaže sredstva.
		// Unutar iste transakcije automatski se izvršavaju:
		// prijenos vlasništva i isplata prodavatelja.
		const fundSaleTransactionHash = await realEstateEscrow.write.fundSale(
			[1n],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: fundSaleTransactionHash,
		});

		const completedSale = await realEstateEscrow.read.getSale([1n]);

		const propertyAfterPurchase = await propertyRegistry.read.getProperty([1n]);

		const buyerBalance = await mockEUR.read.balanceOf([buyer.account.address]);

		const sellerBalance = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalance = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		console.log("Vlasnik nakon kupnje:", propertyAfterPurchase.digitalOwner);
		console.log("Stanje kupca nakon kupnje:", buyerBalance.toString());
		console.log("Stanje prodavatelja:", sellerBalance.toString());
		console.log("Stanje escrow ugovora:", escrowBalance.toString());
		console.log("Status prodaje:", completedSale.status);
		console.log("-----------------------------\n");

		assert.equal(
			propertyBeforePurchase.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj prije kupnje mora biti vlasnik",
		);

		assert.equal(
			propertyAfterPurchase.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac mora postati novi digitalni vlasnik",
		);

		assert.equal(
			completedSale.buyer.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Adresa kupca mora biti spremljena u prodaji",
		);

		assert.equal(
			completedSale.status,
			2,
			"Prodaja mora automatski prijeći u status Completed",
		);

		assert.equal(buyerBalance, 5_000_000n, "Kupcu mora ostati 50.000,00 mEUR");

		assert.equal(
			sellerBalance,
			propertyPrice,
			"Prodavatelj mora primiti 150.000,00 mEUR",
		);

		assert.equal(
			escrowBalance,
			0n,
			"Escrow nakon završetka ne smije zadržati sredstva",
		);
	});

	it("vraća točan broj kreiranih prodaja", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const firstDocumentHash =
			"0x1111111111111111111111111111111111111111111111111111111111111111";

		const secondDocumentHash =
			"0x2222222222222222222222222222222222222222222222222222222222222222";

		// Registracija prve nekretnine.
		const firstRegisterHash = await propertyRegistry.write.registerProperty(
			["Osijek", "12000/12", "Prva ulica 1, Osijek", firstDocumentHash],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstRegisterHash,
		});

		// Registracija druge nekretnine.
		const secondRegisterHash = await propertyRegistry.write.registerProperty(
			["Osijek", "13000/13", "Druga ulica 2, Osijek", secondDocumentHash],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: secondRegisterHash,
		});

		// Potvrda prve nekretnine.
		const firstVerifyHash = await propertyRegistry.write.verifyProperty([1n], {
			account: deployer.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: firstVerifyHash,
		});

		// Potvrda druge nekretnine.
		const secondVerifyHash = await propertyRegistry.write.verifyProperty([2n], {
			account: deployer.account,
		});

		await publicClient.waitForTransactionReceipt({
			hash: secondVerifyHash,
		});

		// Kreiranje prve prodaje.
		const firstSaleHash = await realEstateEscrow.write.createSale(
			[1n, 15_000_000n],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstSaleHash,
		});

		// Kreiranje druge prodaje.
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

		console.log("\n--- BROJ PRODAJA ---");
		console.log("Ukupan broj kreiranih prodaja:", saleCount.toString());
		console.log("--------------------\n");

		assert.equal(
			saleCount,
			2n,
			"Escrow mora sadržavati dvije kreirane prodaje",
		);
	});

	it("ne dopušta korisniku koji nije vlasnik nekretnine kreiranje prodaje", async function () {
		const [deployer, seller, unauthorizedUser] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x3333333333333333333333333333333333333333333333333333333333333333";

		const propertyPrice = 15_000_000n;

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				[
					"Osijek",
					"14000/14",
					"Vijenac Ivana Meštrovića 14, Osijek",
					documentHash,
				],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const currentOwner = await propertyRegistry.read.getDigitalOwner([1n]);

		console.log("\n--- NEOVLAŠTENO KREIRANJE PRODAJE ---");
		console.log("Vlasnik nekretnine:", currentOwner);
		console.log("Neovlašteni korisnik:", unauthorizedUser.account.address);

		// 3. Korisnik koji nije vlasnik pokušava kreirati prodaju.
		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, propertyPrice], {
				account: unauthorizedUser.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		console.log("Pokušaj kreiranja prodaje: odbijen");
		console.log("Broj prodaja nakon pokušaja:", saleCount.toString());
		console.log("Vlasnik nakon pokušaja:", ownerAfterAttempt);
		console.log("---------------------------------------\n");

		assert.equal(
			saleCount,
			0n,
			"Neovlašteni pokušaj ne smije kreirati prodaju",
		);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Digitalni vlasnik mora ostati nepromijenjen",
		);
	});

	it("ne dopušta kreiranje prodaje za nepotvrđenu nekretninu", async function () {
		const [, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x4444444444444444444444444444444444444444444444444444444444444444";

		const propertyPrice = 15_000_000n;

		// Prodavatelj registrira nekretninu, ali je verifikator ne potvrđuje.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "15000/15", "Kačićeva ulica 15, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- PRODAJA NEPOTVRĐENE NEKRETNINE ---");
		console.log("Status nekretnine:", propertyBeforeAttempt.verificationStatus);
		console.log("Digitalni vlasnik:", propertyBeforeAttempt.digitalOwner);

		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, propertyPrice], {
				account: seller.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		const propertyAfterAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("Pokušaj kreiranja prodaje: odbijen");
		console.log("Broj prodaja nakon pokušaja:", saleCount.toString());
		console.log(
			"Status nekretnine nakon pokušaja:",
			propertyAfterAttempt.verificationStatus,
		);
		console.log("---------------------------------------\n");

		assert.equal(
			propertyBeforeAttempt.verificationStatus,
			0,
			"Nekretnina mora biti u statusu Pending",
		);

		assert.equal(
			saleCount,
			0n,
			"Nepotvrđena nekretnina ne smije dobiti prodaju",
		);

		assert.equal(
			propertyAfterAttempt.verificationStatus,
			0,
			"Status nekretnine mora ostati Pending",
		);
	});

	it("ne dopušta dvije aktivne prodaje za istu nekretninu", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x5555555555555555555555555555555555555555555555555555555555555555";

		const firstPrice = 15_000_000n;
		const secondPrice = 16_000_000n;

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				[
					"Osijek",
					"16000/16",
					"Ulica Hrvatske Republike 16, Osijek",
					documentHash,
				],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Prodavatelj kreira prvu prodaju.
		const firstSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, firstPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstSaleTransactionHash,
		});

		const firstSale = await realEstateEscrow.read.getSale([1n]);

		console.log("\n--- DVOSTRUKA AKTIVNA PRODAJA ---");
		console.log("ID prve prodaje:", firstSale.id.toString());
		console.log("Cijena prve prodaje:", firstSale.price.toString());
		console.log("Status prve prodaje:", firstSale.status);

		// 4. Pokušaj kreiranja druge aktivne prodaje
		// za istu nekretninu.
		await assert.rejects(async () => {
			await realEstateEscrow.write.createSale([1n, secondPrice], {
				account: seller.account,
			});
		});

		const saleCount = await realEstateEscrow.read.getSaleCount();

		const firstSaleAfterAttempt = await realEstateEscrow.read.getSale([1n]);

		console.log("Druga aktivna prodaja: odbijena");
		console.log("Ukupan broj prodaja:", saleCount.toString());
		console.log(
			"Status prve prodaje nakon pokušaja:",
			firstSaleAfterAttempt.status,
		);
		console.log("--------------------------------\n");

		assert.equal(saleCount, 1n, "Mora postojati samo jedna prodaja");

		assert.equal(
			firstSaleAfterAttempt.price,
			firstPrice,
			"Cijena prve prodaje ne smije se promijeniti",
		);

		assert.equal(
			firstSaleAfterAttempt.status,
			0,
			"Prva prodaja mora ostati u statusu Created",
		);
	});

	it("ne dopušta kreiranje prodaje s cijenom nula", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x6666666666666666666666666666666666666666666666666666666666666666";

		// Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "17000/17", "Županijska ulica 17, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		console.log("\n--- PRODAJA S CIJENOM NULA ---");
		console.log("Pokušaj kreiranja prodaje s cijenom:", 0);

		let caughtError: unknown;

		try {
			await realEstateEscrow.write.createSale([1n, 0n], {
				account: seller.account,
			});
		} catch (error) {
			caughtError = error;
		}

		// Provjerava da je pametni ugovor stvarno odbio transakciju.
		assert.ok(caughtError, "Pametni ugovor mora odbiti prodaju s cijenom nula");

		const errorMessage =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		// Provjerava stvarni razlog odbijanja koji je vratio ugovor.
		assert.match(
			errorMessage,
			/Cijena mora biti veca od nule/,
			"Greška mora sadržavati očekivani razlog odbijanja",
		);

		const saleCount = await realEstateEscrow.read.getSaleCount();

		console.log("Stvarna poruka greške ugovora:", errorMessage);
		console.log("Ukupan broj prodaja nakon pokušaja:", saleCount.toString());
		console.log("--------------------------------\n");

		assert.equal(
			saleCount,
			0n,
			"Prodaja s cijenom nula ne smije biti kreirana",
		);
	});

	it("poništava cijelu kupoprodaju ako escrow nema transfer ulogu", async function () {
		const [deployer, seller, buyer] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x7777777777777777777777777777777777777777777777777777777777777777";

		const buyerInitialBalance = 20_000_000n;
		const propertyPrice = 15_000_000n;

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "18000/18", "Vukovarska cesta 18, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// Namjerno ne dodjeljujemo TRANSFER_ROLE escrow ugovoru.

		// 3. Prodavatelj kreira prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		// 4. Kupcu se dodjeljuju tokeni.
		const mintTransactionHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		// 5. Kupac odobrava escrowu korištenje tokena.
		const approveTransactionHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveTransactionHash,
		});

		const ownerBeforeAttempt = await propertyRegistry.read.getDigitalOwner([
			1n,
		]);

		const buyerBalanceBeforeAttempt = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		console.log("\n--- PONIŠTAVANJE NEUSPJEŠNE KUPOPRODAJE ---");
		console.log("Vlasnik prije pokušaja:", ownerBeforeAttempt);
		console.log(
			"Stanje kupca prije pokušaja:",
			buyerBalanceBeforeAttempt.toString(),
		);

		// 6. Kupnja mora pasti jer escrow nema TRANSFER_ROLE.
		await assert.rejects(async () => {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		});

		const saleAfterAttempt = await realEstateEscrow.read.getSale([1n]);

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		const buyerBalanceAfterAttempt = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const sellerBalanceAfterAttempt = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfterAttempt = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		console.log("Kupoprodaja: poništena");
		console.log("Status prodaje nakon pokušaja:", saleAfterAttempt.status);
		console.log(
			"Stanje kupca nakon pokušaja:",
			buyerBalanceAfterAttempt.toString(),
		);
		console.log("Stanje prodavatelja:", sellerBalanceAfterAttempt.toString());
		console.log("Stanje escrow ugovora:", escrowBalanceAfterAttempt.toString());
		console.log("Vlasnik nakon pokušaja:", ownerAfterAttempt);
		console.log("------------------------------------------\n");

		assert.equal(
			saleAfterAttempt.status,
			0,
			"Prodaja mora ostati u statusu Created",
		);

		assert.equal(
			saleAfterAttempt.buyer,
			"0x0000000000000000000000000000000000000000",
			"Kupac ne smije ostati spremljen nakon poništene transakcije",
		);

		assert.equal(
			buyerBalanceAfterAttempt,
			buyerInitialBalance,
			"Kupcu se tokeni ne smiju oduzeti",
		);

		assert.equal(
			sellerBalanceAfterAttempt,
			0n,
			"Prodavatelj ne smije primiti sredstva",
		);

		assert.equal(
			escrowBalanceAfterAttempt,
			0n,
			"Escrow ne smije zadržati sredstva",
		);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati vlasnik nekretnine",
		);
	});

	it("ne dopušta prodavatelju kupnju vlastite nekretnine", async function () {
		const [deployer, seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x8888888888888888888888888888888888888888888888888888888888888888";

		const sellerInitialBalance = 20_000_000n;
		const propertyPrice = 15_000_000n;

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "19000/19", "Trg Ante Starčevića 19, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Prodavatelj kreira prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		// 4. Prodavatelju se dodjeljuju tokeni.
		const mintTransactionHash = await mockEUR.write.mint([
			seller.account.address,
			sellerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		// 5. Prodavatelj odobrava escrowu korištenje tokena.
		const approveTransactionHash = await mockEUR.write.approve(
			[realEstateEscrow.address, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveTransactionHash,
		});

		console.log("\n--- KUPOVINA VLASTITE NEKRETNINE ---");
		console.log("Adresa prodavatelja:", seller.account.address);
		console.log("Pokušaj kupovine vlastite nekretnine");

		// 6. Prodavatelj pokušava kupiti vlastitu nekretninu.
		await assert.rejects(async () => {
			await realEstateEscrow.write.fundSale([1n], {
				account: seller.account,
			});
		});

		const saleAfterAttempt = await realEstateEscrow.read.getSale([1n]);

		const sellerBalanceAfterAttempt = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfterAttempt = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		const allowanceAfterAttempt = await mockEUR.read.allowance([
			seller.account.address,
			realEstateEscrow.address,
		]);

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		console.log("Pokušaj kupovine: odbijen");
		console.log("Status prodaje nakon pokušaja:", saleAfterAttempt.status);
		console.log("Stanje prodavatelja:", sellerBalanceAfterAttempt.toString());
		console.log("Stanje escrow ugovora:", escrowBalanceAfterAttempt.toString());
		console.log("Digitalni vlasnik:", ownerAfterAttempt);
		console.log("-------------------------------------\n");

		assert.equal(
			saleAfterAttempt.status,
			0,
			"Prodaja mora ostati u statusu Created",
		);

		assert.equal(
			saleAfterAttempt.buyer,
			"0x0000000000000000000000000000000000000000",
			"Kupac ne smije biti spremljen",
		);

		assert.equal(
			sellerBalanceAfterAttempt,
			sellerInitialBalance,
			"Prodavatelju se tokeni ne smiju oduzeti",
		);

		assert.equal(
			escrowBalanceAfterAttempt,
			0n,
			"Escrow ne smije primiti sredstva",
		);

		assert.equal(
			allowanceAfterAttempt,
			propertyPrice,
			"Odobrenje mora ostati nepotrošeno",
		);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati vlasnik nekretnine",
		);
	});

	it("ne dopušta kupnju ako kupac nije odobrio dovoljan iznos tokena", async function () {
		const [deployer, seller, buyer] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const mockEUR = await viem.deployContract("MockEUR");

		const realEstateEscrow = await viem.deployContract("RealEstateEscrow", [
			propertyRegistry.address,
			mockEUR.address,
		]);

		const documentHash =
			"0x9999999999999999999999999999999999999999999999999999999999999999";

		const buyerInitialBalance = 20_000_000n; // 200.000,00 mEUR
		const propertyPrice = 15_000_000n; // 150.000,00 mEUR
		const approvedAmount = 10_000_000n; // 100.000,00 mEUR

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "20000/20", "Ulica kneza Trpimira 20, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		// 3. Escrow dobiva dopuštenje za prijenos vlasništva.
		const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole(
			[transferRole, realEstateEscrow.address],
			{
				account: deployer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		// 4. Prodavatelj kreira prodaju.
		const createSaleTransactionHash = await realEstateEscrow.write.createSale(
			[1n, propertyPrice],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: createSaleTransactionHash,
		});

		// 5. Kupac dobiva dovoljno tokena.
		const mintTransactionHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialBalance,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		// 6. Kupac odobrava samo 100.000,00 mEUR,
		// iako nekretnina košta 150.000,00 mEUR.
		const approveTransactionHash = await mockEUR.write.approve(
			[realEstateEscrow.address, approvedAmount],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveTransactionHash,
		});

		console.log("\n--- NEDOVOLJNO ODOBRENJE TOKENA ---");
		console.log("Prodajna cijena:", propertyPrice.toString());
		console.log("Odobreni iznos:", approvedAmount.toString());

		// 7. Kupnja mora biti odbijena jer odobrenje nije dovoljno.
		await assert.rejects(async () => {
			await realEstateEscrow.write.fundSale([1n], {
				account: buyer.account,
			});
		});

		const saleAfterAttempt = await realEstateEscrow.read.getSale([1n]);

		const buyerBalanceAfterAttempt = await mockEUR.read.balanceOf([
			buyer.account.address,
		]);

		const sellerBalanceAfterAttempt = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const escrowBalanceAfterAttempt = await mockEUR.read.balanceOf([
			realEstateEscrow.address,
		]);

		const allowanceAfterAttempt = await mockEUR.read.allowance([
			buyer.account.address,
			realEstateEscrow.address,
		]);

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		console.log("Pokušaj kupnje: odbijen");
		console.log("Status prodaje:", saleAfterAttempt.status);
		console.log("Stanje kupca:", buyerBalanceAfterAttempt.toString());
		console.log("Stanje prodavatelja:", sellerBalanceAfterAttempt.toString());
		console.log("Stanje escrow ugovora:", escrowBalanceAfterAttempt.toString());
		console.log("Preostalo odobrenje:", allowanceAfterAttempt.toString());
		console.log("------------------------------------\n");

		assert.equal(
			saleAfterAttempt.status,
			0,
			"Prodaja mora ostati u statusu Created",
		);

		assert.equal(
			saleAfterAttempt.buyer,
			"0x0000000000000000000000000000000000000000",
			"Kupac ne smije biti spremljen",
		);

		assert.equal(
			buyerBalanceAfterAttempt,
			buyerInitialBalance,
			"Kupcu se tokeni ne smiju oduzeti",
		);

		assert.equal(
			sellerBalanceAfterAttempt,
			0n,
			"Prodavatelj ne smije primiti tokene",
		);

		assert.equal(
			escrowBalanceAfterAttempt,
			0n,
			"Escrow ne smije primiti tokene",
		);

		assert.equal(
			allowanceAfterAttempt,
			approvedAmount,
			"Odobrenje mora ostati nepotrošeno",
		);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati vlasnik",
		);
	});
});
