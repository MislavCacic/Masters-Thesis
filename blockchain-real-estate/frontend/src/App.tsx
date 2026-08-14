import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import { useCallback, useEffect, useState } from "react";

import "./App.css";
import "./styles/shared.css";

import { CONTRACT_ADDRESSES, HARDHAT_CHAIN_ID } from "./blockchain/contracts";
import { propertyRegistryAbi } from "./blockchain/propertyRegistryAbi";
import ActiveSalesPanel from "./components/ActiveSalesPanel/ActiveSalesPanel";
import CreateSaleForm from "./components/CreateSaleForm/CreateSaleForm";
import DashboardNavigation, {
	type DashboardSection,
} from "./components/DashboardNavigation/DashboardNavigation";
import DashboardOverview from "./components/DashboardOverview/DashboardOverview";
import MintMockEURForm from "./components/MintMockEURForm/MintMockEURForm";
import PropertyPanel from "./components/PropertyPanel/PropertyPanel";
import PurchaseSalePanel from "./components/PurchaseSalePanel/PurchaseSalePanel";
import RegisterPropertyForm from "./components/RegisterPropertyForm/RegisterPropertyForm";
import TransactionHistoryPanel from "./components/TransactionHistoryPanel/TransactionHistoryPanel";
import VerifyPropertiesPanel from "./components/VerifyPropertiesPanel/VerifyPropertiesPanel";

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

const DEMO_ACCOUNTS = {
	seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
	buyer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
} as const;

export default function App() {
	const [account, setAccount] = useState("");
	const [networkName, setNetworkName] = useState("");
	const [roles, setRoles] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [activeSection, setActiveSection] =
		useState<DashboardSection>("overview");

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
			setActiveSection("overview");

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
			setActiveSection("overview");
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

	const normalizedAccount = account.toLowerCase();

	const isAdmin = roles.includes("Administrator");

	const isVerifier = roles.includes("Verifikator");

	const isSeller = normalizedAccount === DEMO_ACCOUNTS.seller.toLowerCase();

	const isBuyer = normalizedAccount === DEMO_ACCOUNTS.buyer.toLowerCase();

	const applicationProfile = isAdmin
		? "Administrator"
		: isVerifier
			? "Verifikator"
			: isSeller
				? "Prodavatelj"
				: isBuyer
					? "Kupac"
					: "Korisnik";

	return (
		<main className="app">
			{/* MetaMask još nije povezan */}
			{!account && (
				<section className="wallet-card">
					<p className="eyebrow">Blockchain kupoprodaja nekretnina</p>

					<h1>Povezivanje digitalnog novčanika</h1>

					<p className="description">
						Poveži MetaMask kako bi aplikacija mogla komunicirati s lokalnim
						pametnim ugovorima.
					</p>

					<button type="button" onClick={connectWallet} disabled={isConnecting}>
						{isConnecting ? "Povezivanje..." : "Poveži MetaMask"}
					</button>

					{error && <p className="error">{error}</p>}
				</section>
			)}

			{/* MetaMask je povezan */}
			{account && (
				<>
					<header className="app-toolbar">
						<div className="wallet-compact">
							<span className="wallet-status-dot" />

							<div className="wallet-compact-text">
								<strong>MetaMask povezan</strong>

								<span>
									{shortenAddress(account)} · {networkName}
								</span>
							</div>

							<button
								type="button"
								className="wallet-compact-refresh"
								onClick={connectWallet}
								disabled={isConnecting}
							>
								{isConnecting ? "..." : "Osvježi"}
							</button>
						</div>

						<DashboardNavigation
							profile={applicationProfile}
							activeSection={activeSection}
							onSectionChange={setActiveSection}
						/>

						<div className="toolbar-profile">
							<strong>{applicationProfile}</strong>
						</div>
					</header>

					{error && <p className="error">{error}</p>}

					<div className="app-content">
						{activeSection === "overview" && (
							<DashboardOverview
								account={account}
								applicationProfile={applicationProfile}
								onSectionChange={setActiveSection}
							/>
						)}

						{activeSection === "all-properties" && isAdmin && (
							<PropertyPanel account={account} showAll />
						)}

						{activeSection === "my-properties" && (isSeller || isBuyer) && (
							<PropertyPanel account={account} showAll={false} />
						)}

						{activeSection === "register-property" && isSeller && (
							<RegisterPropertyForm account={account} />
						)}

						{activeSection === "verification" && isVerifier && (
							<VerifyPropertiesPanel account={account} />
						)}

						{activeSection === "create-sale" && isSeller && (
							<CreateSaleForm account={account} />
						)}

						{activeSection === "active-sales" && isSeller && (
							<ActiveSalesPanel account={account} showAll={false} />
						)}

						{activeSection === "purchase" && isBuyer && (
							<PurchaseSalePanel account={account} />
						)}

						{activeSection === "mockeur" && isAdmin && (
							<MintMockEURForm account={account} />
						)}

						{activeSection === "history" && (
							<TransactionHistoryPanel account={account} showAll={isAdmin} />
						)}
					</div>
				</>
			)}
		</main>
	);
}
