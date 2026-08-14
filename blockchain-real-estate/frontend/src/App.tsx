import {
	BrowserProvider,
	Contract,
	JsonRpcProvider,
	type Eip1193Provider,
} from "ethers";

import { useCallback, useEffect, useRef, useState } from "react";

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

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const DEMO_ACCOUNTS = {
	seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",

	buyer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
} as const;

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

	const [activeSection, setActiveSection] =
		useState<DashboardSection>("overview");

	/*
	 * Svako učitavanje podataka računa dobiva
	 * svoj jedinstveni ID.
	 *
	 * Ako se MetaMask račun promijeni dok prethodni
	 * zahtjev još traje, rezultat starog zahtjeva
	 * više ne smije prepisati stanje novog računa.
	 */
	const accountRequestIdRef = useRef(0);

	const clearWalletData = useCallback((): void => {
		accountRequestIdRef.current++;

		setAccount("");
		setNetworkName("");
		setRoles([]);
		setError("");
	}, []);

	/*
	 * Učitavanje blockchain podataka povezanog računa.
	 *
	 * BrowserProvider koristimo samo kako bismo
	 * provjerili na kojoj je mreži MetaMask.
	 *
	 * Blockchain uloge čitamo izravno s
	 * lokalnog Hardhat JSON-RPC nodea.
	 */
	const loadAccountData = useCallback(
		async (
			selectedAccount: string,
			browserProvider: BrowserProvider,
		): Promise<void> => {
			const requestId = ++accountRequestIdRef.current;

			/* =========================================
			   1. PROVJERA METAMASK MREŽE
			   ========================================= */

			const walletNetwork = await browserProvider.getNetwork();

			if (requestId !== accountRequestIdRef.current) {
				return;
			}

			if (walletNetwork.chainId !== HARDHAT_CHAIN_ID) {
				setAccount("");
				setRoles([]);

				setNetworkName(`Chain ID: ${walletNetwork.chainId.toString()}`);

				throw new Error("Prebaci MetaMask na mrežu Hardhat local.");
			}

			/* =========================================
			   2. DIREKTNO ČITANJE HARDHAT STANJA
			   ========================================= */

			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const blockchainNetwork = await readProvider.getNetwork();

			if (requestId !== accountRequestIdRef.current) {
				return;
			}

			if (blockchainNetwork.chainId !== HARDHAT_CHAIN_ID) {
				throw new Error(
					`Lokalni blockchain koristi neočekivani Chain ID: ${blockchainNetwork.chainId.toString()}.`,
				);
			}

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				readProvider,
			);

			const [adminRole, verifierRole, transferRole] = await Promise.all([
				propertyRegistry.DEFAULT_ADMIN_ROLE(),

				propertyRegistry.VERIFIER_ROLE(),

				propertyRegistry.TRANSFER_ROLE(),
			]);

			if (requestId !== accountRequestIdRef.current) {
				return;
			}

			const [hasAdminRole, hasVerifierRole, hasTransferRole] =
				await Promise.all([
					propertyRegistry.hasRole(adminRole, selectedAccount),

					propertyRegistry.hasRole(verifierRole, selectedAccount),

					propertyRegistry.hasRole(transferRole, selectedAccount),
				]);

			if (requestId !== accountRequestIdRef.current) {
				return;
			}

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
		[],
	);

	/*
	 * Poziva se odmah kada MetaMask prijavi
	 * promjenu računa.
	 */
	const prepareAccountChange = useCallback((selectedAccount: string): void => {
		/*
		 * Invalidiramo sve stare async zahtjeve.
		 */
		accountRequestIdRef.current++;

		/*
		 * Novi račun spremamo odmah kako child
		 * komponente ne bi dobivale adresu
		 * prethodnog korisnika.
		 */
		setAccount(selectedAccount);

		setNetworkName("Hardhat local");

		/*
		 * Uloge će biti ponovno očitane
		 * s blockchaina.
		 */
		setRoles([]);

		setError("");

		/*
		 * Kod promjene računa uvijek se
		 * vraćamo na početni pregled.
		 */
		setActiveSection("overview");
	}, []);

	async function connectWallet(): Promise<void> {
		setError("");

		setIsConnecting(true);

		try {
			if (!window.ethereum) {
				throw new Error("MetaMask nije pronađen u pregledniku.");
			}

			const browserProvider = new BrowserProvider(window.ethereum);

			const accounts = (await browserProvider.send(
				"eth_requestAccounts",
				[],
			)) as string[];

			const selectedAccount = accounts[0];

			if (!selectedAccount) {
				throw new Error("Nije odabran MetaMask račun.");
			}

			prepareAccountChange(selectedAccount);

			await loadAccountData(selectedAccount, browserProvider);
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
			const selectedAccount = accounts[0];

			if (!selectedAccount) {
				clearWalletData();

				setActiveSection("overview");

				return;
			}

			prepareAccountChange(selectedAccount);

			try {
				const browserProvider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, browserProvider);
			} catch (caughtError) {
				setError(getErrorMessage(caughtError));
			}
		}

		async function handleChainChanged(): Promise<void> {
			/*
			 * Promjena mreže invalidira sve
			 * prethodne blockchain zahtjeve.
			 */
			accountRequestIdRef.current++;

			setError("");

			setAccount("");

			setRoles([]);

			setNetworkName("");

			setActiveSection("overview");

			try {
				const accounts = (await ethereumProvider.request({
					method: "eth_accounts",
				})) as string[];

				const selectedAccount = accounts[0];

				if (!selectedAccount) {
					return;
				}

				prepareAccountChange(selectedAccount);

				const browserProvider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, browserProvider);
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

				prepareAccountChange(selectedAccount);

				const browserProvider = new BrowserProvider(ethereumProvider);

				await loadAccountData(selectedAccount, browserProvider);
			} catch (caughtError) {
				setError(getErrorMessage(caughtError));
			}
		}

		ethereumProvider.on("accountsChanged", handleAccountsChanged);

		ethereumProvider.on("chainChanged", handleChainChanged);

		void loadPreviouslyConnectedWallet();

		return () => {
			/*
			 * Invalidiramo eventualni zahtjev koji
			 * još traje tijekom unmounta ili
			 * React StrictMode remounta.
			 */
			accountRequestIdRef.current++;

			ethereumProvider.removeListener("accountsChanged", handleAccountsChanged);

			ethereumProvider.removeListener("chainChanged", handleChainChanged);
		};
	}, [clearWalletData, loadAccountData, prepareAccountChange]);

	const normalizedAccount = account.toLowerCase();

	const isAdmin = roles.includes("Administrator");

	const isVerifier = roles.includes("Verifikator");

	const isSeller = normalizedAccount === DEMO_ACCOUNTS.seller.toLowerCase();

	const isBuyer = normalizedAccount === DEMO_ACCOUNTS.buyer.toLowerCase();

	/*
	 * Prioritet blockchain uloga:
	 *
	 * Administrator
	 * Verifikator
	 *
	 * Prodavatelj i Kupac su demo aplikacijski
	 * profili određeni adresama lokalnih
	 * Hardhat računa.
	 */
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
								key={`overview-${account}-${applicationProfile}`}
								account={account}
								applicationProfile={applicationProfile}
								onSectionChange={setActiveSection}
							/>
						)}

						{activeSection === "all-properties" && isAdmin && (
							<PropertyPanel
								key={`all-properties-${account}`}
								account={account}
								showAll
							/>
						)}

						{activeSection === "my-properties" && (isSeller || isBuyer) && (
							<PropertyPanel
								key={`my-properties-${account}`}
								account={account}
								showAll={false}
							/>
						)}

						{activeSection === "register-property" && isSeller && (
							<RegisterPropertyForm
								key={`register-property-${account}`}
								account={account}
							/>
						)}

						{activeSection === "verification" && isVerifier && (
							<VerifyPropertiesPanel
								key={`verification-${account}`}
								account={account}
							/>
						)}

						{activeSection === "create-sale" && isSeller && (
							<CreateSaleForm
								key={`create-sale-${account}`}
								account={account}
							/>
						)}

						{/* 
							Prodavatelj vidi samo svoje aktivne prodaje.

							Administrator vidi sve aktivne prodaje,
							ali ih ne može otkazivati jer ActiveSalesPanel
							dopušta cancelSale samo stvarnom prodavatelju.
						*/}
						{activeSection === "active-sales" && (isSeller || isAdmin) && (
							<ActiveSalesPanel
								key={`active-sales-${account}`}
								account={account}
								showAll={isAdmin}
							/>
						)}

						{activeSection === "purchase" && isBuyer && (
							<PurchaseSalePanel
								key={`purchase-${account}`}
								account={account}
							/>
						)}

						{activeSection === "mockeur" && isAdmin && (
							<MintMockEURForm key={`mockeur-${account}`} account={account} />
						)}

						{activeSection === "history" &&
							(isAdmin || isSeller || isBuyer) && (
								<TransactionHistoryPanel
									key={`history-${account}`}
									account={account}
									showAll={isAdmin}
								/>
							)}
					</div>
				</>
			)}
		</main>
	);
}
