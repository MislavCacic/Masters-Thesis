import { BrowserProvider, Contract } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { getPropertyStatusLabel } from "../../utils/statusLabels";

import "./VerifyPropertiesPanel.css";

interface VerifyPropertiesPanelProps {
	account: string;
}

interface PropertyData {
	id: bigint;
	cadastralMunicipality: string;
	parcelNumber: string;
	propertyAddress: string;
	documentHash: string;
	digitalOwner: string;
	verificationStatus: number;
	exists: boolean;
}

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

	return "Dohvat ili verifikacija nekretnina nije uspjela.";
}

export default function VerifyPropertiesPanel({
	account,
}: VerifyPropertiesPanelProps) {
	const [properties, setProperties] = useState<PropertyData[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [processingPropertyId, setProcessingPropertyId] = useState<
		bigint | null
	>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const loadProperties = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		setErrorMessage("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const provider = new BrowserProvider(window.ethereum);

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
					propertyRegistry.getProperty(propertyId).then((property) => ({
						id: property.id as bigint,
						cadastralMunicipality: property.cadastralMunicipality as string,
						parcelNumber: property.parcelNumber as string,
						propertyAddress: property.propertyAddress as string,
						documentHash: property.documentHash as string,
						digitalOwner: property.digitalOwner as string,
						verificationStatus: Number(property.verificationStatus),
						exists: property.exists as boolean,
					})),
				);
			}

			const loadedProperties = await Promise.all(propertyRequests);

			setProperties(loadedProperties.filter((property) => property.exists));
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadProperties();
	}, [account, loadProperties]);

	async function updateVerificationStatus(
		propertyId: bigint,
		action: "verify" | "reject",
	): Promise<void> {
		setProcessingPropertyId(propertyId);
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const provider = new BrowserProvider(window.ethereum);

			const signer = await provider.getSigner();
			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				signer,
			);

			const actionText = action === "verify" ? "potvrdu" : "odbijanje";

			setStatusMessage(`Potvrdi ${actionText} nekretnine u MetaMasku...`);

			const transaction =
				action === "verify"
					? await propertyRegistry.verifyProperty(propertyId)
					: await propertyRegistry.rejectProperty(propertyId);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			await transaction.wait();

			setStatusMessage("");

			setSuccessMessage(
				action === "verify"
					? `Nekretnina ID ${propertyId.toString()} uspješno je potvrđena.`
					: `Nekretnina ID ${propertyId.toString()} uspješno je odbijena.`,
			);

			await loadProperties();
		} catch (error) {
			setStatusMessage("");
			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingPropertyId(null);
		}
	}

	return (
		<section className="verification-card">
			<div className="verification-header">
				<div>
					<p className="eyebrow">Verifikacija dokumentacije</p>

					<h2>Registrirane nekretnine</h2>

					<p>
						Verifikator pregledava podatke i hash dokumentacije te potvrđuje ili
						odbija registriranu nekretninu.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadProperties()}
					disabled={isLoading}
				>
					{isLoading ? "Učitavanje..." : "Osvježi popis"}
				</button>
			</div>

			{isLoading && properties.length === 0 && (
				<p className="transaction-status">
					Učitavaju se nekretnine s blockchaina...
				</p>
			)}

			{!isLoading && properties.length === 0 && (
				<p className="empty-state">Trenutačno nema registriranih nekretnina.</p>
			)}

			<div className="property-list">
				{properties.map((property) => {
					const statusLabel = getPropertyStatusLabel(
						property.verificationStatus,
					);

					const statusClass = getPropertyStatusClass(
						property.verificationStatus,
					);

					const isPending = property.verificationStatus === 0;

					const isProcessing = processingPropertyId === property.id;

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

							<div className="blockchain-value">
								<span>Hash dokumentacije</span>

								<code>{property.documentHash}</code>
							</div>

							{isPending && (
								<div className="verification-actions">
									<button
										type="button"
										className="verify-button"
										disabled={isProcessing}
										onClick={() =>
											void updateVerificationStatus(property.id, "verify")
										}
									>
										{isProcessing ? "Obrada..." : "Potvrdi"}
									</button>

									<button
										type="button"
										className="reject-button"
										disabled={isProcessing}
										onClick={() =>
											void updateVerificationStatus(property.id, "reject")
										}
									>
										{isProcessing ? "Obrada..." : "Odbij"}
									</button>
								</div>
							)}
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
