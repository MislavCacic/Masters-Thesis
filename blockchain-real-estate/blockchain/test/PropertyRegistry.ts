import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, toBytes, zeroHash } from "viem";

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

/*
 * U testovima se koristi simulirani IPFS URI.
 *
 * Stvarni sadržaj dokumenta nije potreban za testiranje pametnog ugovora.
 * Bitno je provjeriti da se URI dokumenta ispravno sprema i vraća
 * iz blockchain stanja.
 */
function createDocumentURI(content: string) {
	const documentHash = createDocumentHash(content);

	return `ipfs://test/${documentHash.slice(2)}`;
}

describe("PropertyRegistry", function () {
	async function createTestContext() {
		const [
			administrator,
			seller,
			buyer,
			verifier,
			transferAuthority,
			unauthorizedUser,
		] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const propertyRegistry = await viem.deployContract("PropertyRegistry");

		async function grantVerifierRole() {
			const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

			const transactionHash = await propertyRegistry.write.grantRole(
				[verifierRole, verifier.account.address],
				{
					account: administrator.account,
				},
			);

			await publicClient.waitForTransactionReceipt({
				hash: transactionHash,
			});
		}

		async function grantTransferRole() {
			const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

			const transactionHash = await propertyRegistry.write.grantRole(
				[transferRole, transferAuthority.account.address],
				{
					account: administrator.account,
				},
			);

			await publicClient.waitForTransactionReceipt({
				hash: transactionHash,
			});
		}

		async function registerProperty(
			cadastralMunicipality = "Osijek",
			parcelNumber = "1234/5",
			propertyAddress = "Europska avenija 1, Osijek",
		) {
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

		async function submitDocument(
			propertyId: bigint,
			documentType: 0 | 1 | 2,
			content: string,
		) {
			const documentHash = createDocumentHash(content);
			const documentURI = createDocumentURI(content);

			const transactionHash =
				await propertyRegistry.write.submitPropertyDocument(
					[propertyId, documentType, documentHash, documentURI],
					{
						account: seller.account,
					},
				);

			await publicClient.waitForTransactionReceipt({
				hash: transactionHash,
			});

			return documentHash;
		}

		async function submitAllRequiredDocuments(propertyId: bigint) {
			const landRegistryHash = await submitDocument(
				propertyId,
				DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
				"zemljisnoknjizni izvadak",
			);

			const cadastralHash = await submitDocument(
				propertyId,
				DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
				"katastarski dokument",
			);

			const ownershipHash = await submitDocument(
				propertyId,
				DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
				"dokaz vlasnistva",
			);

			return {
				landRegistryHash,
				cadastralHash,
				ownershipHash,
			};
		}

		async function verifyDocument(propertyId: bigint, documentType: 0 | 1 | 2) {
			const transactionHash =
				await propertyRegistry.write.verifyPropertyDocument(
					[propertyId, documentType],
					{
						account: verifier.account,
					},
				);

			await publicClient.waitForTransactionReceipt({
				hash: transactionHash,
			});
		}

		async function verifyAllRequiredDocuments(propertyId: bigint) {
			for (const documentType of REQUIRED_DOCUMENT_TYPES) {
				await verifyDocument(propertyId, documentType);
			}
		}

		return {
			administrator,
			seller,
			buyer,
			verifier,
			transferAuthority,
			unauthorizedUser,
			publicClient,
			propertyRegistry,
			grantVerifierRole,
			grantTransferRole,
			registerProperty,
			submitDocument,
			submitAllRequiredDocuments,
			verifyDocument,
			verifyAllRequiredDocuments,
		};
	}

	it("postavlja ugovor i dodjeljuje samo administratorsku ulogu deployeru", async function () {
		const { administrator, propertyRegistry } = await createTestContext();

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

		console.log("\n--- PROPERTY REGISTRY ULOGE ---");
		console.log("Administrator:", administratorAddress);
		console.log("DEFAULT_ADMIN_ROLE:", hasAdminRole);
		console.log("VERIFIER_ROLE:", hasVerifierRole);
		console.log("TRANSFER_ROLE:", hasTransferRole);
		console.log("--------------------------------\n");

		assert.equal(
			hasAdminRole,
			true,
			"Deployer mora imati administratorsku ulogu",
		);

		assert.equal(
			hasVerifierRole,
			false,
			"Administrator ne smije automatski imati VERIFIER_ROLE",
		);

		assert.equal(
			hasTransferRole,
			false,
			"Administrator ne smije automatski imati TRANSFER_ROLE",
		);
	});

	it("definira tri obvezne vrste dokumenata", async function () {
		const { propertyRegistry } = await createTestContext();

		const requiredDocumentCount =
			await propertyRegistry.read.REQUIRED_DOCUMENT_COUNT();

		console.log("\n--- OBVEZNI DOKUMENTI ---");
		console.log("Broj obveznih dokumenata:", requiredDocumentCount);
		console.log("-------------------------\n");

		assert.equal(
			requiredDocumentCount,
			3,
			"Sustav mora zahtijevati tri obvezna dokumenta",
		);
	});

	it("registrira nekretninu bez automatske potvrde dokumentacije", async function () {
		const { seller, propertyRegistry, registerProperty } =
			await createTestContext();

		await registerProperty("Osijek", "1234/5", "Europska avenija 1, Osijek");

		const property = await propertyRegistry.read.getProperty([1n]);

		const hasAllDocuments = await propertyRegistry.read.hasAllRequiredDocuments(
			[1n],
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		console.log("\n--- REGISTRIRANA NEKRETNINA ---");
		console.log("ID:", property.id.toString());
		console.log("Katastarska općina:", property.cadastralMunicipality);
		console.log("Broj čestice:", property.parcelNumber);
		console.log("Adresa:", property.propertyAddress);
		console.log("Digitalni vlasnik:", property.digitalOwner);
		console.log("Status dokumentacije:", property.verificationStatus);
		console.log("Svi dokumenti predani:", hasAllDocuments);
		console.log("Svi dokumenti valjani:", hasValidDocuments);
		console.log("--------------------------------\n");

		assert.equal(property.id, 1n);
		assert.equal(property.cadastralMunicipality, "Osijek");
		assert.equal(property.parcelNumber, "1234/5");

		assert.equal(property.propertyAddress, "Europska avenija 1, Osijek");

		assert.equal(
			property.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
		);

		assert.equal(
			property.verificationStatus,
			0,
			"Početni status mora biti Pending",
		);

		assert.equal(property.exists, true);

		assert.equal(
			hasAllDocuments,
			false,
			"Odmah nakon registracije dokumentacija još nije potpuna",
		);

		assert.equal(
			hasValidDocuments,
			false,
			"Odmah nakon registracije dokumentacija još nije valjana",
		);
	});

	it("vlasnik predaje sva tri obvezna dokumenta s hashom i URI adresom", async function () {
		const { propertyRegistry, registerProperty, submitAllRequiredDocuments } =
			await createTestContext();

		await registerProperty();

		const { landRegistryHash, cadastralHash, ownershipHash } =
			await submitAllRequiredDocuments(1n);

		const landRegistryDocument =
			await propertyRegistry.read.getPropertyDocument([
				1n,
				DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
			]);

		const cadastralDocument = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
		]);

		const ownershipDocument = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
		]);

		const hasAllDocuments = await propertyRegistry.read.hasAllRequiredDocuments(
			[1n],
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		console.log("\n--- PREDAJA DOKUMENTACIJE ---");
		console.log("Svi dokumenti predani:", hasAllDocuments);
		console.log("Svi dokumenti potvrđeni:", hasValidDocuments);
		console.log(
			"URI zemljišnoknjižnog izvatka:",
			landRegistryDocument.documentURI,
		);
		console.log("URI katastarskog dokumenta:", cadastralDocument.documentURI);
		console.log("URI dokaza vlasništva:", ownershipDocument.documentURI);
		console.log("-----------------------------\n");

		assert.equal(landRegistryDocument.documentHash, landRegistryHash);

		assert.equal(cadastralDocument.documentHash, cadastralHash);

		assert.equal(ownershipDocument.documentHash, ownershipHash);

		assert.equal(
			landRegistryDocument.documentURI,
			createDocumentURI("zemljisnoknjizni izvadak"),
			"URI zemljišnoknjižnog izvatka mora biti spremljen",
		);

		assert.equal(
			cadastralDocument.documentURI,
			createDocumentURI("katastarski dokument"),
			"URI katastarskog dokumenta mora biti spremljen",
		);

		assert.equal(
			ownershipDocument.documentURI,
			createDocumentURI("dokaz vlasnistva"),
			"URI dokaza vlasništva mora biti spremljen",
		);

		assert.equal(landRegistryDocument.submitted, true);

		assert.equal(cadastralDocument.submitted, true);

		assert.equal(ownershipDocument.submitted, true);

		assert.equal(
			landRegistryDocument.verificationStatus,
			0,
			"Predani dokument mora početi u statusu Pending",
		);

		assert.equal(cadastralDocument.verificationStatus, 0);

		assert.equal(ownershipDocument.verificationStatus, 0);

		assert.equal(
			hasAllDocuments,
			true,
			"Sustav mora prepoznati da su sva tri dokumenta predana",
		);

		assert.equal(
			hasValidDocuments,
			false,
			"Predani dokumenti još nisu potvrđeni",
		);
	});

	it("ne dopušta korisniku koji nije vlasnik predaju dokumenta", async function () {
		const { unauthorizedUser, propertyRegistry, registerProperty } =
			await createTestContext();

		await registerProperty();

		const documentContent = "neovlasteni dokument";
		const documentHash = createDocumentHash(documentContent);
		const documentURI = createDocumentURI(documentContent);

		await assert.rejects(async () => {
			await propertyRegistry.write.submitPropertyDocument(
				[1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT, documentHash, documentURI],
				{
					account: unauthorizedUser.account,
				},
			);
		});

		const document = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		]);

		assert.equal(
			document.submitted,
			false,
			"Dokument neovlaštenog korisnika ne smije biti spremljen",
		);

		assert.equal(
			document.documentURI,
			"",
			"URI neovlaštenog dokumenta ne smije biti spremljen",
		);
	});

	it("ne dopušta predaju dokumenta s praznim hashom", async function () {
		const { seller, propertyRegistry, registerProperty } =
			await createTestContext();

		await registerProperty();

		await assert.rejects(async () => {
			await propertyRegistry.write.submitPropertyDocument(
				[
					1n,
					DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
					zeroHash,
					"ipfs://test/valid-uri",
				],
				{
					account: seller.account,
				},
			);
		});

		const document = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		]);

		assert.equal(document.submitted, false);
		assert.equal(document.documentURI, "");
	});

	it("ne dopušta predaju dokumenta s praznim URI-jem", async function () {
		const { seller, propertyRegistry, registerProperty } =
			await createTestContext();

		await registerProperty();

		const documentHash = createDocumentHash("dokument bez URI adrese");

		await assert.rejects(async () => {
			await propertyRegistry.write.submitPropertyDocument(
				[1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT, documentHash, ""],
				{
					account: seller.account,
				},
			);
		});

		const document = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		]);

		assert.equal(
			document.submitted,
			false,
			"Dokument bez URI-ja ne smije biti spremljen",
		);

		assert.equal(
			document.documentHash,
			zeroHash,
			"Hash dokumenta ne smije biti spremljen ako URI nedostaje",
		);

		assert.equal(
			document.documentURI,
			"",
			"URI mora ostati prazan nakon neuspjele transakcije",
		);
	});

	it("ne dopušta potvrdu dokumenta koji nije predan", async function () {
		const { verifier, propertyRegistry, grantVerifierRole, registerProperty } =
			await createTestContext();

		await grantVerifierRole();
		await registerProperty();

		await assert.rejects(async () => {
			await propertyRegistry.write.verifyPropertyDocument(
				[1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT],
				{
					account: verifier.account,
				},
			);
		});

		const property = await propertyRegistry.read.getProperty([1n]);

		assert.equal(property.verificationStatus, 0, "Status mora ostati Pending");
	});

	it("djelomično potvrđena dokumentacija ne omogućuje prodaju", async function () {
		const {
			propertyRegistry,
			grantVerifierRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyDocument,
		} = await createTestContext();

		await grantVerifierRole();
		await registerProperty();
		await submitAllRequiredDocuments(1n);

		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		await verifyDocument(1n, DOCUMENT_TYPE.CADASTRAL_DOCUMENT);

		const property = await propertyRegistry.read.getProperty([1n]);

		const hasAllDocuments = await propertyRegistry.read.hasAllRequiredDocuments(
			[1n],
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		const isPropertyVerified = await propertyRegistry.read.isPropertyVerified([
			1n,
		]);

		console.log("\n--- DJELOMIČNA VERIFIKACIJA ---");
		console.log("Predano:", "3/3");
		console.log("Potvrđeno:", "2/3");
		console.log("Ukupni status:", property.verificationStatus);
		console.log("Spremna za prodaju:", isPropertyVerified);
		console.log("--------------------------------\n");

		assert.equal(hasAllDocuments, true);

		assert.equal(
			hasValidDocuments,
			false,
			"Dva od tri dokumenta nisu dovoljna",
		);

		assert.equal(
			isPropertyVerified,
			false,
			"Nekretnina ne smije biti spremna za prodaju",
		);

		assert.equal(
			property.verificationStatus,
			0,
			"Status mora ostati Pending dok nisu potvrđena sva tri dokumenta",
		);
	});

	it("sva tri potvrđena dokumenta automatski potvrđuju nekretninu", async function () {
		const {
			seller,
			propertyRegistry,
			grantVerifierRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyAllRequiredDocuments,
		} = await createTestContext();

		await grantVerifierRole();
		await registerProperty();
		await submitAllRequiredDocuments(1n);

		await verifyAllRequiredDocuments(1n);

		const property = await propertyRegistry.read.getProperty([1n]);

		const hasAllDocuments = await propertyRegistry.read.hasAllRequiredDocuments(
			[1n],
		);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		const isPropertyVerified = await propertyRegistry.read.isPropertyVerified([
			1n,
		]);

		console.log("\n--- POTPUNA DOKUMENTACIJA ---");
		console.log("Svi dokumenti predani:", hasAllDocuments);
		console.log("Svi dokumenti potvrđeni:", hasValidDocuments);
		console.log("Status nekretnine:", property.verificationStatus);
		console.log("Spremna za prodaju:", isPropertyVerified);
		console.log("-----------------------------\n");

		assert.equal(hasAllDocuments, true);
		assert.equal(hasValidDocuments, true);
		assert.equal(isPropertyVerified, true);

		assert.equal(
			property.verificationStatus,
			1,
			"Nekretnina mora automatski prijeći u Verified",
		);

		assert.equal(
			property.digitalOwner.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Verifikacija ne smije promijeniti vlasnika",
		);
	});

	it("odbijeni dokument automatski označava dokumentaciju nekretnine odbijenom", async function () {
		const {
			verifier,
			propertyRegistry,
			publicClient,
			grantVerifierRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyDocument,
		} = await createTestContext();

		await grantVerifierRole();
		await registerProperty();
		await submitAllRequiredDocuments(1n);

		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		await verifyDocument(1n, DOCUMENT_TYPE.CADASTRAL_DOCUMENT);

		const rejectHash = await propertyRegistry.write.rejectPropertyDocument(
			[1n, DOCUMENT_TYPE.OWNERSHIP_DOCUMENT],
			{
				account: verifier.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: rejectHash,
		});

		const rejectedDocument = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
		]);

		const property = await propertyRegistry.read.getProperty([1n]);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		console.log("\n--- ODBIJENI DOKUMENT ---");
		console.log("Status dokumenta:", rejectedDocument.verificationStatus);
		console.log("URI dokumenta:", rejectedDocument.documentURI);
		console.log("Status nekretnine:", property.verificationStatus);
		console.log("Dokumentacija valjana:", hasValidDocuments);
		console.log("--------------------------\n");

		assert.equal(
			rejectedDocument.verificationStatus,
			2,
			"Dokument mora biti Rejected",
		);

		assert.equal(
			rejectedDocument.documentURI,
			createDocumentURI("dokaz vlasnistva"),
			"Odbijanje dokumenta ne smije ukloniti njegov URI",
		);

		assert.equal(
			property.verificationStatus,
			2,
			"Ukupna dokumentacija mora biti Rejected",
		);

		assert.equal(
			hasValidDocuments,
			false,
			"Nekretnina s odbijenim dokumentom ne smije biti spremna za prodaju",
		);
	});

	it("odbijeni dokument može se ponovno predati s novim hashom i URI-jem te zatim potvrditi", async function () {
		const {
			seller,
			verifier,
			propertyRegistry,
			publicClient,
			grantVerifierRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyDocument,
		} = await createTestContext();

		await grantVerifierRole();
		await registerProperty();
		await submitAllRequiredDocuments(1n);

		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		await verifyDocument(1n, DOCUMENT_TYPE.CADASTRAL_DOCUMENT);

		const rejectHash = await propertyRegistry.write.rejectPropertyDocument(
			[1n, DOCUMENT_TYPE.OWNERSHIP_DOCUMENT],
			{
				account: verifier.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: rejectHash,
		});

		let property = await propertyRegistry.read.getProperty([1n]);

		assert.equal(
			property.verificationStatus,
			2,
			"Nekretnina mora biti Rejected nakon odbijanja dokumenta",
		);

		const correctedDocumentContent = "ispravljeni dokaz vlasnistva";

		const correctedDocumentHash = createDocumentHash(correctedDocumentContent);

		const correctedDocumentURI = createDocumentURI(correctedDocumentContent);

		const resubmitHash = await propertyRegistry.write.submitPropertyDocument(
			[
				1n,
				DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
				correctedDocumentHash,
				correctedDocumentURI,
			],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: resubmitHash,
		});

		const correctedDocument = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
		]);

		property = await propertyRegistry.read.getProperty([1n]);

		assert.equal(correctedDocument.documentHash, correctedDocumentHash);

		assert.equal(
			correctedDocument.documentURI,
			correctedDocumentURI,
			"Ponovno predani dokument mora spremiti novi URI",
		);

		assert.equal(
			correctedDocument.verificationStatus,
			0,
			"Ponovno predani dokument mora biti Pending",
		);

		assert.equal(
			property.verificationStatus,
			0,
			"Ukupni status se nakon ponovne predaje mora vratiti na Pending",
		);

		await verifyDocument(1n, DOCUMENT_TYPE.OWNERSHIP_DOCUMENT);

		property = await propertyRegistry.read.getProperty([1n]);

		const hasValidDocuments = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		assert.equal(
			property.verificationStatus,
			1,
			"Nakon potvrde ispravljenog dokumenta nekretnina mora biti Verified",
		);

		assert.equal(
			hasValidDocuments,
			true,
			"Sva dokumentacija sada mora biti valjana",
		);
	});

	it("ne dopušta zamjenu već potvrđenog dokumenta", async function () {
		const {
			seller,
			propertyRegistry,
			grantVerifierRole,
			registerProperty,
			submitDocument,
			verifyDocument,
		} = await createTestContext();

		await grantVerifierRole();
		await registerProperty();

		const originalContent = "originalni zemljisnoknjizni izvadak";

		const originalHash = await submitDocument(
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
			originalContent,
		);

		const originalURI = createDocumentURI(originalContent);

		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		const replacementContent = "zamjenski zemljisnoknjizni izvadak";

		const replacementHash = createDocumentHash(replacementContent);

		const replacementURI = createDocumentURI(replacementContent);

		await assert.rejects(async () => {
			await propertyRegistry.write.submitPropertyDocument(
				[
					1n,
					DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
					replacementHash,
					replacementURI,
				],
				{
					account: seller.account,
				},
			);
		});

		const document = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		]);

		assert.equal(
			document.documentHash,
			originalHash,
			"Hash potvrđenog dokumenta ne smije se promijeniti",
		);

		assert.equal(
			document.documentURI,
			originalURI,
			"URI potvrđenog dokumenta ne smije se promijeniti",
		);

		assert.equal(
			document.verificationStatus,
			1,
			"Dokument mora ostati Verified",
		);
	});

	it("ne dopušta administratoru bez VERIFIER_ROLE potvrdu dokumenta", async function () {
		const {
			administrator,
			propertyRegistry,
			registerProperty,
			submitDocument,
		} = await createTestContext();

		await registerProperty();

		await submitDocument(
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
			"dokument za neovlastenu administratorsku potvrdu",
		);

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

		await assert.rejects(async () => {
			await propertyRegistry.write.verifyPropertyDocument(
				[1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT],
				{
					account: administrator.account,
				},
			);
		});

		const document = await propertyRegistry.read.getPropertyDocument([
			1n,
			DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		]);

		assert.equal(
			document.verificationStatus,
			0,
			"Dokument mora ostati Pending",
		);
	});

	it("ne dopušta dvostruku registraciju iste katastarske čestice", async function () {
		const { seller, propertyRegistry, registerProperty } =
			await createTestContext();

		await registerProperty("Osijek", "7000/7", "Prva adresa, Osijek");

		await assert.rejects(async () => {
			await propertyRegistry.write.registerProperty(
				["Osijek", "7000/7", "Druga adresa, Osijek"],
				{
					account: seller.account,
				},
			);
		});

		const propertyCount = await propertyRegistry.read.getPropertyCount();

		assert.equal(
			propertyCount,
			1n,
			"Ista čestica smije biti registrirana samo jednom",
		);
	});

	it("vraća točan broj registriranih nekretnina", async function () {
		const { seller, propertyRegistry, publicClient } =
			await createTestContext();

		const firstHash = await propertyRegistry.write.registerProperty(
			["Osijek", "1000/1", "Vukovarska cesta 10, Osijek"],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: firstHash,
		});

		const secondHash = await propertyRegistry.write.registerProperty(
			["Vinkovci", "2000/2", "Ulica bana Jelačića 20, Vinkovci"],
			{
				account: seller.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: secondHash,
		});

		const propertyCount = await propertyRegistry.read.getPropertyCount();

		assert.equal(
			propertyCount,
			2n,
			"Registar mora sadržavati dvije nekretnine",
		);
	});

	it("administrator dodjeljuje VERIFIER_ROLE posebnom računu", async function () {
		const { verifier, propertyRegistry, grantVerifierRole } =
			await createTestContext();

		const verifierRole = await propertyRegistry.read.VERIFIER_ROLE();

		const hasRoleBefore = await propertyRegistry.read.hasRole([
			verifierRole,
			verifier.account.address,
		]);

		assert.equal(hasRoleBefore, false);

		await grantVerifierRole();

		const hasRoleAfter = await propertyRegistry.read.hasRole([
			verifierRole,
			verifier.account.address,
		]);

		assert.equal(
			hasRoleAfter,
			true,
			"Verifikator nakon dodjele mora imati VERIFIER_ROLE",
		);
	});

	it("ne dopušta prijenos vlasništva ako dokumentacija nije potpuno potvrđena", async function () {
		const {
			seller,
			buyer,
			transferAuthority,
			propertyRegistry,
			grantVerifierRole,
			grantTransferRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyDocument,
		} = await createTestContext();

		await grantVerifierRole();
		await grantTransferRole();

		await registerProperty();
		await submitAllRequiredDocuments(1n);

		await verifyDocument(1n, DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT);

		await verifyDocument(1n, DOCUMENT_TYPE.CADASTRAL_DOCUMENT);

		const validBeforeAttempt = await propertyRegistry.read.hasValidDocuments([
			1n,
		]);

		assert.equal(
			validBeforeAttempt,
			false,
			"Dokumentacija s 2/3 potvrđena dokumenta nije potpuna",
		);

		await assert.rejects(async () => {
			await propertyRegistry.write.transferPropertyOwnership(
				[1n, buyer.account.address],
				{
					account: transferAuthority.account,
				},
			);
		});

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Prodavatelj mora ostati vlasnik",
		);
	});

	it("račun s TRANSFER_ROLE prenosi vlasništvo kada su sva tri dokumenta potvrđena", async function () {
		const {
			seller,
			buyer,
			transferAuthority,
			propertyRegistry,
			publicClient,
			grantVerifierRole,
			grantTransferRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyAllRequiredDocuments,
		} = await createTestContext();

		await grantVerifierRole();
		await grantTransferRole();

		await registerProperty();
		await submitAllRequiredDocuments(1n);
		await verifyAllRequiredDocuments(1n);

		const validDocuments = await propertyRegistry.read.hasValidDocuments([1n]);

		const ownerBefore = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(validDocuments, true);

		assert.equal(
			ownerBefore.toLowerCase(),
			seller.account.address.toLowerCase(),
		);

		const transferHash = await propertyRegistry.write.transferPropertyOwnership(
			[1n, buyer.account.address],
			{
				account: transferAuthority.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transferHash,
		});

		const ownerAfter = await propertyRegistry.read.getDigitalOwner([1n]);

		const propertyAfter = await propertyRegistry.read.getProperty([1n]);

		console.log("\n--- USPJEŠAN PRIJENOS VLASNIŠTVA ---");
		console.log("Prodavatelj:", seller.account.address);
		console.log("Kupac:", buyer.account.address);
		console.log("Vlasnik prije:", ownerBefore);
		console.log("Vlasnik nakon:", ownerAfter);
		console.log("Status dokumentacije:", propertyAfter.verificationStatus);
		console.log("-------------------------------------\n");

		assert.equal(
			ownerAfter.toLowerCase(),
			buyer.account.address.toLowerCase(),
			"Kupac mora postati novi digitalni vlasnik",
		);

		assert.equal(
			propertyAfter.verificationStatus,
			1,
			"Dokumentacija nakon prijenosa mora ostati Verified",
		);
	});

	it("ne dopušta korisniku bez TRANSFER_ROLE prijenos potvrđene nekretnine", async function () {
		const {
			seller,
			buyer,
			unauthorizedUser,
			propertyRegistry,
			grantVerifierRole,
			registerProperty,
			submitAllRequiredDocuments,
			verifyAllRequiredDocuments,
		} = await createTestContext();

		await grantVerifierRole();

		await registerProperty();
		await submitAllRequiredDocuments(1n);
		await verifyAllRequiredDocuments(1n);

		const transferRole = await propertyRegistry.read.TRANSFER_ROLE();

		const unauthorizedHasTransferRole = await propertyRegistry.read.hasRole([
			transferRole,
			unauthorizedUser.account.address,
		]);

		assert.equal(unauthorizedHasTransferRole, false);

		await assert.rejects(async () => {
			await propertyRegistry.write.transferPropertyOwnership(
				[1n, buyer.account.address],
				{
					account: unauthorizedUser.account,
				},
			);
		});

		const ownerAfterAttempt = await propertyRegistry.read.getDigitalOwner([1n]);

		assert.equal(
			ownerAfterAttempt.toLowerCase(),
			seller.account.address.toLowerCase(),
			"Neovlašteni korisnik ne smije promijeniti vlasnika",
		);
	});
});
