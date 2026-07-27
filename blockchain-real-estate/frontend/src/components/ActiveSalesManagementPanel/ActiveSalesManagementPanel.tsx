import { useCallback, useEffect, useState } from "react";

import { BrowserProvider, Contract, formatUnits } from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";

import "./ActiveSalesManagementPanel.css";

interface ActiveSalesManagementPanelProps {
	account: string;
	showAll: boolean;
}

interface ActiveSale {
	id: bigint;
	propertyId: bigint;
	seller: string;
	price: bigint;
	propertyAddress: string;
	cadastralMunicipality: string;
	parcelNumber: string;
}

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

	return "Dohvat ili otkazivanje prodaje nije uspjelo.";
}

export default function ActiveSalesManagementPanel({
	account,
	showAll,
}: ActiveSalesManagementPanelProps) {
	const [activeSales, setActiveSales] = useState<ActiveSale[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const [processingSaleId, setProcessingSaleId] = useState<bigint | null>(null);

	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [transactionHash, setTransactionHash] = useState("");

	const loadActiveSales = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		setErrorMessage("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const provider = new BrowserProvider(window.ethereum);

			const realEstateEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				provider,
			);

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				provider,
			);

			const saleCount = (await realEstateEscrow.getSaleCount()) as bigint;

			const loadedSales: ActiveSale[] = [];

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				const exists = sale.exists as boolean;
				const status = Number(sale.status);
				const seller = sale.seller as string;

				const isCreated = status === 0;

				const belongsToConnectedAccount =
					seller.toLowerCase() === account.toLowerCase();

				if (!exists || !isCreated || (!showAll && !belongsToConnectedAccount)) {
					continue;
				}

				const propertyId = sale.propertyId as bigint;

				const property = await propertyRegistry.getProperty(propertyId);

				loadedSales.push({
					id: sale.id as bigint,
					propertyId,
					seller,
					price: sale.price as bigint,

					propertyAddress: property.propertyAddress as string,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,
				});
			}

			setActiveSales(loadedSales);
		} catch (error) {
			setActiveSales([]);
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, [account, showAll]);

	useEffect(() => {
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		void loadActiveSales();
	}, [loadActiveSales]);

	async function cancelSale(sale: ActiveSale): Promise<void> {
		setProcessingSaleId(sale.id);
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			if (sale.seller.toLowerCase() !== account.toLowerCase()) {
				throw new Error("Samo prodavatelj može otkazati vlastitu prodaju.");
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

			setStatusMessage("Potvrdi otkazivanje prodaje u MetaMasku...");

			const transaction = await realEstateEscrow.cancelSale(sale.id);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			const cancelledSale = await realEstateEscrow.getSale(sale.id);

			const cancelledStatus = Number(cancelledSale.status);

			if (cancelledStatus !== 3) {
				throw new Error("Prodaja nije dobila očekivani status Cancelled.");
			}

			setStatusMessage("");

			setSuccessMessage(
				`Prodaja ID ${sale.id.toString()} uspješno je otkazana. Nekretnina ID ${sale.propertyId.toString()} ponovno je dostupna za kreiranje prodaje.`,
			);

			await loadActiveSales();
		} catch (error) {
			setStatusMessage("");
			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingSaleId(null);
		}
	}

	return (
		<section className="active-sales-card">
			<div className="active-sales-header">
				<div>
					<p className="eyebrow">Upravljanje prodajama</p>

					<h2>Aktivne prodaje</h2>

					<p>
						{showAll
							? "Administrator pregledava sve aktivne prodaje u sustavu."
							: "Prodavatelj pregledava i po potrebi otkazuje svoje aktivne prodaje."}
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadActiveSales()}
					disabled={isLoading || processingSaleId !== null}
				>
					{isLoading ? "Učitavanje..." : "Osvježi prodaje"}
				</button>
			</div>

			{isLoading && activeSales.length === 0 && (
				<p className="transaction-status">Učitavaju se aktivne prodaje...</p>
			)}

			{!isLoading && activeSales.length === 0 && (
				<p className="empty-state">
					{showAll
						? "U sustavu trenutačno nema aktivnih prodaja."
						: "Povezani račun trenutačno nema aktivnih prodaja."}
				</p>
			)}

			<div className="property-list">
				{activeSales.map((sale) => {
					const isSeller = sale.seller.toLowerCase() === account.toLowerCase();

					const isProcessing = processingSaleId === sale.id;

					return (
						<article className="property-item" key={sale.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Prodaja ID {sale.id.toString()}
									</span>

									<h3>{sale.propertyAddress}</h3>
								</div>

								<span className="status-badge status-pending">Created</span>
							</div>

							<dl className="property-details active-sale-details">
								<div>
									<dt>Nekretnina ID</dt>

									<dd>{sale.propertyId.toString()}</dd>
								</div>

								<div>
									<dt>Katastarska općina</dt>

									<dd>{sale.cadastralMunicipality}</dd>
								</div>

								<div>
									<dt>Broj čestice</dt>

									<dd>{sale.parcelNumber}</dd>
								</div>

								<div>
									<dt>Prodavatelj</dt>

									<dd title={sale.seller}>{shortenAddress(sale.seller)}</dd>
								</div>

								<div>
									<dt>Prodajna cijena</dt>

									<dd>{formatUnits(sale.price, 2)} mEUR</dd>
								</div>
							</dl>

							{isSeller ? (
								<button
									type="button"
									className="cancel-sale-button"
									disabled={processingSaleId !== null}
									onClick={() => void cancelSale(sale)}
								>
									{isProcessing ? "Otkazivanje u tijeku..." : "Otkaži prodaju"}
								</button>
							) : (
								<p className="admin-view-note">
									Administrator može pregledavati prodaju, ali samo prodavatelj
									može je otkazati.
								</p>
							)}
						</article>
					);
				})}
			</div>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Prodaja je otkazana</strong>

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
