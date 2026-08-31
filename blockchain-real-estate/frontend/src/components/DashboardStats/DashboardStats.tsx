import { Contract, JsonRpcProvider } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";

import "./DashboardStats.css";

interface DashboardStatsProps {
	account: string;
	applicationProfile: string;
}

interface Statistic {
	label: string;
	value: number;
}

interface PropertySnapshot {
	exists: boolean;
	digitalOwner: string;
	verificationStatus: number;
}

interface SaleSnapshot {
	exists: boolean;
	seller: string;
	buyer: string;
	status: number;
}

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

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

	return "Dohvat blockchain statistike nije uspio.";
}

export default function DashboardStats({
	account,
	applicationProfile,
}: DashboardStatsProps) {
	const [statistics, setStatistics] = useState<Statistic[]>([]);

	const [isLoading, setIsLoading] = useState(false);

	const [error, setError] = useState("");

	/*
	 * ID trenutačnog zahtjeva.
	 *
	 * Ako korisnik promijeni račun dok traje staro
	 * učitavanje, rezultat starog zahtjeva se ignorira.
	 */
	const requestIdRef = useRef(0);

	const loadStatistics = useCallback(async (): Promise<void> => {
		if (!account) {
			setStatistics([]);
			setError("");

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setError("");

		try {
			/*
			 * READ operacije idu izravno na lokalni
			 * Hardhat JSON-RPC node.
			 *
			 * MetaMask za ovo nije potreban jer se
			 * ne potpisuje nikakva transakcija.
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

			const realEstateEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				provider,
			);

			const normalizedAccount = account.toLowerCase();

			/* ======================================
			   BROJ ZAPISA
			   ====================================== */

			const [propertyCount, saleCount] = await Promise.all([
				propertyRegistry.getPropertyCount() as Promise<bigint>,

				realEstateEscrow.getSaleCount() as Promise<bigint>,
			]);

			if (requestId !== requestIdRef.current) {
				return;
			}

			/* ======================================
			   NEKRETNINE
			   ====================================== */

			const propertyRequests: Promise<PropertySnapshot>[] = [];

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				propertyRequests.push(
					(async () => {
						const property = await propertyRegistry.getProperty(propertyId);

						return {
							exists: property.exists as boolean,

							digitalOwner: property.digitalOwner as string,

							verificationStatus: Number(property.verificationStatus),
						};
					})(),
				);
			}

			const properties = await Promise.all(propertyRequests);

			if (requestId !== requestIdRef.current) {
				return;
			}

			let existingProperties = 0;

			let pendingProperties = 0;
			let verifiedProperties = 0;
			let rejectedProperties = 0;

			let ownedProperties = 0;

			for (const property of properties) {
				if (!property.exists) {
					continue;
				}

				existingProperties++;

				if (property.verificationStatus === 0) {
					pendingProperties++;
				}

				if (property.verificationStatus === 1) {
					verifiedProperties++;
				}

				if (property.verificationStatus === 2) {
					rejectedProperties++;
				}

				if (property.digitalOwner.toLowerCase() === normalizedAccount) {
					ownedProperties++;
				}
			}

			/* ======================================
			   PRODAJE
			   ====================================== */

			const saleRequests: Promise<SaleSnapshot>[] = [];

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				saleRequests.push(
					(async () => {
						const sale = await realEstateEscrow.getSale(saleId);

						return {
							exists: sale.exists as boolean,

							seller: sale.seller as string,

							buyer: sale.buyer as string,

							status: Number(sale.status),
						};
					})(),
				);
			}

			const sales = await Promise.all(saleRequests);

			if (requestId !== requestIdRef.current) {
				return;
			}

			/*
			 * Globalne statistike koriste se za
			 * administratorski pregled.
			 */
			let activeSales = 0;
			let completedSales = 0;
			let cancelledSales = 0;

			/*
			 * Statistike običnog Korisnika.
			 *
			 * Kupac i Prodavatelj više nisu trajni
			 * frontend profili.
			 *
			 * Ista Ethereum adresa može istovremeno:
			 *
			 * - prodavati vlastitu nekretninu
			 * - kupovati nekretninu drugog korisnika
			 */
			let userActiveSales = 0;
			let userCompletedSales = 0;

			let userAvailableSales = 0;
			let userCompletedPurchases = 0;

			for (const sale of sales) {
				if (!sale.exists) {
					continue;
				}

				const normalizedSeller = sale.seller.toLowerCase();

				const normalizedBuyer = sale.buyer.toLowerCase();

				const isCurrentSeller = normalizedSeller === normalizedAccount;

				const isCurrentBuyer = normalizedBuyer === normalizedAccount;

				/*
				 * SaleStatus:
				 *
				 * 0 = Created
				 * 1 = Funded
				 * 2 = Completed
				 * 3 = Cancelled
				 */

				if (sale.status === 0 || sale.status === 1) {
					activeSales++;

					/*
					 * Ako je povezani račun prodavatelj,
					 * prodaja pripada njegovim aktivnim
					 * prodajama.
					 */
					if (isCurrentSeller) {
						userActiveSales++;
					}

					/*
					 * Korisniku su za kupnju dostupne
					 * samo aktivne prodaje drugih
					 * korisnika.
					 *
					 * Vlastita nekretnina se ne prikazuje
					 * kao dostupnu za kupnju.
					 */
					if (!isCurrentSeller) {
						userAvailableSales++;
					}
				}

				if (sale.status === 2) {
					completedSales++;

					/*
					 * Ista završena transakcija može
					 * predstavljati prodaju za jednu
					 * adresu i kupnju za drugu.
					 */
					if (isCurrentSeller) {
						userCompletedSales++;
					}

					if (isCurrentBuyer) {
						userCompletedPurchases++;
					}
				}

				if (sale.status === 3) {
					cancelledSales++;
				}
			}

			/* ======================================
			   STATISTIKA PREMA PROFILU
			   ====================================== */

			let profileStatistics: Statistic[] = [];

			switch (applicationProfile) {
				case "Administrator":
					profileStatistics = [
						{
							label: "Ukupno nekretnina",
							value: existingProperties,
						},
						{
							label: "Aktivne prodaje",
							value: activeSales,
						},
						{
							label: "Završene prodaje",
							value: completedSales,
						},
						{
							label: "Otkazane prodaje",
							value: cancelledSales,
						},
					];

					break;

				case "Verifikator":
					profileStatistics = [
						{
							label: "Čeka provjeru",
							value: pendingProperties,
						},
						{
							label: "Potvrđene",
							value: verifiedProperties,
						},
						{
							label: "Odbijene",
							value: rejectedProperties,
						},
					];

					break;

				case "Korisnik":
					profileStatistics = [
						{
							label: "Moje nekretnine",
							value: ownedProperties,
						},
						{
							label: "Moje aktivne prodaje",
							value: userActiveSales,
						},
						{
							label: "Dostupne prodaje",
							value: userAvailableSales,
						},
						{
							label: "Moje završene prodaje",
							value: userCompletedSales,
						},
						{
							label: "Moje završene kupnje",
							value: userCompletedPurchases,
						},
					];

					break;

				default:
					profileStatistics = [];
			}

			if (requestId === requestIdRef.current) {
				setStatistics(profileStatistics);
			}
		} catch (caughtError) {
			if (requestId === requestIdRef.current) {
				console.error(caughtError);

				setStatistics([]);

				setError(getErrorMessage(caughtError));
			}
		} finally {
			if (requestId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [account, applicationProfile]);

	useEffect(() => {
		setStatistics([]);
		setError("");

		void loadStatistics();

		return () => {
			requestIdRef.current++;
		};
	}, [loadStatistics]);

	return (
		<section className="dashboard-stats">
			<div className="dashboard-stats-header">
				<div>
					<p className="dashboard-stats-eyebrow">Blockchain podaci</p>

					<h3>Sažetak sustava</h3>
				</div>

				<button
					type="button"
					className="dashboard-stats-refresh"
					onClick={() => void loadStatistics()}
					disabled={isLoading}
				>
					{isLoading ? "Osvježavanje..." : "Osvježi"}
				</button>
			</div>

			{error && <p className="dashboard-stats-error">{error}</p>}

			{!error && (
				<div className="dashboard-stats-grid">
					{statistics.map((statistic) => (
						<div key={statistic.label} className="dashboard-stat-card">
							<span>{statistic.label}</span>

							<strong>{isLoading ? "..." : statistic.value}</strong>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
