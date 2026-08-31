import { Contract, formatUnits, JsonRpcProvider, ZeroAddress } from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

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

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

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

	/*
	 * Svako učitavanje dobiva vlastiti ID.
	 *
	 * Ako se MetaMask račun promijeni dok stari
	 * blockchain zahtjev još traje, rezultat starog
	 * zahtjeva neće prepisati podatke novog računa.
	 */
	const requestIdRef = useRef(0);

	const loadSales = useCallback(async (): Promise<void> => {
		if (!account) {
			setSales([]);
			setErrorMessage("");
			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * Povijest samo čita blockchain podatke,
			 * zato se direktno povezujemo na Hardhat RPC.
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

			if (requestId !== requestIdRef.current) {
				return;
			}

			const loadedSales: HistoricalSale[] = [];

			const normalizedAccount = account.toLowerCase();

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const exists = sale.exists as boolean;
				const status = Number(sale.status);
				const seller = sale.seller as string;
				const buyer = sale.buyer as string;

				/*
				 * SaleStatus:
				 *
				 * 0 = Created
				 * 1 = Funded
				 * 2 = Completed
				 * 3 = Cancelled
				 */

				const isCompleted = status === 2;
				const isCancelled = status === 3;

				const belongsToConnectedAccount =
					seller.toLowerCase() === normalizedAccount ||
					buyer.toLowerCase() === normalizedAccount;

				if (
					!exists ||
					(!isCompleted && !isCancelled) ||
					(!showAll && !belongsToConnectedAccount)
				) {
					continue;
				}

				const propertyId = sale.propertyId as bigint;

				const property = await propertyRegistry.getProperty(propertyId);

				if (requestId !== requestIdRef.current) {
					return;
				}

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

			/*
			 * Najnovije prodaje se prikazuju prve.
			 */
			loadedSales.sort((a, b) => {
				if (a.id === b.id) {
					return 0;
				}

				return a.id > b.id ? -1 : 1;
			});

			if (requestId === requestIdRef.current) {
				setSales(loadedSales);
			}
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setSales([]);
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
		 * Kod promjene računa odmah se uklanja povijest
		 * prethodno povezanog računa.
		 */
		setSales([]);
		setErrorMessage("");

		void loadSales();

		return () => {
			requestIdRef.current++;
		};
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
					{showAll
						? "U sustavu trenutačno nema završenih ni otkazanih prodaja."
						: "Za povezani račun nema završenih ni otkazanih prodaja."}
				</p>
			)}

			<div className="property-list">
				{sales.map((sale) => {
					const isCompleted = sale.status === 2;

					const hasBuyer =
						sale.buyer.toLowerCase() !== ZeroAddress.toLowerCase();

					const ownershipTransferred =
						hasBuyer &&
						sale.currentDigitalOwner.toLowerCase() === sale.buyer.toLowerCase();

					const ownershipRetainedBySeller =
						sale.currentDigitalOwner.toLowerCase() ===
						sale.seller.toLowerCase();

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
											: "Nekretnina je nakon ove kupoprodaje možda naknadno prenesena drugom digitalnom vlasniku."}
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
											: "Nakon otkazivanja trenutačni digitalni vlasnik nije evidentirani prodavatelj."}
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
