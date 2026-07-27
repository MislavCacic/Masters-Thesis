import { useCallback, useEffect, useState } from "react";

import { BrowserProvider, Contract } from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";

import "./PropertyPortfolioPanel.css";

interface PropertyPortfolioPanelProps {
	account: string;
	showAll: boolean;
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

const VERIFICATION_STATUS = {
	0: "Pending",
	1: "Verified",
	2: "Rejected",
} as const;

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getStatusName(status: number): string {
	if (status === 0 || status === 1 || status === 2) {
		return VERIFICATION_STATUS[status];
	}

	return "Unknown";
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

export default function PropertyPortfolioPanel({
	account,
	showAll,
}: PropertyPortfolioPanelProps) {
	const [properties, setProperties] = useState<PropertyData[]>([]);
	const [isLoading, setIsLoading] = useState(false);
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

			const loadedProperties: PropertyData[] = [];

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				const property = await propertyRegistry.getProperty(propertyId);

				const exists = property.exists as boolean;
				const digitalOwner = property.digitalOwner as string;

				const belongsToConnectedAccount =
					digitalOwner.toLowerCase() === account.toLowerCase();

				if (!exists || (!showAll && !belongsToConnectedAccount)) {
					continue;
				}

				loadedProperties.push({
					id: property.id as bigint,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,

					propertyAddress: property.propertyAddress as string,

					documentHash: property.documentHash as string,

					digitalOwner,

					verificationStatus: Number(property.verificationStatus),

					exists,
				});
			}

			setProperties(loadedProperties);
		} catch (error) {
			setProperties([]);
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, [account, showAll]);

	useEffect(() => {
		void loadProperties();
	}, [loadProperties]);

	return (
		<section className="portfolio-card">
			<div className="portfolio-header">
				<div>
					<p className="eyebrow">Digitalni registar</p>

					<h2>{showAll ? "Sve nekretnine" : "Moje nekretnine"}</h2>

					<p>
						{showAll
							? "Pregled svih nekretnina registriranih u blockchain sustavu."
							: "Pregled nekretnina čiji je povezani račun trenutačni digitalni vlasnik."}
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
					Učitavaju se nekretnine s blockchaina...
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
					const statusName = getStatusName(property.verificationStatus);

					return (
						<article className="property-item" key={property.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Nekretnina ID {property.id.toString()}
									</span>

									<h3>{property.propertyAddress}</h3>
								</div>

								<span
									className={`status-badge status-${statusName.toLowerCase()}`}
								>
									{statusName}
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
						</article>
					);
				})}
			</div>

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
