import { useCallback, useEffect, useState } from "react";

import { BrowserProvider, Contract, formatUnits, ZeroAddress } from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";
import { getSaleStatusLabel } from "../../utils/statusLabels";

import "./TransactionHistoryPanel.css";

interface TransactionHistoryPanelProps {
	account: string;
	showAll: boolean;
}

interface HistoricalSale {
	id: bigint;
	propertyId: bigint;
	seller: string;
	buyer: string;
	price: bigint;
	status: number;
	propertyAddress: string;
	cadastralMunicipality: string;
	parcelNumber: string;
	currentDigitalOwner: string;
}

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

	return "Dohvat povijesti prodaja nije uspio.";
}

export default function TransactionHistoryPanel({
	account,
	showAll,
}: TransactionHistoryPanelProps) {
	const [sales, setSales] = useState<HistoricalSale[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const loadSales = useCallback(async (): Promise<void> => {
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

			const loadedSales: HistoricalSale[] = [];

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				const exists = sale.exists as boolean;
				const status = Number(sale.status);
				const seller = sale.seller as string;
				const buyer = sale.buyer as string;

				const isCompleted = status === 2;
				const isCancelled = status === 3;

				const belongsToConnectedAccount =
					seller.toLowerCase() === account.toLowerCase() ||
					buyer.toLowerCase() === account.toLowerCase();

				if (
					!exists ||
					(!isCompleted && !isCancelled) ||
					(!showAll && !belongsToConnectedAccount)
				) {
					continue;
				}

				const propertyId = sale.propertyId as bigint;

				const property = await propertyRegistry.getProperty(propertyId);

				loadedSales.push({
					id: sale.id as bigint,
					propertyId,
					seller,
					buyer,
					price: sale.price as bigint,
					status,

					propertyAddress: property.propertyAddress as string,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,

					currentDigitalOwner: property.digitalOwner as string,
				});
			}

			setSales(loadedSales);
		} catch (error) {
			setSales([]);
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, [account, showAll]);

	useEffect(() => {
		void loadSales();
	}, [loadSales]);

	return (
		<section className="history-card">
			<div className="history-header">
				<div>
					<p className="eyebrow">Evidencija kupoprodaja</p>

					<h2>Povijest prodaja</h2>

					<p>
						{showAll
							? "Pregled svih završenih i otkazanih prodaja u blockchain sustavu."
							: "Pregled završenih i otkazanih prodaja povezanog računa."}
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadSales()}
					disabled={isLoading}
				>
					{isLoading ? "Učitavanje..." : "Osvježi povijest"}
				</button>
			</div>

			{isLoading && sales.length === 0 && (
				<p className="transaction-status">Učitava se povijest prodaja...</p>
			)}

			{!isLoading && sales.length === 0 && (
				<p className="empty-state">
					Za povezani račun nema završenih ni otkazanih prodaja.
				</p>
			)}

			<div className="property-list">
				{sales.map((sale) => {
					const isCompleted = sale.status === 2;

					const ownershipTransferred =
						sale.currentDigitalOwner.toLowerCase() === sale.buyer.toLowerCase();

					const ownershipRetainedBySeller =
						sale.currentDigitalOwner.toLowerCase() ===
						sale.seller.toLowerCase();

					const hasBuyer =
						sale.buyer.toLowerCase() !== ZeroAddress.toLowerCase();

					return (
						<article className="property-item" key={sale.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Prodaja ID {sale.id.toString()}
									</span>

									<h3>{sale.propertyAddress}</h3>
								</div>

								<span
									className={
										isCompleted
											? "status-badge status-verified"
											: "status-badge status-rejected"
									}
								>
									{getSaleStatusLabel(sale.status)}
								</span>
							</div>

							<dl className="property-details history-details">
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
									<dt>Prodajna cijena</dt>
									<dd>{formatUnits(sale.price, 2)} mEUR</dd>
								</div>

								<div>
									<dt>Prodavatelj</dt>
									<dd title={sale.seller}>{shortenAddress(sale.seller)}</dd>
								</div>

								<div>
									<dt>Kupac</dt>

									<dd title={hasBuyer ? sale.buyer : undefined}>
										{hasBuyer ? shortenAddress(sale.buyer) : "Nije dodijeljen"}
									</dd>
								</div>
							</dl>

							{isCompleted ? (
								<div
									className={
										ownershipTransferred
											? "ownership-confirmation"
											: "ownership-warning"
									}
								>
									<span>Trenutačni digitalni vlasnik</span>

									<strong title={sale.currentDigitalOwner}>
										{shortenAddress(sale.currentDigitalOwner)}
									</strong>

									<p>
										{ownershipTransferred
											? "Digitalno vlasništvo uspješno je preneseno na kupca."
											: "Digitalni vlasnik ne odgovara evidentiranom kupcu."}
									</p>
								</div>
							) : (
								<div
									className={
										ownershipRetainedBySeller
											? "ownership-cancellation"
											: "ownership-warning"
									}
								>
									<span>Trenutačni digitalni vlasnik</span>

									<strong title={sale.currentDigitalOwner}>
										{shortenAddress(sale.currentDigitalOwner)}
									</strong>

									<p>
										{ownershipRetainedBySeller
											? "Prodaja je otkazana. Digitalno vlasništvo ostalo je prodavatelju."
											: "Nakon otkazivanja vlasništvo ne odgovara evidentiranom prodavatelju."}
									</p>
								</div>
							)}
						</article>
					);
				})}
			</div>

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
