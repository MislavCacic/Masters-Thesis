import { useCallback, useEffect, useState } from "react";

import { BrowserProvider, Contract, formatUnits } from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { mockEURAbi } from "../../blockchain/mockEURAbi";

import "./AccountBalancePanel.css";

interface AccountBalancePanelProps {
	account: string;
	applicationProfile: string;
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

	return "Dohvat stanja računa nije uspio.";
}

export default function AccountBalancePanel({
	account,
	applicationProfile,
}: AccountBalancePanelProps) {
	const [balance, setBalance] = useState<bigint>(0n);
	const [symbol, setSymbol] = useState("mEUR");
	const [decimals, setDecimals] = useState(2);

	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	const loadBalance = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		setErrorMessage("");

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const provider = new BrowserProvider(window.ethereum);

			const mockEUR = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				provider,
			);

			const [currentBalance, tokenSymbol, tokenDecimals] = await Promise.all([
				mockEUR.balanceOf(account) as Promise<bigint>,
				mockEUR.symbol() as Promise<string>,
				mockEUR.decimals() as Promise<bigint>,
			]);

			setBalance(currentBalance);
			setSymbol(tokenSymbol);
			setDecimals(Number(tokenDecimals));
		} catch (error) {
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsLoading(false);
		}
	}, [account]);

	useEffect(() => {
		void loadBalance();
	}, [loadBalance]);

	return (
		<section className="balance-card">
			<div>
				<p className="eyebrow">Digitalni novčanik</p>

				<h2>Stanje MockEUR računa</h2>

				<p className="balance-description">
					Prikaz simuliranih sredstava povezanog blockchain računa.
				</p>
			</div>

			<div className="balance-summary">
				<div>
					<span>Profil</span>
					<strong>{applicationProfile}</strong>
				</div>

				<div>
					<span>Račun</span>
					<strong>{shortenAddress(account)}</strong>
				</div>

				<div className="balance-amount">
					<span>Raspoloživo stanje</span>

					<strong>
						{isLoading
							? "Učitavanje..."
							: `${formatUnits(balance, decimals)} ${symbol}`}
					</strong>
				</div>
			</div>

			<button
				type="button"
				className="secondary-button balance-refresh"
				onClick={() => void loadBalance()}
				disabled={isLoading}
			>
				{isLoading ? "Osvježavanje..." : "Osvježi stanje"}
			</button>

			<p className="balance-note">
				MockEUR je simulirani token bez stvarne novčane vrijednosti.
			</p>

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
