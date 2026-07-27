import { useCallback, useEffect, useState } from "react";

import { BrowserProvider, Contract, formatUnits } from "ethers";

import { CONTRACT_ADDRESSES } from "../blockchain/contracts";
import { propertyRegistryAbi } from "../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../blockchain/realEstateEscrowAbi";

interface TransactionHistoryPanelProps {
	account: string;
	showAll: boolean;
}

interface CompletedSale {
	id: bigint;
	propertyId: bigint;
	seller: string;
	buyer: string;
	price: bigint;
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

	return "Dohvat završenih kupoprodaja nije uspio.";
}

export default function TransactionHistoryPanel({
	account,
	showAll,
}: TransactionHistoryPanelProps) {
	const [completedSales, setCompletedSales] = useState<CompletedSale[]>([]);

	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const loadCompletedSales = useCallback(async (): Promise<void> => {
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

			const loadedSales: CompletedSale[] = [];

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				const exists = sale.exists as boolean;
				const status = Number(sale.status);
				const seller = sale.seller as string;
				const buyer = sale.buyer as string;

				const isCompleted = status === 2;

				const belongsToConnectedAccount =
					seller.toLowerCase() === account.toLowerCase() ||
					buyer.toLowerCase() === account.toLowerCase();

				if (
					!exists ||
					!isCompleted ||
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

					propertyAddress: property.propertyAddress as string,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,

					currentDigitalOwner: property.digitalOwner as string,
				});
			}

			setCompletedSales(loadedSales);
		} catch (error) {
			setCompletedSales([]);
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, [account, showAll]);

	useEffect(() => {
		void loadCompletedSales();
	}, [loadCompletedSales]);

	return (
		<section className="history-card">
			<div className="history-header">
				<div>
					<p className="eyebrow">Evidencija kupoprodaja</p>

					<h2>Završene transakcije</h2>

					<p>
						Prikaz završenih kupoprodaja i trenutačnog digitalnog vlasnika
						nekretnine.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadCompletedSales()}
					disabled={isLoading}
				>
					{isLoading ? "Učitavanje..." : "Osvježi transakcije"}
				</button>
			</div>

			{isLoading && completedSales.length === 0 && (
				<p className="transaction-status">
					Učitavaju se završene transakcije...
				</p>
			)}

			{!isLoading && completedSales.length === 0 && (
				<p className="empty-state">
					Za povezani račun nema završenih kupoprodaja.
				</p>
			)}

			<div className="property-list">
				{completedSales.map((sale) => {
					const ownershipTransferred =
						sale.currentDigitalOwner.toLowerCase() === sale.buyer.toLowerCase();

					return (
						<article className="property-item" key={sale.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Prodaja ID {sale.id.toString()}
									</span>

									<h3>{sale.propertyAddress}</h3>
								</div>

								<span className="status-badge status-verified">Completed</span>
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
									<dd title={sale.buyer}>{shortenAddress(sale.buyer)}</dd>
								</div>
							</dl>

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
						</article>
					);
				})}
			</div>

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
