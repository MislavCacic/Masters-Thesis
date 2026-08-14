import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { getPropertyStatusLabel } from "../../utils/statusLabels";

import "./VerifyPropertiesPanel.css";

interface VerifyPropertiesPanelProps {
	account: string;
}

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const DOCUMENT_TYPE = {
	LAND_REGISTRY_EXTRACT: 0,
	CADASTRAL_DOCUMENT: 1,
	OWNERSHIP_DOCUMENT: 2,
} as const;

type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

interface PropertyDocumentData {
	documentType: DocumentType;
	name: string;
	documentHash: string;
	verificationStatus: number;
	submitted: boolean;
}

interface PropertyData {
	id: bigint;
	cadastralMunicipality: string;
	parcelNumber: string;
	propertyAddress: string;
	digitalOwner: string;
	verificationStatus: number;
	exists: boolean;
	hasAllRequiredDocuments: boolean;
	hasValidDocuments: boolean;
	documents: PropertyDocumentData[];
}

const DOCUMENT_DEFINITIONS: {
	type: DocumentType;
	name: string;
}[] = [
	{
		type: DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
		name: "Zemljišnoknjižni izvadak",
	},
	{
		type: DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
		name: "Katastarski dokument",
	},
	{
		type: DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
		name: "Dokaz / osnova vlasništva",
	},
];

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortenHash(hash: string): string {
	if (!hash) {
		return "";
	}

	return `${hash.slice(0, 14)}...${hash.slice(-10)}`;
}

function getPropertyStatusClass(status: number): string {
	switch (status) {
		case 0:
			return "pending";

		case 1:
			return "verified";

		case 2:
			return "rejected";

		default:
			return "unknown";
	}
}

function getDocumentStatusLabel(document: PropertyDocumentData): string {
	if (!document.submitted) {
		return "Nije predan";
	}

	return getPropertyStatusLabel(document.verificationStatus);
}

function getDocumentStatusClass(document: PropertyDocumentData): string {
	if (!document.submitted) {
		return "unknown";
	}

	return getPropertyStatusClass(document.verificationStatus);
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

	return "Dohvat ili verifikacija dokumentacije nije uspjela.";
}

export default function VerifyPropertiesPanel({
	account,
}: VerifyPropertiesPanelProps) {
	const [properties, setProperties] = useState<PropertyData[]>([]);

	const [isLoading, setIsLoading] = useState(false);

	const [processingDocumentKey, setProcessingDocumentKey] = useState<
		string | null
	>(null);

	const [statusMessage, setStatusMessage] = useState("");

	const [successMessage, setSuccessMessage] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	/*
	 * Zaštita od zastarjelih blockchain odgovora.
	 *
	 * Ako se MetaMask račun promijeni dok traje
	 * prethodni zahtjev, stari rezultat više ne
	 * smije prepisati novi prikaz.
	 */
	const requestIdRef = useRef(0);

	const loadProperties = useCallback(async (): Promise<void> => {
		if (!account) {
			setProperties([]);

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * READ operacije ne ovise o MetaMasku.
			 * Čitamo izravno s lokalnog Hardhat nodea.
			 */
			const provider = new JsonRpcProvider(LOCAL_RPC_URL);

			const network = await provider.getNetwork();

			if (network.chainId !== HARDHAT_CHAIN_ID) {
				throw new Error(
					`Neočekivana blockchain mreža. Chain ID: ${network.chainId.toString()}.`,
				);
			}

			if (requestId !== requestIdRef.current) {
				return;
			}

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				provider,
			);

			const propertyCount =
				(await propertyRegistry.getPropertyCount()) as bigint;

			const propertyRequests: Promise<PropertyData>[] = [];

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				propertyRequests.push(
					(async () => {
						const [
							property,
							landRegistryDocument,
							cadastralDocument,
							ownershipDocument,
							hasAllRequiredDocuments,
							hasValidDocuments,
						] = await Promise.all([
							propertyRegistry.getProperty(propertyId),

							propertyRegistry.getPropertyDocument(
								propertyId,
								DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,
							),

							propertyRegistry.getPropertyDocument(
								propertyId,
								DOCUMENT_TYPE.CADASTRAL_DOCUMENT,
							),

							propertyRegistry.getPropertyDocument(
								propertyId,
								DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,
							),

							propertyRegistry.hasAllRequiredDocuments(propertyId),

							propertyRegistry.hasValidDocuments(propertyId),
						]);

						const documents: PropertyDocumentData[] = [
							{
								documentType: DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,

								name: DOCUMENT_DEFINITIONS[0].name,

								documentHash: landRegistryDocument.documentHash as string,

								verificationStatus: Number(
									landRegistryDocument.verificationStatus,
								),

								submitted: landRegistryDocument.submitted as boolean,
							},

							{
								documentType: DOCUMENT_TYPE.CADASTRAL_DOCUMENT,

								name: DOCUMENT_DEFINITIONS[1].name,

								documentHash: cadastralDocument.documentHash as string,

								verificationStatus: Number(
									cadastralDocument.verificationStatus,
								),

								submitted: cadastralDocument.submitted as boolean,
							},

							{
								documentType: DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,

								name: DOCUMENT_DEFINITIONS[2].name,

								documentHash: ownershipDocument.documentHash as string,

								verificationStatus: Number(
									ownershipDocument.verificationStatus,
								),

								submitted: ownershipDocument.submitted as boolean,
							},
						];

						return {
							id: property.id as bigint,

							cadastralMunicipality: property.cadastralMunicipality as string,

							parcelNumber: property.parcelNumber as string,

							propertyAddress: property.propertyAddress as string,

							digitalOwner: property.digitalOwner as string,

							verificationStatus: Number(property.verificationStatus),

							exists: property.exists as boolean,

							hasAllRequiredDocuments: hasAllRequiredDocuments as boolean,

							hasValidDocuments: hasValidDocuments as boolean,

							documents,
						};
					})(),
				);
			}

			const loadedProperties = await Promise.all(propertyRequests);

			if (requestId !== requestIdRef.current) {
				return;
			}

			setProperties(
				loadedProperties
					.filter((property) => property.exists)
					.sort((a, b) => {
						if (a.id === b.id) {
							return 0;
						}

						return a.id > b.id ? -1 : 1;
					}),
			);
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setProperties([]);

				setErrorMessage(getErrorMessage(error));
			}
		} finally {
			if (requestId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [account]);

	useEffect(() => {
		setProperties([]);

		setStatusMessage("");

		setSuccessMessage("");

		setErrorMessage("");

		setProcessingDocumentKey(null);

		void loadProperties();

		return () => {
			requestIdRef.current++;
		};
	}, [loadProperties]);

	async function updateDocumentVerificationStatus(
		propertyId: bigint,
		documentType: DocumentType,
		documentName: string,
		action: "verify" | "reject",
	): Promise<void> {
		const documentKey = `${propertyId.toString()}-${documentType}`;

		setProcessingDocumentKey(documentKey);

		setStatusMessage("");

		setSuccessMessage("");

		setErrorMessage("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			/*
			 * Prije WRITE transakcije provjeravamo
			 * aktualno stanje dokumenta direktno
			 * s Hardhat nodea.
			 */
			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const readNetwork = await readProvider.getNetwork();

			if (readNetwork.chainId !== HARDHAT_CHAIN_ID) {
				throw new Error("Hardhat local mreža nije dostupna.");
			}

			const propertyRegistryRead = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				readProvider,
			);

			const property = await propertyRegistryRead.getProperty(propertyId);

			if (!(property.exists as boolean)) {
				throw new Error("Nekretnina više ne postoji u registru.");
			}

			const documentBefore = await propertyRegistryRead.getPropertyDocument(
				propertyId,
				documentType,
			);

			const submittedBefore = documentBefore.submitted as boolean;

			const statusBefore = Number(documentBefore.verificationStatus);

			if (!submittedBefore) {
				throw new Error("Dokument nije predan i nije ga moguće verificirati.");
			}

			if (statusBefore !== 0) {
				throw new Error("Dokument više nije u statusu Na čekanju.");
			}

			/*
			 * BrowserProvider koristimo isključivo
			 * za MetaMask potpis WRITE operacije.
			 */
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

			const actionText = action === "verify" ? "potvrdu" : "odbijanje";

			setStatusMessage(
				`Potvrdi ${actionText} dokumenta "${documentName}" u MetaMasku...`,
			);

			const transaction =
				action === "verify"
					? await propertyRegistryWrite.verifyPropertyDocument(
							propertyId,
							documentType,
						)
					: await propertyRegistryWrite.rejectPropertyDocument(
							propertyId,
							documentType,
						);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			/*
			 * Nakon MetaMask transakcije ponovno
			 * čitamo dokument izravno s blockchaina.
			 */
			const postTransactionProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const propertyRegistryPost = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				postTransactionProvider,
			);

			const documentAfter = await propertyRegistryPost.getPropertyDocument(
				propertyId,
				documentType,
			);

			const submittedAfter = documentAfter.submitted as boolean;

			const statusAfter = Number(documentAfter.verificationStatus);

			if (!submittedAfter) {
				throw new Error("Blockchain više ne evidentira dokument kao predan.");
			}

			const expectedStatus = action === "verify" ? 1 : 2;

			if (statusAfter !== expectedStatus) {
				throw new Error(
					action === "verify"
						? "Blockchain nije evidentirao dokument kao potvrđen."
						: "Blockchain nije evidentirao dokument kao odbijen.",
				);
			}

			/*
			 * Ako se upravo potvrđuje treći dokument,
			 * PropertyRegistry sam mora automatski
			 * označiti cijelu dokumentaciju valjanom.
			 */
			const [hasAllRequiredDocuments, hasValidDocuments] = await Promise.all([
				propertyRegistryPost.hasAllRequiredDocuments(
					propertyId,
				) as Promise<boolean>,

				propertyRegistryPost.hasValidDocuments(propertyId) as Promise<boolean>,
			]);

			setStatusMessage("");

			if (action === "verify" && hasAllRequiredDocuments && hasValidDocuments) {
				setSuccessMessage(
					`${documentName} za nekretninu ID ${propertyId.toString()} uspješno je potvrđen. Sva 3 obvezna dokumenta sada su potvrđena i nekretnina je spremna za prodaju.`,
				);
			} else {
				setSuccessMessage(
					action === "verify"
						? `${documentName} za nekretninu ID ${propertyId.toString()} uspješno je potvrđen.`
						: `${documentName} za nekretninu ID ${propertyId.toString()} uspješno je odbijen.`,
				);
			}

			await loadProperties();
		} catch (error) {
			setStatusMessage("");

			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingDocumentKey(null);
		}
	}

	return (
		<section className="verification-card">
			<div className="verification-header">
				<div>
					<p className="eyebrow">Verifikacija dokumentacije</p>

					<h2>Registrirane nekretnine</h2>

					<p>
						Verifikator provjerava svaki obvezni dokument zasebno. Nekretnina
						postaje spremna za prodaju tek kada su sva tri dokumenta potvrđena.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadProperties()}
					disabled={isLoading || processingDocumentKey !== null}
				>
					{isLoading ? "Učitavanje..." : "Osvježi popis"}
				</button>
			</div>

			{isLoading && properties.length === 0 && (
				<p className="transaction-status">
					Učitavaju se nekretnine i dokumentacija s blockchaina...
				</p>
			)}

			{!isLoading && properties.length === 0 && (
				<p className="empty-state">Trenutačno nema registriranih nekretnina.</p>
			)}

			<div className="property-list">
				{properties.map((property) => {
					const propertyStatusLabel = getPropertyStatusLabel(
						property.verificationStatus,
					);

					const propertyStatusClass = getPropertyStatusClass(
						property.verificationStatus,
					);

					const submittedDocumentCount = property.documents.filter(
						(document) => document.submitted,
					).length;

					const verifiedDocumentCount = property.documents.filter(
						(document) =>
							document.submitted && document.verificationStatus === 1,
					).length;

					return (
						<article className="property-item" key={property.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Nekretnina ID {property.id.toString()}
									</span>

									<h3>{property.propertyAddress}</h3>
								</div>

								<span className={`status-badge status-${propertyStatusClass}`}>
									{propertyStatusLabel}
								</span>
							</div>

							<dl className="property-details">
								<div>
									<dt>Katastarska općina</dt>

									<dd>{property.cadastralMunicipality}</dd>
								</div>

								<div>
									<dt>Broj čestice</dt>

									<dd>{property.parcelNumber}</dd>
								</div>

								<div>
									<dt>Digitalni vlasnik</dt>

									<dd title={property.digitalOwner}>
										{shortenAddress(property.digitalOwner)}
									</dd>
								</div>
							</dl>

							<dl className="property-details">
								<div>
									<dt>Dokumenti predani</dt>

									<dd>
										{submittedDocumentCount}
										/3
									</dd>
								</div>

								<div>
									<dt>Dokumenti potvrđeni</dt>

									<dd>
										{verifiedDocumentCount}
										/3
									</dd>
								</div>

								<div>
									<dt>Spremna za prodaju</dt>

									<dd>{property.hasValidDocuments ? "DA" : "NE"}</dd>
								</div>
							</dl>

							<div className="property-list">
								{property.documents.map((document) => {
									const documentStatusLabel = getDocumentStatusLabel(document);

									const documentStatusClass = getDocumentStatusClass(document);

									const documentKey = `${property.id.toString()}-${document.documentType}`;

									const isProcessing = processingDocumentKey === documentKey;

									const isAnyProcessing = processingDocumentKey !== null;

									const isPending =
										document.submitted && document.verificationStatus === 0;

									return (
										<div className="property-item" key={documentKey}>
											<div className="property-item-heading">
												<div>
													<span className="property-id">Obvezni dokument</span>

													<h3>{document.name}</h3>
												</div>

												<span
													className={`status-badge status-${documentStatusClass}`}
												>
													{documentStatusLabel}
												</span>
											</div>

											{document.submitted ? (
												<div className="blockchain-value">
													<span>Hash dokumenta</span>

													<code title={document.documentHash}>
														{shortenHash(document.documentHash)}
													</code>
												</div>
											) : (
												<p className="empty-state">Dokument još nije predan.</p>
											)}

											{isPending && (
												<div className="verification-actions">
													<button
														type="button"
														className="verify-button"
														disabled={isAnyProcessing}
														onClick={() =>
															void updateDocumentVerificationStatus(
																property.id,
																document.documentType,
																document.name,
																"verify",
															)
														}
													>
														{isProcessing ? "Obrada..." : "Potvrdi dokument"}
													</button>

													<button
														type="button"
														className="reject-button"
														disabled={isAnyProcessing}
														onClick={() =>
															void updateDocumentVerificationStatus(
																property.id,
																document.documentType,
																document.name,
																"reject",
															)
														}
													>
														{isProcessing ? "Obrada..." : "Odbij dokument"}
													</button>
												</div>
											)}
										</div>
									);
								})}
							</div>

							<div className="transaction-result">
								<strong>Status dokumentacije</strong>

								<p>
									{property.hasAllRequiredDocuments
										? "Sva 3 obvezna dokumenta su predana."
										: "Nisu predana sva 3 obvezna dokumenta."}
								</p>

								<p>
									{property.hasValidDocuments
										? "Sva dokumentacija je potvrđena. Nekretnina je spremna za prodaju."
										: "Nekretnina još nije spremna za prodaju."}
								</p>
							</div>
						</article>
					);
				})}
			</div>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Uspješna transakcija</strong>

					<p>{successMessage}</p>
				</div>
			)}

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
