import { Contract, JsonRpcProvider, formatUnits } from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { mockEURAbi } from "../../blockchain/mockEURAbi";

import "./AccountBalancePanel.css";

interface AccountBalancePanelProps {
	account: string;
	applicationProfile: string;
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

	/*
	 * Svako učitavanje dobiva vlastiti ID.
	 *
	 * Ako se račun promijeni dok traje prethodni
	 * blockchain zahtjev, stari rezultat se ignorira.
	 */
	const requestIdRef = useRef(0);

	const loadBalance = useCallback(async (): Promise<void> => {
		if (!account) {
			setBalance(0n);
			setErrorMessage("");

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * READ operacija ide izravno na
			 * lokalni Hardhat JSON-RPC node.
			 *
			 * MetaMask nije potreban jer ovdje
			 * ne potpisujemo transakciju.
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

			if (requestId !== requestIdRef.current) {
				return;
			}

			setBalance(currentBalance);

			setSymbol(tokenSymbol);

			setDecimals(Number(tokenDecimals));
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setBalance(0n);

				setErrorMessage(getErrorMessage(error));
			}
		} finally {
			if (requestId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [account]);

	useEffect(() => {
		/*
		 * Kod promjene računa odmah uklanjamo
		 * prikaz prethodnog salda.
		 */
		setBalance(0n);
		setErrorMessage("");

		void loadBalance();

		return () => {
			/*
			 * Invalidiramo eventualni stari zahtjev
			 * koji još traje.
			 */
			requestIdRef.current++;
		};
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

					<strong title={account}>{shortenAddress(account)}</strong>
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
