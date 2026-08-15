import { Contract, JsonRpcProvider } from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { getPropertyStatusLabel } from "../../utils/statusLabels";

import "./PropertyPanel.css";

interface PropertyPanelProps {
	account: string;
	showAll: boolean;
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
	documentURI: string;
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
			reason?: unknown;
			shortMessage?: unknown;
			message?: unknown;
		};

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

	return "Dohvat nekretnina nije uspio.";
}

export default function PropertyPanel({
	account,
	showAll,
}: PropertyPanelProps) {
	const [properties, setProperties] = useState<PropertyData[]>([]);

	const [isLoading, setIsLoading] = useState(false);

	const [errorMessage, setErrorMessage] = useState("");

	/*
	 * ID trenutačnog zahtjeva.
	 *
	 * Ako se račun promijeni dok stari blockchain
	 * zahtjev još traje, njegov rezultat se ignorira.
	 */
	const requestIdRef = useRef(0);

	const loadProperties = useCallback(async (): Promise<void> => {
		if (!account) {
			setProperties([]);
			setErrorMessage("");

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * PropertyPanel samo čita blockchain.
			 * Zato koristimo direktni Hardhat RPC
			 * umjesto MetaMask BrowserProvidera.
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

			if (requestId !== requestIdRef.current) {
				return;
			}

			const loadedProperties: PropertyData[] = [];

			const normalizedAccount = account.toLowerCase();

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				const property = await propertyRegistry.getProperty(propertyId);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const exists = property.exists as boolean;

				const digitalOwner = property.digitalOwner as string;

				const belongsToConnectedAccount =
					digitalOwner.toLowerCase() === normalizedAccount;

				if (!exists || (!showAll && !belongsToConnectedAccount)) {
					continue;
				}

				const [
					landRegistryDocument,
					cadastralDocument,
					ownershipDocument,
					hasAllRequiredDocuments,
					hasValidDocuments,
				] = await Promise.all([
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

				if (requestId !== requestIdRef.current) {
					return;
				}

				const documents: PropertyDocumentData[] = [
					{
						documentType: DOCUMENT_TYPE.LAND_REGISTRY_EXTRACT,

						name: DOCUMENT_DEFINITIONS[0].name,

						documentHash: landRegistryDocument.documentHash as string,

						documentURI: landRegistryDocument.documentURI as string,

						verificationStatus: Number(landRegistryDocument.verificationStatus),

						submitted: landRegistryDocument.submitted as boolean,
					},
					{
						documentType: DOCUMENT_TYPE.CADASTRAL_DOCUMENT,

						name: DOCUMENT_DEFINITIONS[1].name,

						documentHash: cadastralDocument.documentHash as string,

						documentURI: cadastralDocument.documentURI as string,

						verificationStatus: Number(cadastralDocument.verificationStatus),

						submitted: cadastralDocument.submitted as boolean,
					},
					{
						documentType: DOCUMENT_TYPE.OWNERSHIP_DOCUMENT,

						name: DOCUMENT_DEFINITIONS[2].name,

						documentHash: ownershipDocument.documentHash as string,

						documentURI: ownershipDocument.documentURI as string,

						verificationStatus: Number(ownershipDocument.verificationStatus),

						submitted: ownershipDocument.submitted as boolean,
					},
				];

				loadedProperties.push({
					id: property.id as bigint,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,

					propertyAddress: property.propertyAddress as string,

					digitalOwner,

					verificationStatus: Number(property.verificationStatus),

					exists,

					hasAllRequiredDocuments: hasAllRequiredDocuments as boolean,

					hasValidDocuments: hasValidDocuments as boolean,

					documents,
				});
			}

			if (requestId === requestIdRef.current) {
				setProperties(loadedProperties);
			}
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
	}, [account, showAll]);

	useEffect(() => {
		/*
		 * Kod promjene računa odmah uklanjamo
		 * nekretnine prethodnog korisnika.
		 */
		setProperties([]);
		setErrorMessage("");

		void loadProperties();

		return () => {
			requestIdRef.current++;
		};
	}, [loadProperties]);

	return (
		<section className="portfolio-card">
			<div className="portfolio-header">
				<div>
					<p className="eyebrow">Digitalni registar</p>

					<h2>{showAll ? "Sve nekretnine" : "Moje nekretnine"}</h2>

					<p>
						{showAll
							? "Pregled svih nekretnina registriranih u blockchain sustavu, uključujući status i dokumentaciju."
							: "Pregled nekretnina čiji je povezani račun trenutačni digitalni vlasnik, zajedno s dokumentacijom evidentiranom na blockchainu."}
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadProperties()}
					disabled={isLoading}
				>
					{isLoading ? "Učitavanje..." : "Osvježi nekretnine"}
				</button>
			</div>

			{isLoading && properties.length === 0 && (
				<p className="transaction-status">
					Učitavaju se nekretnine i dokumentacija s blockchaina...
				</p>
			)}

			{!isLoading && properties.length === 0 && (
				<p className="empty-state">
					{showAll
						? "U sustavu nema registriranih nekretnina."
						: "Povezani račun trenutačno nije digitalni vlasnik nijedne nekretnine."}
				</p>
			)}

			<div className="property-list">
				{properties.map((property) => {
					const statusLabel = getPropertyStatusLabel(
						property.verificationStatus,
					);

					const statusClass = getPropertyStatusClass(
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

								<span className={`status-badge status-${statusClass}`}>
									{statusLabel}
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
												<>
													<div className="blockchain-value">
														<span>Hash dokumenta</span>

														<code title={document.documentHash}>
															{shortenHash(document.documentHash)}
														</code>
													</div>

													<div className="blockchain-value">
														<span>Adresa dokumenta</span>

														<code title={document.documentURI}>
															{document.documentURI || "Nije evidentirana"}
														</code>
													</div>

													{document.documentURI ? (
														<div className="verification-actions">
															<a
																href={document.documentURI}
																target="_blank"
																rel="noreferrer"
																className="secondary-button"
															>
																Pregledaj dokument
															</a>
														</div>
													) : (
														<p className="error">
															Dokument nema evidentiranu adresu za pregled.
														</p>
													)}
												</>
											) : (
												<p className="empty-state">Dokument još nije predan.</p>
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

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
