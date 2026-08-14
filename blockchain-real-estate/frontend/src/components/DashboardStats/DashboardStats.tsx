import { BrowserProvider, Contract } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
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

function getErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Dogodila se neočekivana pogreška.";
}

export default function DashboardStats({
	account,
	applicationProfile,
}: DashboardStatsProps) {
	const [statistics, setStatistics] = useState<Statistic[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const loadStatistics = useCallback(async (): Promise<void> => {
		if (!window.ethereum || !account) {
			return;
		}

		setIsLoading(true);
		setError("");

		try {
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

			const normalizedAccount = account.toLowerCase();

			/*
			 * NEKRETNINE
			 *
			 * VerificationStatus:
			 * 0 = Pending
			 * 1 = Verified
			 * 2 = Rejected
			 */
			const propertyCount: bigint = await propertyRegistry.getPropertyCount();

			let pendingProperties = 0;
			let verifiedProperties = 0;
			let rejectedProperties = 0;
			let ownedProperties = 0;

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				const property = await propertyRegistry.getProperty(propertyId);

				if (!property.exists) {
					continue;
				}

				const verificationStatus = Number(property.verificationStatus);

				if (verificationStatus === 0) {
					pendingProperties++;
				}

				if (verificationStatus === 1) {
					verifiedProperties++;
				}

				if (verificationStatus === 2) {
					rejectedProperties++;
				}

				if (property.digitalOwner.toLowerCase() === normalizedAccount) {
					ownedProperties++;
				}
			}

			/*
			 * PRODAJE
			 *
			 * SaleStatus:
			 * 0 = Created
			 * 1 = Funded
			 * 2 = Completed
			 * 3 = Cancelled
			 */
			const saleCount: bigint = await realEstateEscrow.getSaleCount();

			let activeSales = 0;
			let completedSales = 0;
			let cancelledSales = 0;

			let sellerActiveSales = 0;
			let sellerCompletedSales = 0;

			let buyerAvailableSales = 0;
			let buyerCompletedPurchases = 0;

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				if (!sale.exists) {
					continue;
				}

				const saleStatus = Number(sale.status);

				const isCurrentSeller = sale.seller.toLowerCase() === normalizedAccount;

				const isCurrentBuyer = sale.buyer.toLowerCase() === normalizedAccount;

				if (saleStatus === 0) {
					activeSales++;

					if (isCurrentSeller) {
						sellerActiveSales++;
					}

					if (!isCurrentSeller) {
						buyerAvailableSales++;
					}
				}

				if (saleStatus === 2) {
					completedSales++;

					if (isCurrentSeller) {
						sellerCompletedSales++;
					}

					if (isCurrentBuyer) {
						buyerCompletedPurchases++;
					}
				}

				if (saleStatus === 3) {
					cancelledSales++;
				}
			}

			let profileStatistics: Statistic[] = [];

			switch (applicationProfile) {
				case "Administrator":
					profileStatistics = [
						{
							label: "Ukupno nekretnina",
							value: Number(propertyCount),
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

				case "Prodavatelj":
					profileStatistics = [
						{
							label: "Moje nekretnine",
							value: ownedProperties,
						},
						{
							label: "Aktivne prodaje",
							value: sellerActiveSales,
						},
						{
							label: "Završene prodaje",
							value: sellerCompletedSales,
						},
					];
					break;

				case "Kupac":
					profileStatistics = [
						{
							label: "Moje nekretnine",
							value: ownedProperties,
						},
						{
							label: "Dostupne prodaje",
							value: buyerAvailableSales,
						},
						{
							label: "Završene kupnje",
							value: buyerCompletedPurchases,
						},
					];
					break;

				default:
					profileStatistics = [];
			}

			setStatistics(profileStatistics);
		} catch (caughtError) {
			console.error(caughtError);
			setError(getErrorMessage(caughtError));
		} finally {
			setIsLoading(false);
		}
	}, [account, applicationProfile]);

	useEffect(() => {
		void loadStatistics();
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
