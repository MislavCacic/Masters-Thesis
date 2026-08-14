import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, toBytes } from "viem";

const { viem } = await hre.network.create();

describe("PropertyRegistry", function () {
	it("postavlja ugovor i dodjeljuje samo administratorsku ulogu deployeru", async function () {
		const [administrator] = await viem.getWalletClients();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const administratorAddress = administrator.account.address;

		const [adminRole, verifierRole, transferRole] = await Promise.all([
			propertyRegistry.read.DEFAULT_ADMIN_ROLE(),
			propertyRegistry.read.VERIFIER_ROLE(),
			propertyRegistry.read.TRANSFER_ROLE(),
		]);

		const [hasAdminRole, hasVerifierRole, hasTransferRole] = await Promise.all([
			propertyRegistry.read.hasRole([adminRole, administratorAddress]),

			propertyRegistry.read.hasRole([verifierRole, administratorAddress]),

			propertyRegistry.read.hasRole([transferRole, administratorAddress]),
		]);

		console.log("\n--- PROPERTY REGISTRY TEST ---");
		console.log("Adresa ugovora:", propertyRegistry.address);
		console.log("Adresa administratora:", administratorAddress);
		console.log("Ima administratorsku ulogu:", hasAdminRole);
		console.log("Ima verifikatorsku ulogu:", hasVerifierRole);
		console.log("Ima ulogu prijenosa vlasništva:", hasTransferRole);
		console.log("------------------------------\n");

		assert.equal(
			hasAdminRole,
			true,
			"Deployer mora imati administratorsku ulogu",
		);

		assert.equal(
			hasVerifierRole,
			false,
			"Deployer ne smije automatski imati verifikatorsku ulogu",
		);

		assert.equal(
			hasTransferRole,
			false,
			"Deployer ne smije automatski imati ulogu prijenosa vlasništva",
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
		const [administrator, seller, , verifier] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		// Administrator posebnom računu dodjeljuje VERIFIER_ROLE.
		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole(
			[verifierRole, verifier.account.address],
			{
				account: administrator.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		const documentHash = keccak256(
			toBytes("dokumentacija za provjeru nekretnine"),
		);

		// Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				[
					"Vinkovci",
					"5678/2",
					"Ulica bana Jelačića 10, Vinkovci",
					documentHash,
				],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeVerification = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- PROVJERA NEKRETNINE ---");
		console.log("Administrator:", administrator.account.address);
		console.log("Prodavatelj:", seller.account.address);
		console.log("Verifikator:", verifier.account.address);
		console.log(
			"Status prije potvrde:",
			propertyBeforeVerification.verificationStatus,
		);

		// Nekretninu potvrđuje zaseban verifikator, ne administrator.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: verifier.account,
			},
		);

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

		assert.equal(
			propertyAfterVerification.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati digitalni vlasnik nakon verifikacije",
		);
	});

	it("verifikator odbija registriranu nekretninu", async function () {
		const [administrator, seller, , verifier] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		// Administrator posebnom računu dodjeljuje VERIFIER_ROLE.
		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole(
			[verifierRole, verifier.account.address],
			{
				account: administrator.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		const documentHash = keccak256(
			toBytes("neispravna dokumentacija nekretnine"),
		);

		// Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Đakovo", "9876/3", "Ulica kralja Tomislava 20, Đakovo", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeRejection = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- ODBIJANJE NEKRETNINE ---");
		console.log("Administrator:", administrator.account.address);
		console.log("Prodavatelj:", seller.account.address);
		console.log("Verifikator:", verifier.account.address);
		console.log(
			"Status prije odbijanja:",
			propertyBeforeRejection.verificationStatus,
		);

		// Nekretninu odbija zaseban verifikator.
		const rejectTransactionHash = await propertyRegistry.write.rejectProperty(
			[1n],
			{
				account: verifier.account,
			},
		);

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

		assert.equal(
			propertyAfterRejection.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati digitalni vlasnik i nakon odbijanja",
		);
	});

	it("ne dopušta administratoru bez verifikatorske uloge potvrdu nekretnine", async function () {
		const [administrator, seller] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		const administratorHasVerifierRole = await propertyRegistry.read.hasRole([
			verifierRole,
			administrator.account.address,
		]);

		assert.equal(
			administratorHasVerifierRole,
			false,
			"Administrator ne smije automatski imati VERIFIER_ROLE",
		);

		const documentHash = keccak256(
			toBytes("dokumentacija za test neovlaštene administratorske potvrde"),
		);

		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "2222/4", "Kapucinska ulica 10, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- NEOVLAŠTENA POTVRDA ADMINISTRATORA ---");
		console.log("Administrator:", administrator.account.address);
		console.log("Ima VERIFIER_ROLE:", administratorHasVerifierRole);
		console.log(
			"Status prije pokušaja:",
			propertyBeforeAttempt.verificationStatus,
		);

		await assert.rejects(async () => {
			await propertyRegistry.write.verifyProperty([1n], {
				account: administrator.account,
			});
		});

		const propertyAfterAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log(
			"Status nakon neuspjelog pokušaja:",
			propertyAfterAttempt.verificationStatus,
		);
		console.log("------------------------------------------\n");

		assert.equal(
			propertyAfterAttempt.verificationStatus,
			0,
			"Status nakon neovlaštenog pokušaja mora ostati Pending",
		);

		assert.equal(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati digitalni vlasnik",
		);
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

	it("administrator dodjeljuje verifikatorsku ulogu posebnom računu", async function () {
		const [administrator, , , verifier] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const [adminRole, verifierRole] = await Promise.all([
			propertyRegistry.read.DEFAULT_ADMIN_ROLE(),
			propertyRegistry.read.VERIFIER_ROLE(),
		]);

		const [administratorHasAdminRole, verifierHasRoleBefore] =
			await Promise.all([
				propertyRegistry.read.hasRole([
					adminRole,
					administrator.account.address,
				]),

				propertyRegistry.read.hasRole([verifierRole, verifier.account.address]),
			]);

		console.log("\n--- DODJELA VERIFIKATORSKE ULOGE ---");
		console.log("Administrator:", administrator.account.address);
		console.log("Novi verifikator:", verifier.account.address);
		console.log(
			"Administrator ima administratorsku ulogu:",
			administratorHasAdminRole,
		);
		console.log("Verifikator ima ulogu prije dodjele:", verifierHasRoleBefore);

		assert.equal(
			administratorHasAdminRole,
			true,
			"Račun koji dodjeljuje ulogu mora biti administrator",
		);

		assert.equal(
			verifierHasRoleBefore,
			false,
			"Verifikator prije dodjele ne smije imati VERIFIER_ROLE",
		);

		const grantRoleTransactionHash = await propertyRegistry.write.grantRole(
			[verifierRole, verifier.account.address],
			{
				account: administrator.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: grantRoleTransactionHash,
		});

		const verifierHasRoleAfter = await propertyRegistry.read.hasRole([
			verifierRole,
			verifier.account.address,
		]);

		console.log("Verifikator ima ulogu nakon dodjele:", verifierHasRoleAfter);
		console.log("------------------------------------\n");

		assert.equal(
			verifierHasRoleAfter,
			true,
			"Verifikator nakon dodjele mora imati VERIFIER_ROLE",
		);
	});

	it("račun s transfer ulogom prenosi digitalno vlasništvo potvrđene nekretnine", async function () {
		const [administrator, seller, buyer, verifier, transferAuthority] =
			await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const [verifierRole, transferRole] = await Promise.all([
			propertyRegistry.read.VERIFIER_ROLE(),
			propertyRegistry.read.TRANSFER_ROLE(),
		]);

		// Administrator dodjeljuje ulogu zasebnom verifikatoru.
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

		// U unit testu poseban račun simulira escrow ugovor.
		const grantTransferRoleTransactionHash =
			await propertyRegistry.write.grantRole(
				[transferRole, transferAuthority.account.address],
				{
					account: administrator.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: grantTransferRoleTransactionHash,
		});

		const documentHash = keccak256(
			toBytes("dokumentacija nekretnine za prijenos vlasništva"),
		);

		// 1. Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "3000/3", "Županijska ulica 15, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// 2. Zasebni verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: verifier.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const propertyBeforeTransfer = await propertyRegistry.read.getProperty([
			1n,
		]);

		console.log("\n--- PRIJENOS DIGITALNOG VLASNIŠTVA ---");
		console.log("Administrator:", administrator.account.address);
		console.log("Verifikator:", verifier.account.address);
		console.log("Transfer autoritet:", transferAuthority.account.address);
		console.log("Prethodni vlasnik:", propertyBeforeTransfer.digitalOwner);
		console.log("Novi vlasnik:", buyer.account.address);

		// 3. Prijenos izvršava samo račun s TRANSFER_ROLE.
		const transferTransactionHash =
			await propertyRegistry.write.transferPropertyOwnership(
				[1n, buyer.account.address],
				{
					account: transferAuthority.account,
				},
			);

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
			propertyBeforeTransfer.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora biti vlasnik prije prijenosa",
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

	it("ne dopušta računu s transfer ulogom prijenos nepotvrđene nekretnine", async function () {
		const [administrator, seller, buyer, , transferAuthority] =
			await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

		// U ovom unit testu poseban račun simulira escrow ugovor.
		const grantTransferRoleTransactionHash =
			await propertyRegistry.write.grantRole(
				[transferRole, transferAuthority.account.address],
				{
					account: administrator.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: grantTransferRoleTransactionHash,
		});

		const transferAuthorityHasRole = await propertyRegistry.read.hasRole([
			transferRole,
			transferAuthority.account.address,
		]);

		assert.equal(
			transferAuthorityHasRole,
			true,
			"Transfer autoritet mora imati TRANSFER_ROLE",
		);

		const documentHash = keccak256(
			toBytes("dokumentacija nepotvrđene nekretnine"),
		);

		// Prodavatelj registrira nekretninu, ali je verifikator ne potvrđuje.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Vinkovci", "4000/4", "Glagoljaška ulica 12, Vinkovci", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- PRIJENOS NEPOTVRĐENE NEKRETNINE ---");
		console.log("Prodavatelj:", seller.account.address);
		console.log("Transfer autoritet:", transferAuthority.account.address);
		console.log(
			"Status prije pokušaja:",
			propertyBeforeAttempt.verificationStatus,
		);
		console.log("Pokušaj prijenosa na:", buyer.account.address);

		// Pozivatelj ima TRANSFER_ROLE, ali nekretnina nije Verified.
		await assert.rejects(async () => {
			await propertyRegistry.write.transferPropertyOwnership(
				[1n, buyer.account.address],
				{
					account: transferAuthority.account,
				},
			);
		});

		const propertyAfterAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("Pokušaj prijenosa: odbijen");
		console.log(
			"Status nakon pokušaja:",
			propertyAfterAttempt.verificationStatus,
		);
		console.log("Vlasnik nakon pokušaja:", propertyAfterAttempt.digitalOwner);
		console.log("----------------------------------------\n");

		assert.equal(
			propertyAfterAttempt.verificationStatus,
			0,
			"Nekretnina mora ostati u statusu Pending",
		);

		assert.equal(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati digitalni vlasnik",
		);

		assert.notEqual(
			propertyAfterAttempt.digitalOwner.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac ne smije postati vlasnik nepotvrđene nekretnine",
		);
	});

	it("ne dopušta korisniku bez transfer uloge prijenos potvrđene nekretnine", async function () {
		const [administrator, seller, buyer, verifier, unauthorizedUser] =
			await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		const [verifierRole, transferRole] = await Promise.all([
			propertyRegistry.read.VERIFIER_ROLE(),
			propertyRegistry.read.TRANSFER_ROLE(),
		]);

		// Administrator dodjeljuje VERIFIER_ROLE posebnom verifikatoru.
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

		const unauthorizedUserHasTransferRole = await propertyRegistry.read.hasRole(
			[transferRole, unauthorizedUser.account.address],
		);

		assert.equal(
			unauthorizedUserHasTransferRole,
			false,
			"Neovlašteni korisnik ne smije imati TRANSFER_ROLE",
		);

		const documentHash = keccak256(
			toBytes("dokumentacija za test neovlaštenog prijenosa"),
		);

		// Prodavatelj registrira nekretninu.
		const registerTransactionHash =
			await propertyRegistry.write.registerProperty(
				["Osijek", "5000/5", "Reisnerova ulica 25, Osijek", documentHash],
				{
					account: seller.account,
				},
			);

		await publicClient.waitForTransactionReceipt({
			hash: registerTransactionHash,
		});

		// Zasebni verifikator potvrđuje nekretninu.
		const verifyTransactionHash = await propertyRegistry.write.verifyProperty(
			[1n],
			{
				account: verifier.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: verifyTransactionHash,
		});

		const propertyBeforeAttempt = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- NEOVLAŠTENI PRIJENOS VLASNIŠTVA ---");
		console.log("Prodavatelj:", seller.account.address);
		console.log("Verifikator:", verifier.account.address);
		console.log("Neovlašteni korisnik:", unauthorizedUser.account.address);
		console.log("Ima TRANSFER_ROLE:", unauthorizedUserHasTransferRole);
		console.log("Status nekretnine:", propertyBeforeAttempt.verificationStatus);
		console.log("Pokušaj prijenosa na:", buyer.account.address);

		assert.equal(
			propertyBeforeAttempt.verificationStatus,
			1,
			"Nekretnina prije pokušaja mora biti potvrđena",
		);

		// Nekretnina je Verified, ali pozivatelj nema TRANSFER_ROLE.
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
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati digitalni vlasnik",
		);

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
