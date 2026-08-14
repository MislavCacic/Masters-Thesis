import { BrowserProvider, Contract, JsonRpcProvider, keccak256 } from "ethers";

import { useEffect, useState, type FormEvent } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { getPropertyStatusLabel } from "../../utils/statusLabels";

import "./RegisterPropertyForm.css";

interface RegisterPropertyFormProps {
	account: string;
}

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const DOCUMENT_TYPE = {
	LAND_REGISTRY_EXTRACT: 0,
	CADASTRAL_DOCUMENT: 1,
	OWNERSHIP_DOCUMENT: 2,
} as const;

type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

interface DocumentHashes {
	landRegistryExtract: string;
	cadastralDocument: string;
	ownershipDocument: string;
}

interface DocumentTransactionHashes {
	landRegistryExtract: string;
	cadastralDocument: string;
	ownershipDocument: string;
}

type DocumentTransactionKey = keyof DocumentTransactionHashes;

const EMPTY_DOCUMENT_HASHES: DocumentHashes = {
	landRegistryExtract: "",
	cadastralDocument: "",
	ownershipDocument: "",
};

const EMPTY_DOCUMENT_TRANSACTION_HASHES: DocumentTransactionHashes = {
	landRegistryExtract: "",
	cadastralDocument: "",
	ownershipDocument: "",
};

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getErrorMessage(error: unknown): string {
	if (typeof error === "object" && error !== null) {
		const contractError = error as {
			code?: unknown;
			reason?: unknown;
			shortMessage?: unknown;
			message?: unknown;
		};

		if (contractError.code === 4001) {
			return "Transakcija je odbijena u MetaMasku.";
		}

		if (typeof contractError.reason === "string") {
			return contractError.reason;
		}

		if (typeof contractError.shortMessage === "string") {
			return contractError.shortMessage;
		}

		if (typeof contractError.message === "string") {
			return contractError.message;
		}
	}

	return "Blockchain transakcija nije uspjela.";
}

async function calculateFileHash(file: File): Promise<string> {
	const fileBytes = new Uint8Array(await file.arrayBuffer());

	return keccak256(fileBytes);
}

async function createReadRegistry(): Promise<Contract> {
	const provider = new JsonRpcProvider(LOCAL_RPC_URL);

	const network = await provider.getNetwork();

	if (network.chainId !== HARDHAT_CHAIN_ID) {
		throw new Error(
			`Neočekivana blockchain mreža. Chain ID: ${network.chainId.toString()}.`,
		);
	}

	return new Contract(
		CONTRACT_ADDRESSES.propertyRegistry,
		propertyRegistryAbi,
		provider,
	);
}

export default function RegisterPropertyForm({
	account,
}: RegisterPropertyFormProps) {
	const [cadastralMunicipality, setCadastralMunicipality] = useState("");

	const [parcelNumber, setParcelNumber] = useState("");

	const [propertyAddress, setPropertyAddress] = useState("");

	const [landRegistryExtractFile, setLandRegistryExtractFile] =
		useState<File | null>(null);

	const [cadastralDocumentFile, setCadastralDocumentFile] =
		useState<File | null>(null);

	const [ownershipDocumentFile, setOwnershipDocumentFile] =
		useState<File | null>(null);

	const [isSubmitting, setIsSubmitting] = useState(false);

	const [statusMessage, setStatusMessage] = useState("");

	const [successMessage, setSuccessMessage] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	/*
	 * ID koji prikazujemo korisniku nakon
	 * registracije nekretnine.
	 */
	const [registeredPropertyId, setRegisteredPropertyId] = useState("");

	/*
	 * Ako registracija nekretnine uspije, ali jedna
	 * od predaja dokumenata ne uspije, ovaj ID
	 * pamtimo kako bi korisnik mogao nastaviti
	 * predaju bez ponovne registracije nekretnine.
	 */
	const [pendingPropertyId, setPendingPropertyId] = useState<bigint | null>(
		null,
	);

	const [registrationTransactionHash, setRegistrationTransactionHash] =
		useState("");

	const [documentHashes, setDocumentHashes] = useState<DocumentHashes>(
		EMPTY_DOCUMENT_HASHES,
	);

	const [documentTransactionHashes, setDocumentTransactionHashes] =
		useState<DocumentTransactionHashes>(EMPTY_DOCUMENT_TRANSACTION_HASHES);

	useEffect(() => {
		setCadastralMunicipality("");
		setParcelNumber("");
		setPropertyAddress("");

		setLandRegistryExtractFile(null);
		setCadastralDocumentFile(null);
		setOwnershipDocumentFile(null);

		setIsSubmitting(false);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");

		setRegisteredPropertyId("");
		setPendingPropertyId(null);

		setRegistrationTransactionHash("");

		setDocumentHashes(EMPTY_DOCUMENT_HASHES);

		setDocumentTransactionHashes(EMPTY_DOCUMENT_TRANSACTION_HASHES);
	}, [account]);

	async function submitDocumentIfNeeded(
		propertyRegistryWrite: Contract,
		propertyRegistryRead: Contract,
		propertyId: bigint,
		documentType: DocumentType,
		documentName: string,
		documentHash: string,
		step: string,
		transactionKey: DocumentTransactionKey,
	): Promise<void> {
		/*
		 * Prvo provjeravamo postoji li dokument već
		 * na blockchainu. Ovo omogućuje nastavak
		 * djelomično završene registracije.
		 */
		const existingDocument = await propertyRegistryRead.getPropertyDocument(
			propertyId,
			documentType,
		);

		const alreadySubmitted = existingDocument.submitted as boolean;

		if (alreadySubmitted) {
			const existingHash = existingDocument.documentHash as string;

			if (existingHash.toLowerCase() !== documentHash.toLowerCase()) {
				throw new Error(
					`${documentName} već je predan za ovu nekretninu, ali njegov blockchain hash ne odgovara trenutno odabranoj datoteci.`,
				);
			}

			return;
		}

		setStatusMessage(
			`${step} Potvrdi predaju dokumenta "${documentName}" u MetaMasku...`,
		);

		const transaction = await propertyRegistryWrite.submitPropertyDocument(
			propertyId,
			documentType,
			documentHash,
		);

		setDocumentTransactionHashes((previous) => ({
			...previous,
			[transactionKey]: transaction.hash,
		}));

		setStatusMessage(
			`${step} Dokument "${documentName}" je poslan. Čeka se potvrda blockchaina...`,
		);

		const receipt = await transaction.wait();

		if (!receipt) {
			throw new Error(
				`Potvrda transakcije za dokument "${documentName}" nije pronađena.`,
			);
		}

		if (receipt.status !== 1) {
			throw new Error(
				`Predaja dokumenta "${documentName}" nije uspješno izvršena.`,
			);
		}

		/*
		 * Nakon MetaMask WRITE operacije stvarno stanje
		 * ponovno čitamo direktno s Hardhat nodea.
		 */
		const submittedDocument = await propertyRegistryRead.getPropertyDocument(
			propertyId,
			documentType,
		);

		const submitted = submittedDocument.submitted as boolean;

		const storedHash = submittedDocument.documentHash as string;

		if (!submitted) {
			throw new Error(
				`Blockchain nije evidentirao dokument "${documentName}" kao predan.`,
			);
		}

		if (storedHash.toLowerCase() !== documentHash.toLowerCase()) {
			throw new Error(
				`Blockchain hash dokumenta "${documentName}" ne odgovara očekivanoj vrijednosti.`,
			);
		}
	}

	async function handleSubmit(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		setErrorMessage("");
		setSuccessMessage("");
		setStatusMessage("");

		/*
		 * Ako nastavljamo djelomično završenu registraciju,
		 * ne brišemo postojeće ID-eve i hashove transakcija.
		 */
		if (pendingPropertyId === null) {
			setRegisteredPropertyId("");

			setRegistrationTransactionHash("");

			setDocumentTransactionHashes(EMPTY_DOCUMENT_TRANSACTION_HASHES);
		}

		setDocumentHashes(EMPTY_DOCUMENT_HASHES);

		if (!window.ethereum) {
			setErrorMessage("MetaMask nije pronađen u pregledniku.");

			return;
		}

		if (
			!cadastralMunicipality.trim() ||
			!parcelNumber.trim() ||
			!propertyAddress.trim()
		) {
			setErrorMessage("Sva tekstualna polja moraju biti unesena.");

			return;
		}

		if (!landRegistryExtractFile) {
			setErrorMessage("Potrebno je odabrati zemljišnoknjižni izvadak.");

			return;
		}

		if (!cadastralDocumentFile) {
			setErrorMessage("Potrebno je odabrati katastarski dokument.");

			return;
		}

		if (!ownershipDocumentFile) {
			setErrorMessage("Potrebno je odabrati dokaz/osnovu vlasništva.");

			return;
		}

		setIsSubmitting(true);

		let createdPropertyId: bigint | null = pendingPropertyId;

		try {
			/* =============================================
			   1. IZRAČUN HASH VRIJEDNOSTI
			   ============================================= */

			setStatusMessage(
				"Izračunavaju se kriptografski hashovi dokumentacije...",
			);

			const [
				landRegistryExtractHash,
				cadastralDocumentHash,
				ownershipDocumentHash,
			] = await Promise.all([
				calculateFileHash(landRegistryExtractFile),

				calculateFileHash(cadastralDocumentFile),

				calculateFileHash(ownershipDocumentFile),
			]);

			setDocumentHashes({
				landRegistryExtract: landRegistryExtractHash,

				cadastralDocument: cadastralDocumentHash,

				ownershipDocument: ownershipDocumentHash,
			});

			/* =============================================
			   2. READ POVEZIVANJE NA HARDHAT
			   ============================================= */

			const propertyRegistryRead = await createReadRegistry();

			/* =============================================
			   3. METAMASK WRITE SIGNER
			   ============================================= */

			const browserProvider = new BrowserProvider(window.ethereum);

			const signer = await browserProvider.getSigner();

			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const propertyRegistryWrite = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				signer,
			);

			/* =============================================
			   4. REGISTRACIJA NEKRETNINE
			   ============================================= */

			if (createdPropertyId === null) {
				setStatusMessage("1/4 Potvrdi registraciju nekretnine u MetaMasku...");

				const registrationTransaction =
					await propertyRegistryWrite.registerProperty(
						cadastralMunicipality.trim(),
						parcelNumber.trim(),
						propertyAddress.trim(),
					);

				setRegistrationTransactionHash(registrationTransaction.hash);

				setStatusMessage(
					"1/4 Registracija je poslana. Čeka se potvrda blockchaina...",
				);

				const registrationReceipt = await registrationTransaction.wait();

				if (!registrationReceipt) {
					throw new Error("Potvrda registracije nekretnine nije pronađena.");
				}

				if (registrationReceipt.status !== 1) {
					throw new Error("Registracija nekretnine nije uspješno izvršena.");
				}

				/*
				 * Property ID očitavamo iz blockchain eventa.
				 */
				for (const log of registrationReceipt.logs) {
					try {
						const parsedLog = propertyRegistryWrite.interface.parseLog(log);

						if (parsedLog?.name === "PropertyRegistered") {
							createdPropertyId = parsedLog.args.propertyId as bigint;

							break;
						}
					} catch {
						// Log pripada drugom eventu.
					}
				}

				if (createdPropertyId === null) {
					throw new Error("Nije moguće očitati ID registrirane nekretnine.");
				}

				/*
				 * Od ovog trenutka registracija nekretnine
				 * postoji i eventualni nastavak više ne
				 * smije ponovno zvati registerProperty().
				 */
				setPendingPropertyId(createdPropertyId);

				setRegisteredPropertyId(createdPropertyId.toString());

				/*
				 * Provjera stvarnog blockchain zapisa.
				 */
				const registeredProperty =
					await propertyRegistryRead.getProperty(createdPropertyId);

				if (!(registeredProperty.exists as boolean)) {
					throw new Error(
						"Blockchain nije evidentirao registriranu nekretninu.",
					);
				}

				const digitalOwner = registeredProperty.digitalOwner as string;

				if (digitalOwner.toLowerCase() !== account.toLowerCase()) {
					throw new Error(
						"Registrirana nekretnina nema očekivanog digitalnog vlasnika.",
					);
				}
			} else {
				/*
				 * Nastavak prethodno prekinute predaje.
				 */
				setRegisteredPropertyId(createdPropertyId.toString());

				const existingProperty =
					await propertyRegistryRead.getProperty(createdPropertyId);

				if (!(existingProperty.exists as boolean)) {
					throw new Error(
						"Prethodno registrirana nekretnina više ne postoji na blockchainu.",
					);
				}

				const existingOwner = existingProperty.digitalOwner as string;

				if (existingOwner.toLowerCase() !== account.toLowerCase()) {
					throw new Error(
						"Povezani račun više nije digitalni vlasnik prethodno registrirane nekretnine.",
					);
				}
			}

			/* =============================================
			   5. PREDAJA 3 OBVEZNA DOKUMENTA
			   ============================================= */

			await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
				"Zemljišnoknjižni izvadak",
				landRegistryExtractHash,
				"2/4",
				"landRegistryExtract",
			);

			await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
				"Katastarski dokument",
				cadastralDocumentHash,
				"3/4",
				"cadastralDocument",
			);

			await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
				"Dokaz / osnova vlasništva",
				ownershipDocumentHash,
				"4/4",
				"ownershipDocument",
			);

			/* =============================================
			   6. KONAČNA BLOCKCHAIN PROVJERA
			   ============================================= */

			setStatusMessage(
				"Provjerava se konačno stanje dokumentacije na blockchainu...",
			);

			const [
				landDocument,
				cadastralDocument,
				ownershipDocument,
				hasAllRequiredDocuments,
				finalProperty,
			] = await Promise.all([
				propertyRegistryRead.getPropertyDocument(
					createdPropertyId,
					DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
				),

				propertyRegistryRead.getPropertyDocument(
					createdPropertyId,
					DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
				),

				propertyRegistryRead.getPropertyDocument(
					createdPropertyId,
					DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
				),

				propertyRegistryRead.hasAllRequiredDocuments(createdPropertyId),

				propertyRegistryRead.getProperty(createdPropertyId),
			]);

			if (!(hasAllRequiredDocuments as boolean)) {
				throw new Error(
					"Blockchain nije potvrdio predaju svih obveznih dokumenata.",
				);
			}

			if (
				!(landDocument.submitted as boolean) ||
				!(cadastralDocument.submitted as boolean) ||
				!(ownershipDocument.submitted as boolean)
			) {
				throw new Error(
					"Jedan ili više obveznih dokumenata nisu evidentirani kao predani.",
				);
			}

			if (
				(landDocument.documentHash as string).toLowerCase() !==
				landRegistryExtractHash.toLowerCase()
			) {
				throw new Error(
					"Hash zemljišnoknjižnog izvatka na blockchainu nije ispravan.",
				);
			}

			if (
				(cadastralDocument.documentHash as string).toLowerCase() !==
				cadastralDocumentHash.toLowerCase()
			) {
				throw new Error(
					"Hash katastarskog dokumenta na blockchainu nije ispravan.",
				);
			}

			if (
				(ownershipDocument.documentHash as string).toLowerCase() !==
				ownershipDocumentHash.toLowerCase()
			) {
				throw new Error("Hash dokaza vlasništva na blockchainu nije ispravan.");
			}

			const finalVerificationStatus = Number(finalProperty.verificationStatus);

			/* =============================================
			   7. USPJEH
			   ============================================= */

			setStatusMessage("");

			setSuccessMessage(
				`Nekretnina je registrirana i sva 3 obvezna dokumenta su predana. ID nekretnine: ${createdPropertyId.toString()}. Status dokumentacije: ${getPropertyStatusLabel(
					finalVerificationStatus,
				)}. Verifikator sada mora provjeriti svaki dokument zasebno.`,
			);

			/*
			 * Više nema nedovršene registracije.
			 */
			setPendingPropertyId(null);

			setCadastralMunicipality("");
			setParcelNumber("");
			setPropertyAddress("");

			setLandRegistryExtractFile(null);
			setCadastralDocumentFile(null);
			setOwnershipDocumentFile(null);

			const fileInputIds = [
				"land-registry-document",
				"cadastral-document",
				"ownership-document",
			];

			for (const inputId of fileInputIds) {
				const input = document.getElementById(
					inputId,
				) as HTMLInputElement | null;

				if (input) {
					input.value = "";
				}
			}
		} catch (error) {
			setStatusMessage("");

			const message = getErrorMessage(error);

			if (createdPropertyId !== null) {
				setPendingPropertyId(createdPropertyId);

				setRegisteredPropertyId(createdPropertyId.toString());

				setErrorMessage(
					`Nekretnina ID ${createdPropertyId.toString()} je registrirana, ali predaja svih dokumenata nije dovršena. ${message} Ponovnim klikom možeš nastaviti predaju bez ponovne registracije nekretnine.`,
				);
			} else {
				setErrorMessage(message);
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="property-card">
			<div className="property-card-header">
				<p className="eyebrow">Registar nekretnina</p>

				<h2>Registracija nekretnine</h2>

				<p>
					Povezani račun postaje početni digitalni vlasnik. Nakon registracije
					potrebno je predati sva tri obvezna dokumenta.
				</p>
			</div>

			<div className="current-owner">
				<span>Digitalni vlasnik</span>

				<strong>{shortenAddress(account)}</strong>
			</div>

			{pendingPropertyId !== null && (
				<div className="transaction-result">
					<strong>Registracija je djelomično dovršena</strong>

					<p>
						Nekretnina ID {pendingPropertyId.toString()} već je registrirana.
						Ponovni klik na gumb nastavit će samo predaju dokumenata koji još
						nedostaju.
					</p>
				</div>
			)}

			<form className="property-form" onSubmit={handleSubmit}>
				<div className="form-grid">
					<label className="form-field">
						<span>Katastarska općina</span>

						<input
							type="text"
							value={cadastralMunicipality}
							onChange={(event) => setCadastralMunicipality(event.target.value)}
							placeholder="Primjer: Osijek"
							disabled={isSubmitting || pendingPropertyId !== null}
							required
						/>
					</label>

					<label className="form-field">
						<span>Broj katastarske čestice</span>

						<input
							type="text"
							value={parcelNumber}
							onChange={(event) => setParcelNumber(event.target.value)}
							placeholder="Primjer: 1234/5"
							disabled={isSubmitting || pendingPropertyId !== null}
							required
						/>
					</label>
				</div>

				<label className="form-field">
					<span>Adresa nekretnine</span>

					<input
						type="text"
						value={propertyAddress}
						onChange={(event) => setPropertyAddress(event.target.value)}
						placeholder="Primjer: Europska avenija 1, Osijek"
						disabled={isSubmitting || pendingPropertyId !== null}
						required
					/>
				</label>

				<label className="form-field">
					<span>Zemljišnoknjižni izvadak</span>

					<input
						id="land-registry-document"
						type="file"
						accept=".pdf,.png,.jpg,.jpeg"
						onChange={(event) =>
							setLandRegistryExtractFile(event.target.files?.[0] ?? null)
						}
						disabled={isSubmitting}
						required
					/>

					<small>
						Na blockchain se sprema samo kriptografski hash dokumenta.
					</small>
				</label>

				<label className="form-field">
					<span>Katastarski dokument</span>

					<input
						id="cadastral-document"
						type="file"
						accept=".pdf,.png,.jpg,.jpeg"
						onChange={(event) =>
							setCadastralDocumentFile(event.target.files?.[0] ?? null)
						}
						disabled={isSubmitting}
						required
					/>

					<small>Izvorna datoteka ne sprema se na blockchain.</small>
				</label>

				<label className="form-field">
					<span>Dokaz / osnova vlasništva</span>

					<input
						id="ownership-document"
						type="file"
						accept=".pdf,.png,.jpg,.jpeg"
						onChange={(event) =>
							setOwnershipDocumentFile(event.target.files?.[0] ?? null)
						}
						disabled={isSubmitting}
						required
					/>

					<small>Na blockchain se zapisuje samo hash sadržaja dokumenta.</small>
				</label>

				<button type="submit" disabled={isSubmitting}>
					{isSubmitting
						? "Registracija u tijeku..."
						: pendingPropertyId !== null
							? "Nastavi predaju dokumenata"
							: "Registriraj nekretninu i predaj dokumente"}
				</button>
			</form>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Uspješna registracija</strong>

					<p>{successMessage}</p>
				</div>
			)}

			{registeredPropertyId && (
				<div className="blockchain-value">
					<span>ID nekretnine</span>

					<code>{registeredPropertyId}</code>
				</div>
			)}

			{documentHashes.landRegistryExtract && (
				<div className="blockchain-value">
					<span>Hash zemljišnoknjižnog izvatka</span>

					<code>{documentHashes.landRegistryExtract}</code>
				</div>
			)}

			{documentHashes.cadastralDocument && (
				<div className="blockchain-value">
					<span>Hash katastarskog dokumenta</span>

					<code>{documentHashes.cadastralDocument}</code>
				</div>
			)}

			{documentHashes.ownershipDocument && (
				<div className="blockchain-value">
					<span>Hash dokaza vlasništva</span>

					<code>{documentHashes.ownershipDocument}</code>
				</div>
			)}

			{registrationTransactionHash && (
				<div className="blockchain-value">
					<span>Hash transakcije registracije</span>

					<code>{registrationTransactionHash}</code>
				</div>
			)}

			{documentTransactionHashes.landRegistryExtract && (
				<div className="blockchain-value">
					<span>Transakcija zemljišnoknjižnog izvatka</span>

					<code>{documentTransactionHashes.landRegistryExtract}</code>
				</div>
			)}

			{documentTransactionHashes.cadastralDocument && (
				<div className="blockchain-value">
					<span>Transakcija katastarskog dokumenta</span>

					<code>{documentTransactionHashes.cadastralDocument}</code>
				</div>
			)}

			{documentTransactionHashes.ownershipDocument && (
				<div className="blockchain-value">
					<span>Transakcija dokaza vlasništva</span>

					<code>{documentTransactionHashes.ownershipDocument}</code>
				</div>
			)}

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
