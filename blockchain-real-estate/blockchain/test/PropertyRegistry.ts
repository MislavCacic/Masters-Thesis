import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, toBytes } from "viem";

const { viem } = await hre.network.create();

describe("PropertyRegistry", function () {
	it("postavlja ugovor i dodjeljuje uloge administratoru", async function () {
		// Dohvaćamo testne wallet račune lokalnog blockchaina.
		const [deployer] = await viem.getWalletClients();

		// Postavljamo PropertyRegistry ugovor na lokalni blockchain.
		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const deployerAddress = deployer.account.address;

		// Dohvaćamo identifikatore uloga iz ugovora.
		const adminRole = await propertyRegistry.read.DEFAULT_ADMIN_ROLE();

		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		// Provjeravamo ima li deployer obje uloge.
		const hasAdminRole = await propertyRegistry.read.hasRole([
			adminRole,
			deployerAddress,
		]);

		const hasVerifierRole = await propertyRegistry.read.hasRole([
			verifierRole,
			deployerAddress,
		]);

		console.log("\n--- PROPERTY REGISTRY TEST ---");
		console.log("Adresa ugovora:", propertyRegistry.address);
		console.log("Adresa administratora:", deployerAddress);
		console.log("Ima administratorsku ulogu:", hasAdminRole);
		console.log("Ima verifikatorsku ulogu:", hasVerifierRole);
		console.log("------------------------------\n");

		assert.equal(
			hasAdminRole,
			true,
			"Deployer mora imati administratorsku ulogu",
		);

		assert.equal(
			hasVerifierRole,
			true,
			"Deployer mora imati verifikatorsku ulogu",
		);
	});

	it("registrira nekretninu i dohvaća spremljene podatke", async function () {
		const [seller] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(toBytes("testna dokumentacija nekretnine"));

		const transactionHash = await propertyRegistry.write.registerProperty([
			"Osijek",
			"1234/5",
			"Europska avenija 1, Osijek",
			documentHash,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: transactionHash,
		});

		const property = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- REGISTRIRANA NEKRETNINA ---");
		console.log("ID:", property.id.toString());
		console.log("Katastarska općina:", property.cadastralMunicipality);
		console.log("Broj čestice:", property.parcelNumber);
		console.log("Adresa:", property.propertyAddress);
		console.log("Hash dokumentacije:", property.documentHash);
		console.log("Digitalni vlasnik:", property.digitalOwner);
		console.log("Status provjere:", property.verificationStatus);
		console.log("Postoji:", property.exists);
		console.log("--------------------------------\n");

		assert.equal(property.id, 1n);
		assert.equal(property.cadastralMunicipality, "Osijek");
		assert.equal(property.parcelNumber, "1234/5");
		assert.equal(property.propertyAddress, "Europska avenija 1, Osijek");
		assert.equal(property.documentHash, documentHash);
		assert.equal(
			property.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
		);
		assert.equal(property.verificationStatus, 0);
		assert.equal(property.exists, true);
	});

	it("verifikator potvrđuje registriranu nekretninu", async function () {
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("dokumentacija za provjeru nekretnine"),
		);

		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Vinkovci",
				"5678/2",
				"Ulica bana Jelačića 10, Vinkovci",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeVerification = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- PROVJERA NEKRETNINE ---");
		console.log(
			"Status prije potvrde:",
			propertyBeforeVerification.verificationStatus,
		);

		const verifyTransactionHash = await propertyRegistry.write.verifyProperty([
			1n,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const propertyAfterVerification = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log(
			"Status nakon potvrde:",
			propertyAfterVerification.verificationStatus,
		);
		console.log("----------------------------\n");

		assert.equal(
			propertyBeforeVerification.verificationStatus,
			0,
			"Početni status mora biti Pending",
		);

		assert.equal(
			propertyAfterVerification.verificationStatus,
			1,
			"Status nakon potvrde mora biti Verified",
		);
	});

	it("verifikator odbija registriranu nekretninu", async function () {
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("neispravna dokumentacija nekretnine"),
		);

		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Đakovo",
				"9876/3",
				"Ulica kralja Tomislava 20, Đakovo",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeRejection = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- ODBIJANJE NEKRETNINE ---");
		console.log(
			"Status prije odbijanja:",
			propertyBeforeRejection.verificationStatus,
		);

		const rejectTransactionHash = await propertyRegistry.write.rejectProperty([
			1n,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: rejectTransactionHash,
		});

		const propertyAfterRejection = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log(
			"Status nakon odbijanja:",
			propertyAfterRejection.verificationStatus,
		);
		console.log("-----------------------------\n");

		assert.equal(
			propertyBeforeRejection.verificationStatus,
			0,
			"Početni status mora biti Pending",
		);

		assert.equal(
			propertyAfterRejection.verificationStatus,
			2,
			"Status nakon odbijanja mora biti Rejected",
		);
	});

	it("ne dopušta korisniku bez verifikatorske uloge potvrdu nekretnine", async function () {
		const [, unauthorizedUser] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("dokumentacija za test neovlastenog korisnika"),
		);

		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Osijek",
				"2222/4",
				"Kapucinska ulica 10, Osijek",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		console.log("\n--- NEOVLASTENA POTVRDA ---");
		console.log(
			"Adresa neovlastenog korisnika:",
			unauthorizedUser.account.address,
		);

		await assert.rejects(async () => {
			await propertyRegistry.write.verifyProperty([1n], {
				account: unauthorizedUser.account,
			});
		});

		const property = await propertyRegistry.read.getProperty([1n]);

		console.log(
			"Status nakon neuspjelog pokusaja:",
			property.verificationStatus,
		);
		console.log("----------------------------\n");

		assert.equal(property.verificationStatus, 0, "Status mora ostati Pending");
	});

	it("ne dopušta dvostruku registraciju iste katastarske čestice", async function () {
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const firstDocumentHash = keccak256(
			toBytes("prva dokumentacija nekretnine"),
		);

		const secondDocumentHash = keccak256(
			toBytes("druga dokumentacija iste nekretnine"),
		);

		const firstTransactionHash = await propertyRegistry.write.registerProperty([
			"Osijek",
			"1234/5",
			"Europska avenija 1, Osijek",
			firstDocumentHash,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: firstTransactionHash,
		});

		console.log("\n--- DVOSTRUKA REGISTRACIJA ---");
		console.log("Prva registracija: uspješna");

		await assert.rejects(async () => {
			await propertyRegistry.write.registerProperty([
				"Osijek",
				"1234/5",
				"Druga unesena adresa, Osijek",
				secondDocumentHash,
			]);
		});

		const registeredProperty = await propertyRegistry.read.getProperty([1n]);

		console.log("Druga registracija iste čestice: odbijena");
		console.log("Registrirana čestica:", registeredProperty.parcelNumber);
		console.log("------------------------------\n");

		assert.equal(registeredProperty.cadastralMunicipality, "Osijek");

		assert.equal(registeredProperty.parcelNumber, "1234/5");
	});

	it("vraća točan broj registriranih nekretnina", async function () {
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const firstDocumentHash = keccak256(
			toBytes("dokumentacija prve nekretnine"),
		);

		const secondDocumentHash = keccak256(
			toBytes("dokumentacija druge nekretnine"),
		);

		const firstTransactionHash = await propertyRegistry.write.registerProperty([
			"Osijek",
			"1000/1",
			"Vukovarska cesta 10, Osijek",
			firstDocumentHash,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: firstTransactionHash,
		});

		const secondTransactionHash = await propertyRegistry.write.registerProperty(
			[
				"Vinkovci",
				"2000/2",
				"Ulica bana Jelačića 20, Vinkovci",
				secondDocumentHash,
			],
		);

		await publicClient.waitForTransactionReceipt({
			hash: secondTransactionHash,
		});

		const propertyCount = await propertyRegistry.read.getPropertyCount();

		console.log("\n--- BROJ NEKRETNINA ---");
		console.log(
			"Ukupan broj registriranih nekretnina:",
			propertyCount.toString(),
		);
		console.log("------------------------\n");

		assert.equal(
			propertyCount,
			2n,
			"Registar mora sadržavati dvije nekretnine",
		);
	});

	it("administrator dodjeljuje verifikatorsku ulogu drugom korisniku", async function () {
		const [, newVerifier] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		const hasRoleBefore = await propertyRegistry.read.hasRole([
			verifierRole,
			newVerifier.account.address,
		]);

		console.log("\n--- DODJELA VERIFIKATORSKE ULOGE ---");
		console.log("Adresa novog verifikatora:", newVerifier.account.address);
		console.log("Ima ulogu prije dodjele:", hasRoleBefore);

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole([
			verifierRole,
			newVerifier.account.address,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		const hasRoleAfter = await propertyRegistry.read.hasRole([
			verifierRole,
			newVerifier.account.address,
		]);

		console.log("Ima ulogu nakon dodjele:", hasRoleAfter);
		console.log("------------------------------------\n");

		assert.equal(
			hasRoleBefore,
			false,
			"Korisnik prije dodjele ne smije imati verifikatorsku ulogu",
		);

		assert.equal(
			hasRoleAfter,
			true,
			"Korisnik nakon dodjele mora imati verifikatorsku ulogu",
		);
	});

	it("prenosi digitalno vlasništvo potvrđene nekretnine na novog vlasnika", async function () {
		const [, buyer] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("dokumentacija nekretnine za prijenos vlasništva"),
		);

		// 1. Registracija nekretnine
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Osijek",
				"3000/3",
				"Županijska ulica 15, Osijek",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Potvrda nekretnine
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty([
			1n,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const propertyBeforeTransfer = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- PRIJENOS DIGITALNOG VLASNIŠTVA ---");
		console.log("Prethodni vlasnik:", propertyBeforeTransfer.digitalOwner);
		console.log("Novi vlasnik:", buyer.account.address);

		// 3. Prijenos vlasništva
		const transferTransactionHash =
			await propertyRegistry.write.transferPropertyOwnership([
				1n,
				buyer.account.address,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: transferTransactionHash,
		});

		const propertyAfterTransfer = await propertyRegistry.read.getProperty([1n]);

		console.log("Vlasnik nakon prijenosa:", propertyAfterTransfer.digitalOwner);
		console.log("Status nekretnine:", propertyAfterTransfer.verificationStatus);
		console.log("---------------------------------------\n");

		assert.notEqual(
			propertyBeforeTransfer.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac prije prijenosa ne smije biti vlasnik",
		);

		assert.equal(
			propertyAfterTransfer.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac nakon prijenosa mora biti novi digitalni vlasnik",
		);

		assert.equal(
			propertyAfterTransfer.verificationStatus,
			1,
			"Nekretnina nakon prijenosa mora ostati potvrđena",
		);
	});

	it("ne dopušta prijenos vlasništva nepotvrđene nekretnine", async function () {
		const [, buyer] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("dokumentacija nepotvrđene nekretnine"),
		);

		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Vinkovci",
				"4000/4",
				"Glagoljaška ulica 12, Vinkovci",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- PRIJENOS NEPOTVRĐENE NEKRETNINE ---");
		console.log(
			"Status nekretnine prije pokušaja:",
			propertyBeforeAttempt.verificationStatus,
		);

		await assert.rejects(async () => {
			await propertyRegistry.write.transferPropertyOwnership([
				1n,
				buyer.account.address,
			]);
		});

		const propertyAfterAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("Pokušaj prijenosa: odbijen");
		console.log("Vlasnik nakon pokušaja:", propertyAfterAttempt.digitalOwner);
		console.log("----------------------------------------\n");

		assert.equal(
			propertyAfterAttempt.verificationStatus,
			0,
			"Nekretnina mora ostati u statusu Pending",
		);

		assert.notEqual(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac ne smije postati vlasnik nepotvrđene nekretnine",
		);
	});

	it("ne dopušta korisniku bez transfer uloge prijenos vlasništva", async function () {
		const [, unauthorizedUser, buyer] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const documentHash = keccak256(
			toBytes("dokumentacija za test neovlastenog prijenosa"),
		);

		// Registracija nekretnine
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty([
				"Osijek",
				"5000/5",
				"Reisnerova ulica 25, Osijek",
				documentHash,
			]);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// Potvrda nekretnine
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty([
			1n,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- NEOVLAŠTENI PRIJENOS VLASNIŠTVA ---");
		console.log("Trenutni vlasnik:", propertyBeforeAttempt.digitalOwner);
		console.log("Neovlašteni korisnik:", unauthorizedUser.account.address);
		console.log("Pokušaj prijenosa na:", buyer.account.address);

		await assert.rejects(async () => {
			await propertyRegistry.write.transferPropertyOwnership(
				[1n, buyer.account.address],
				{
					account: unauthorizedUser.account,
				},
			);
		});

		const propertyAfterAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("Pokušaj neovlaštenog prijenosa: odbijen");
		console.log("Vlasnik nakon pokušaja:", propertyAfterAttempt.digitalOwner);
		console.log("------------------------------------------\n");

		assert.equal(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			propertyBeforeAttempt.digitalOwner.toLowerCase(),
			"Digitalni vlasnik ne smije se promijeniti",
		);

		assert.notEqual(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac ne smije postati vlasnik nakon neovlaštenog prijenosa",
		);
	});
});
