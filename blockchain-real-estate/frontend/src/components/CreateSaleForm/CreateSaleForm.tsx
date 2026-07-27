import { useCallback, useEffect, useState, type FormEvent } from "react";

import { BrowserProvider, Contract, parseUnits } from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";

import "./CreateSaleForm.css";

interface CreateSaleFormProps {
	account: string;
}

interface PropertyOption {
	id: bigint;
	cadastralMunicipality: string;
	parcelNumber: string;
	propertyAddress: string;
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

	return "Kreiranje prodaje nije uspjelo.";
}

export default function CreateSaleForm({ account }: CreateSaleFormProps) {
	const [properties, setProperties] = useState<PropertyOption[]>([]);
	const [selectedPropertyId, setSelectedPropertyId] = useState("");
	const [price, setPrice] = useState("");

	const [isLoading, setIsLoading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [transactionHash, setTransactionHash] = useState("");

	const loadEligibleProperties = useCallback(async (): Promise<void> => {
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

			const realEstateEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				provider,
			);

			const propertyCount =
				(await propertyRegistry.getPropertyCount()) as bigint;

			const saleCount = (await realEstateEscrow.getSaleCount()) as bigint;

			const propertiesWithActiveSale = new Set<string>();

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				const saleExists = sale.exists as boolean;
				const saleStatus = Number(sale.status);
				const salePropertyId = sale.propertyId as bigint;

				const isActive = saleStatus === 0 || saleStatus === 1;

				if (saleExists && isActive) {
					propertiesWithActiveSale.add(salePropertyId.toString());
				}
			}

			const eligibleProperties: PropertyOption[] = [];

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				const property = await propertyRegistry.getProperty(propertyId);

				const exists = property.exists as boolean;

				const verificationStatus = Number(property.verificationStatus);

				const digitalOwner = property.digitalOwner as string;

				const belongsToConnectedAccount =
					digitalOwner.toLowerCase() === account.toLowerCase();

				const isVerified = verificationStatus === 1;

				const hasNoActiveSale = !propertiesWithActiveSale.has(
					propertyId.toString(),
				);

				if (
					exists &&
					belongsToConnectedAccount &&
					isVerified &&
					hasNoActiveSale
				) {
					eligibleProperties.push({
						id: property.id as bigint,
						cadastralMunicipality: property.cadastralMunicipality as string,
						parcelNumber: property.parcelNumber as string,
						propertyAddress: property.propertyAddress as string,
					});
				}
			}

			setProperties(eligibleProperties);

			setSelectedPropertyId((currentValue) => {
				const selectedStillExists = eligibleProperties.some(
					(property) => property.id.toString() === currentValue,
				);

				if (selectedStillExists) {
					return currentValue;
				}

				return eligibleProperties[0]?.id.toString() ?? "";
			});
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
			setProperties([]);
			setSelectedPropertyId("");
		} finally {
			setIsLoading(false);
		}
	}, [account]);

	useEffect(() => {
		setPrice("");
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		void loadEligibleProperties();
	}, [account, loadEligibleProperties]);

	useEffect(() => {
		if (!successMessage) {
			return;
		}

		const messageTimer = window.setTimeout(() => {
			setSuccessMessage("");
			setTransactionHash("");
		}, 6000);

		return () => {
			window.clearTimeout(messageTimer);
		};
	}, [successMessage]);

	async function handleSubmit(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		if (!window.ethereum) {
			setErrorMessage("MetaMask nije pronađen u pregledniku.");
			return;
		}

		if (!selectedPropertyId) {
			setErrorMessage("Odaberi verificiranu nekretninu.");
			return;
		}

		const normalizedPrice = price.trim().replace(",", ".");

		if (!normalizedPrice) {
			setErrorMessage("Unesi cijenu nekretnine.");
			return;
		}

		setIsSubmitting(true);

		try {
			const priceInSmallestUnits = parseUnits(normalizedPrice, 2);

			if (priceInSmallestUnits <= 0n) {
				throw new Error("Cijena mora biti veća od nule.");
			}

			const provider = new BrowserProvider(window.ethereum);

			const signer = await provider.getSigner();
			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const realEstateEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				signer,
			);

			setStatusMessage("Potvrdi kreiranje prodaje u MetaMasku...");

			const transaction = await realEstateEscrow.createSale(
				BigInt(selectedPropertyId),
				priceInSmallestUnits,
			);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			const saleCount = (await realEstateEscrow.getSaleCount()) as bigint;

			const createdSale = await realEstateEscrow.getSale(saleCount);

			const createdSaleId = createdSale.id as bigint;

			setStatusMessage("");

			setSuccessMessage(
				`Prodaja je kreirana. ID prodaje: ${createdSaleId.toString()}. Cijena: ${normalizedPrice} mEUR.`,
			);

			setPrice("");

			await loadEligibleProperties();
		} catch (error) {
			setStatusMessage("");
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="sale-card">
			<div className="sale-header">
				<div>
					<p className="eyebrow">Pametni ugovor za kupoprodaju</p>

					<h2>Kreiranje prodaje</h2>

					<p>
						Prodavatelj odabire verificiranu nekretninu u svom vlasništvu i
						određuje prodajnu cijenu.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => {
						setStatusMessage("");
						setSuccessMessage("");
						setErrorMessage("");
						setTransactionHash("");

						void loadEligibleProperties();
					}}
					disabled={isLoading || isSubmitting}
				>
					{isLoading ? "Učitavanje..." : "Osvježi nekretnine"}
				</button>
			</div>

			{isLoading && (
				<p className="transaction-status">
					Učitavaju se verificirane nekretnine...
				</p>
			)}

			{!isLoading && properties.length === 0 && (
				<p className="empty-state">
					Povezani račun nema verificiranu nekretninu dostupnu za prodaju.
				</p>
			)}

			{properties.length > 0 && (
				<form className="property-form sale-form" onSubmit={handleSubmit}>
					<label className="form-field">
						<span>Nekretnina</span>

						<select
							value={selectedPropertyId}
							onChange={(event) => setSelectedPropertyId(event.target.value)}
							disabled={isSubmitting}
							required
						>
							{properties.map((property) => (
								<option
									key={property.id.toString()}
									value={property.id.toString()}
								>
									ID {property.id.toString()} — {property.propertyAddress} —
									čestica {property.parcelNumber}
								</option>
							))}
						</select>
					</label>

					<label className="form-field">
						<span>Prodajna cijena u mEUR</span>

						<input
							type="text"
							inputMode="decimal"
							value={price}
							onChange={(event) => setPrice(event.target.value)}
							placeholder="Primjer: 150000.00"
							disabled={isSubmitting}
							required
						/>

						<small>
							MockEUR koristi dvije decimale. Ovo nisu stvarni euri, nego
							simulirana sredstva za potrebe prototipa.
						</small>
					</label>

					<button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Kreiranje prodaje..." : "Kreiraj prodaju"}
					</button>
				</form>
			)}

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Prodaja je kreirana</strong>
					<p>{successMessage}</p>
				</div>
			)}

			{transactionHash && (
				<div className="blockchain-value">
					<span>Hash transakcije</span>
					<code>{transactionHash}</code>
				</div>
			)}

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
