import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import { useCallback, useEffect, useState } from "react";

import "./App.css";

import { CONTRACT_ADDRESSES, HARDHAT_CHAIN_ID } from "./blockchain/contracts";
import { propertyRegistryAbi } from "./blockchain/propertyRegistryAbi";

interface MetaMaskProvider extends Eip1193Provider {
	on(
		eventName: "accountsChanged",
		listener: (accounts: string[]) => void,
	): void;

	on(eventName: "chainChanged", listener: (chainId: string) => void): void;

	removeListener(
		eventName: "accountsChanged",
		listener: (accounts: string[]) => void,
	): void;

	removeListener(
		eventName: "chainChanged",
		listener: (chainId: string) => void,
	): void;
}

declare global {
	interface Window {
		ethereum?: MetaMaskProvider;
	}
}

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Dogodila se neočekivana pogreška.";
}

export default function App() {
	const [account, setAccount] = useState("");
	const [networkName, setNetworkName] = useState("");
	const [roles, setRoles] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);

	const clearWalletData = useCallback((): void => {
		setAccount("");
		setNetworkName("");
		setRoles([]);
	}, []);

	const loadAccountData = useCallback(
		async (
			selectedAccount: string,
			provider: BrowserProvider,
		): Promise<void> => {
			const network = await provider.getNetwork();

			if (network.chainId !== HARDHAT_CHAIN_ID) {
				clearWalletData();

				setNetworkName(`Chain ID: ${network.chainId.toString()}`);

				throw new Error("Prebaci MetaMask na mrežu Hardhat local.");
			}

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				provider,
			);

			const [adminRole, verifierRole, transferRole] = await Promise.all([
				propertyRegistry.DEFAULT_ADMIN_ROLE(),
				propertyRegistry.VERIFIER_ROLE(),
				propertyRegistry.TRANSFER_ROLE(),
			]);

			const [hasAdminRole, hasVerifierRole, hasTransferRole] =
				await Promise.all([
					propertyRegistry.hasRole(adminRole, selectedAccount),
					propertyRegistry.hasRole(verifierRole, selectedAccount),
					propertyRegistry.hasRole(transferRole, selectedAccount),
				]);

			const detectedRoles: string[] = [];

			if (hasAdminRole) {
				detectedRoles.push("Administrator");
			}

			if (hasVerifierRole) {
				detectedRoles.push("Verifikator");
			}

			if (hasTransferRole) {
				detectedRoles.push("Prijenos vlasništva");
			}

			if (detectedRoles.length === 0) {
				detectedRoles.push("Korisnik");
			}

			setAccount(selectedAccount);
			setNetworkName("Hardhat local");
			setRoles(detectedRoles);
		},
		[clearWalletData],
	);

	async function connectWallet(): Promise<void> {
		setError("");
		setIsConnecting(true);

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const provider = new BrowserProvider(window.ethereum);

			await provider.send("eth_requestAccounts", []);

			const signer = await provider.getSigner();
			const selectedAccount = await signer.getAddress();

			await loadAccountData(selectedAccount, provider);
		} catch (caughtError) {
			setError(getErrorMessage(caughtError));
		} finally {
			setIsConnecting(false);
		}
	}

	useEffect(() => {
		const detectedProvider = window.ethereum;

		if (!detectedProvider) {
			return;
		}

		const ethereumProvider: MetaMaskProvider = detectedProvider;

		async function handleAccountsChanged(accounts: string[]): Promise<void> {
			setError("");

			const selectedAccount = accounts[0];

			if (!selectedAccount) {
				clearWalletData();
				return;
			}

			try {
				const provider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, provider);
			} catch (caughtError) {
				setError(getErrorMessage(caughtError));
			}
		}

		async function handleChainChanged(): Promise<void> {
			setError("");
			clearWalletData();

			try {
				const accounts = (await ethereumProvider.request({
					method: "eth_accounts",
				})) as string[];

				const selectedAccount = accounts[0];

				if (!selectedAccount) {
					return;
				}

				const provider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, provider);
			} catch (caughtError) {
				setError(getErrorMessage(caughtError));
			}
		}

		async function loadPreviouslyConnectedWallet(): Promise<void> {
			try {
				const accounts = (await ethereumProvider.request({
					method: "eth_accounts",
				})) as string[];

				const selectedAccount = accounts[0];

				if (!selectedAccount) {
					return;
				}

				const provider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, provider);
			} catch (caughtError) {
				setError(getErrorMessage(caughtError));
			}
		}

		ethereumProvider.on("accountsChanged", handleAccountsChanged);

		ethereumProvider.on("chainChanged", handleChainChanged);

		void loadPreviouslyConnectedWallet();

		return () => {
			ethereumProvider.removeListener("accountsChanged", handleAccountsChanged);

			ethereumProvider.removeListener("chainChanged", handleChainChanged);
		};
	}, [clearWalletData, loadAccountData]);

	return (
		<main className="app">
			<section className="wallet-card">
				<p className="eyebrow">Blockchain kupoprodaja nekretnina</p>

				<h1>Povezivanje digitalnog novčanika</h1>

				<p className="description">
					Poveži MetaMask kako bi aplikacija mogla komunicirati s lokalnim
					pametnim ugovorima.
				</p>

				<button type="button" onClick={connectWallet} disabled={isConnecting}>
					{isConnecting
						? "Povezivanje..."
						: account
							? "Osvježi podatke računa"
							: "Poveži MetaMask"}
				</button>

				{account && (
					<div className="connection-details">
						<p>
							<span>Račun</span>

							<strong>{shortenAddress(account)}</strong>
						</p>

						<p>
							<span>Mreža</span>
							<strong>{networkName}</strong>
						</p>

						<p>
							<span>Uloge</span>
							<strong>{roles.join(", ")}</strong>
						</p>

						<p className="success">MetaMask je uspješno povezan.</p>
					</div>
				)}

				{error && <p className="error">{error}</p>}
			</section>
		</main>
	);
}
