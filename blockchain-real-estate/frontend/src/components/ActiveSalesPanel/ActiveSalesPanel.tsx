import {
	BrowserProvider,
	Contract,
	formatUnits,
	JsonRpcProvider,
} from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";
import { getSaleStatusLabel } from "../../utils/statusLabels";

import "./ActiveSalesPanel.css";

interface ActiveSalesPanelProps {
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

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

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

export default function ActiveSalesPanel({
	account,
	showAll,
}: ActiveSalesPanelProps) {
	const [activeSales, setActiveSales] = useState<ActiveSale[]>([]);

	const [isLoading, setIsLoading] = useState(false);

	const [processingSaleId, setProcessingSaleId] = useState<bigint | null>(null);

	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [transactionHash, setTransactionHash] = useState("");

	/*
	 * Svaki read zahtjev dobiva svoj ID.
	 *
	 * Ako korisnik promijeni MetaMask račun dok se
	 * prethodni podaci još učitavaju, stari rezultat
	 * više ne smije promijeniti stanje novog računa.
	 */
	const requestIdRef = useRef(0);

	const loadActiveSales = useCallback(async (): Promise<void> => {
		if (!account) {
			setActiveSales([]);
			setErrorMessage("");

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * Ovo su samo READ operacije.
			 *
			 * Čitamo izravno s lokalnog Hardhat RPC-a,
			 * ne preko MetaMask BrowserProvidera.
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

			const loadedSales: ActiveSale[] = [];

			const normalizedAccount = account.toLowerCase();

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const exists = sale.exists as boolean;
				const status = Number(sale.status);
				const seller = sale.seller as string;

				/*
				 * SaleStatus:
				 *
				 * 0 = Created
				 * 1 = Funded
				 * 2 = Completed
				 * 3 = Cancelled
				 *
				 * Kod našeg escrow ugovora status Funded je
				 * samo privremen unutar iste transakcije jer se
				 * nakon uplate kupoprodaja odmah završava.
				 *
				 * Zato se u UI-u kao aktivna prodaja prikazuje
				 * samo status Created.
				 */
				const isCreated = status === 0;

				const belongsToConnectedAccount =
					seller.toLowerCase() === normalizedAccount;

				if (!exists || !isCreated || (!showAll && !belongsToConnectedAccount)) {
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

					price: sale.price as bigint,

					propertyAddress: property.propertyAddress as string,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,
				});
			}

			/*
			 * Najnovije aktivne prodaje prikazujemo prve.
			 */
			loadedSales.sort((a, b) => {
				if (a.id === b.id) {
					return 0;
				}

				return a.id > b.id ? -1 : 1;
			});

			if (requestId === requestIdRef.current) {
				setActiveSales(loadedSales);
			}
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setActiveSales([]);
				setErrorMessage(getErrorMessage(error));
			}
		} finally {
			if (requestId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [account, showAll]);

	useEffect(() => {
		setActiveSales([]);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		void loadActiveSales();

		return () => {
			/*
			 * Invalidiramo read zahtjev prethodnog računa
			 * ako još nije završio.
			 */
			requestIdRef.current++;
		};
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

			/*
			 * WRITE operacija:
			 *
			 * ovdje nam MetaMask treba jer prodavatelj
			 * mora potpisati cancelSale transakciju.
			 */
			const walletProvider = new BrowserProvider(window.ethereum);

			const signer = await walletProvider.getSigner();

			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const realEstateEscrowWithSigner = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				signer,
			);

			setStatusMessage("Potvrdi otkazivanje prodaje u MetaMasku...");

			const transaction = await realEstateEscrowWithSigner.cancelSale(sale.id);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			/*
			 * Nakon potvrđene WRITE transakcije stanje ponovno
			 * provjeravamo direktno preko Hardhat RPC-a.
			 */
			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const realEstateEscrowRead = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				readProvider,
			);

			const cancelledSale = await realEstateEscrowRead.getSale(sale.id);

			const cancelledStatus = Number(cancelledSale.status);

			if (cancelledStatus !== 3) {
				throw new Error("Prodaja nije dobila očekivani status Otkazana.");
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

								<span className="status-badge status-pending">
									{getSaleStatusLabel(0)}
								</span>
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
