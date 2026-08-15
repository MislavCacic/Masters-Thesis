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
const DOCUMENT_STORAGE_URL = "http://127.0.0.1:3001";

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

interface DocumentURIs {
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
type DocumentURIKey = keyof DocumentURIs;

interface UploadResponse {
	documentURI: string;
	fileName: string;
	originalName: string;
	mimeType: string;
	size: number;
}

const EMPTY_DOCUMENT_HASHES: DocumentHashes = {
	landRegistryExtract: "",
	cadastralDocument: "",
	ownershipDocument: "",
};

const EMPTY_DOCUMENT_URIS: DocumentURIs = {
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

async function uploadDocument(file: File): Promise<UploadResponse> {
	const formData = new FormData();

	formData.append("document", file);

	let response: Response;

	try {
		response = await fetch(`${DOCUMENT_STORAGE_URL}/upload`, {
			method: "POST",
			body: formData,
		});
	} catch {
		throw new Error(
			"Document Storage Server nije dostupan. Pokreni ga naredbom: npm run dev:storage",
		);
	}

	let responseData: unknown;

	try {
		responseData = await response.json();
	} catch {
		throw new Error("Document Storage Server vratio je neispravan odgovor.");
	}

	if (!response.ok) {
		const errorResponse = responseData as {
			error?: unknown;
		};

		if (typeof errorResponse.error === "string") {
			throw new Error(errorResponse.error);
		}

		throw new Error("Upload dokumenta nije uspio.");
	}

	const uploadResponse = responseData as Partial<UploadResponse>;

	if (
		typeof uploadResponse.documentURI !== "string" ||
		!uploadResponse.documentURI.trim()
	) {
		throw new Error(
			"Document Storage Server nije vratio URI spremljenog dokumenta.",
		);
	}

	return uploadResponse as UploadResponse;
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

	const [registeredPropertyId, setRegisteredPropertyId] = useState("");

	const [pendingPropertyId, setPendingPropertyId] = useState<bigint | null>(
		null,
	);

	const [registrationTransactionHash, setRegistrationTransactionHash] =
		useState("");

	const [documentHashes, setDocumentHashes] = useState<DocumentHashes>(
		EMPTY_DOCUMENT_HASHES,
	);

	const [documentURIs, setDocumentURIs] =
		useState<DocumentURIs>(EMPTY_DOCUMENT_URIS);

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
		setDocumentURIs(EMPTY_DOCUMENT_URIS);

		setDocumentTransactionHashes(EMPTY_DOCUMENT_TRANSACTION_HASHES);
	}, [account]);

	async function submitDocumentIfNeeded(
		propertyRegistryWrite: Contract,
		propertyRegistryRead: Contract,
		propertyId: bigint,
		documentType: DocumentType,
		documentName: string,
		file: File,
		documentHash: string,
		step: string,
		transactionKey: DocumentTransactionKey,
		uriKey: DocumentURIKey,
	): Promise<string> {
		/*
		 * Prije uploada provjeravamo postoji li dokument
		 * već na blockchainu.
		 *
		 * Time kod nastavka djelomično završene registracije
		 * ne uploadamo istu datoteku ponovno bez potrebe.
		 */
		const existingDocument = await propertyRegistryRead.getPropertyDocument(
			propertyId,
			documentType,
		);

		const alreadySubmitted = existingDocument.submitted as boolean;

		if (alreadySubmitted) {
			const existingHash = existingDocument.documentHash as string;

			const existingURI = existingDocument.documentURI as string;

			if (existingHash.toLowerCase() !== documentHash.toLowerCase()) {
				throw new Error(
					`${documentName} već je predan za ovu nekretninu, ali njegov blockchain hash ne odgovara trenutno odabranoj datoteci.`,
				);
			}

			if (!existingURI.trim()) {
				throw new Error(
					`${documentName} postoji na blockchainu, ali nema spremljen URI dokumenta.`,
				);
			}

			setDocumentURIs((previous) => ({
				...previous,
				[uriKey]: existingURI,
			}));

			return existingURI;
		}

		/*
		 * Datoteka se prvo sprema izvan blockchaina.
		 */
		setStatusMessage(
			`${step} Sprema se dokument "${documentName}" u off-chain spremište...`,
		);

		const uploadResult = await uploadDocument(file);

		const documentURI = uploadResult.documentURI;

		setDocumentURIs((previous) => ({
			...previous,
			[uriKey]: documentURI,
		}));

		/*
		 * Nakon uspješnog uploada blockchainu šaljemo
		 * i hash i URI dokumenta.
		 */
		setStatusMessage(
			`${step} Dokument je spremljen. Potvrdi blockchain predaju dokumenta "${documentName}" u MetaMasku...`,
		);

		const transaction = await propertyRegistryWrite.submitPropertyDocument(
			propertyId,
			documentType,
			documentHash,
			documentURI,
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
		 * Stvarno blockchain stanje ponovno čitamo
		 * direktno s lokalnog Hardhat nodea.
		 */
		const submittedDocument = await propertyRegistryRead.getPropertyDocument(
			propertyId,
			documentType,
		);

		const submitted = submittedDocument.submitted as boolean;

		const storedHash = submittedDocument.documentHash as string;

		const storedURI = submittedDocument.documentURI as string;

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

		if (storedURI !== documentURI) {
			throw new Error(
				`Blockchain URI dokumenta "${documentName}" ne odgovara URI-ju spremljene datoteke.`,
			);
		}

		return documentURI;
	}

	async function handleSubmit(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		setErrorMessage("");
		setSuccessMessage("");
		setStatusMessage("");

		if (pendingPropertyId === null) {
			setRegisteredPropertyId("");

			setRegistrationTransactionHash("");

			setDocumentTransactionHashes(EMPTY_DOCUMENT_TRANSACTION_HASHES);

			setDocumentURIs(EMPTY_DOCUMENT_URIS);
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

				setPendingPropertyId(createdPropertyId);

				setRegisteredPropertyId(createdPropertyId.toString());

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

			const landRegistryExtractURI = await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
				"Zemljišnoknjižni izvadak",
				landRegistryExtractFile,
				landRegistryExtractHash,
				"2/4",
				"landRegistryExtract",
				"landRegistryExtract",
			);

			const cadastralDocumentURI = await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
				"Katastarski dokument",
				cadastralDocumentFile,
				cadastralDocumentHash,
				"3/4",
				"cadastralDocument",
				"cadastralDocument",
			);

			const ownershipDocumentURI = await submitDocumentIfNeeded(
				propertyRegistryWrite,
				propertyRegistryRead,
				createdPropertyId,
				DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
				"Dokaz / osnova vlasništva",
				ownershipDocumentFile,
				ownershipDocumentHash,
				"4/4",
				"ownershipDocument",
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

			if ((landDocument.documentURI as string) !== landRegistryExtractURI) {
				throw new Error(
					"URI zemljišnoknjižnog izvatka na blockchainu nije ispravan.",
				);
			}

			if ((cadastralDocument.documentURI as string) !== cadastralDocumentURI) {
				throw new Error(
					"URI katastarskog dokumenta na blockchainu nije ispravan.",
				);
			}

			if ((ownershipDocument.documentURI as string) !== ownershipDocumentURI) {
				throw new Error("URI dokaza vlasništva na blockchainu nije ispravan.");
			}

			const finalVerificationStatus = Number(finalProperty.verificationStatus);

			/* =============================================
			   7. USPJEH
			   ============================================= */

			setStatusMessage("");

			setSuccessMessage(
				`Nekretnina je registrirana i sva 3 obvezna dokumenta su predana. Dokumenti su spremljeni izvan blockchaina, dok su njihov hash i URI evidentirani na blockchainu. ID nekretnine: ${createdPropertyId.toString()}. Status dokumentacije: ${getPropertyStatusLabel(
					finalVerificationStatus,
				)}. Verifikator sada može pregledati i provjeriti svaki dokument zasebno.`,
			);

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
					Povezani račun postaje početni digitalni vlasnik. Dokumenti se
					spremaju izvan blockchaina, dok se njihov kriptografski hash i URI
					zapisuju na blockchain.
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
						Datoteka se sprema izvan blockchaina. Na blockchain se zapisuju hash
						i URI dokumenta.
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

					<small>Izvorna datoteka nije pohranjena izravno na blockchain.</small>
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

					<small>
						Verifikator dokument može pregledati putem URI-ja evidentiranog na
						blockchainu.
					</small>
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

			{documentURIs.landRegistryExtract && (
				<div className="blockchain-value">
					<span>URI zemljišnoknjižnog izvatka</span>

					<a
						href={documentURIs.landRegistryExtract}
						target="_blank"
						rel="noreferrer"
					>
						{documentURIs.landRegistryExtract}
					</a>
				</div>
			)}

			{documentHashes.cadastralDocument && (
				<div className="blockchain-value">
					<span>Hash katastarskog dokumenta</span>

					<code>{documentHashes.cadastralDocument}</code>
				</div>
			)}

			{documentURIs.cadastralDocument && (
				<div className="blockchain-value">
					<span>URI katastarskog dokumenta</span>

					<a
						href={documentURIs.cadastralDocument}
						target="_blank"
						rel="noreferrer"
					>
						{documentURIs.cadastralDocument}
					</a>
				</div>
			)}

			{documentHashes.ownershipDocument && (
				<div className="blockchain-value">
					<span>Hash dokaza vlasništva</span>

					<code>{documentHashes.ownershipDocument}</code>
				</div>
			)}

			{documentURIs.ownershipDocument && (
				<div className="blockchain-value">
					<span>URI dokaza vlasništva</span>

					<a
						href={documentURIs.ownershipDocument}
						target="_blank"
						rel="noreferrer"
					>
						{documentURIs.ownershipDocument}
					</a>
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
