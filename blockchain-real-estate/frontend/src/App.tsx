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
	 * Posebne blockchain uloge čitamo izravno
	 * s lokalnog Hardhat JSON-RPC nodea.
	 *
	 * Administrator i Verifikator imaju posebne
	 * blockchain uloge.
	 *
	 * Svaki ostali MetaMask račun tretira se kao
	 * obični Korisnik koji može istovremeno
	 * sudjelovati kao kupac i prodavatelj.
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

			/*
			 * TRANSFER_ROLE nije korisnička uloga.
			 *
			 * Ona pripada escrow pametnom ugovoru koji
			 * automatski izvršava prijenos digitalnog
			 * vlasništva.
			 *
			 * Za određivanje frontend profila zato
			 * provjeravamo samo Administratora
			 * i Verifikatora.
			 */
			const [adminRole, verifierRole] = await Promise.all([
				propertyRegistry.DEFAULT_ADMIN_ROLE(),
				propertyRegistry.VERIFIER_ROLE(),
			]);

			if (requestId !== accountRequestIdRef.current) {
				return;
			}

			const [hasAdminRole, hasVerifierRole] = await Promise.all([
				propertyRegistry.hasRole(adminRole, selectedAccount),
				propertyRegistry.hasRole(verifierRole, selectedAccount),
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

			/*
			 * Svaki račun bez posebne administrativne
			 * ili verifikatorske uloge obični je Korisnik.
			 *
			 * Korisnik nije trajno označen kao Kupac
			 * ili Prodavatelj.
			 *
			 * Njegova uloga ovisi o konkretnoj radnji:
			 *
			 * - kada registrira i prodaje vlastitu
			 *   nekretninu nastupa kao prodavatelj
			 *
			 * - kada kupuje nekretninu drugog korisnika
			 *   nastupa kao kupac
			 */
			if (!hasAdminRole && !hasVerifierRole) {
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

	const isAdmin = roles.includes("Administrator");

	const isVerifier = roles.includes("Verifikator");

	const isUser = roles.includes("Korisnik");

	/*
	 * Frontend sada ima samo tri profila:
	 *
	 * Administrator
	 * Verifikator
	 * Korisnik
	 *
	 * Kupac i Prodavatelj više nisu trajni
	 * profili vezani uz unaprijed definirane
	 * Ethereum adrese.
	 *
	 * Obični Korisnik može obavljati obje vrste
	 * aktivnosti ovisno o konkretnoj transakciji.
	 */
	const applicationProfile = isAdmin
		? "Administrator"
		: isVerifier
			? "Verifikator"
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

						{/* Administrator vidi sve registrirane nekretnine. */}
						{activeSection === "all-properties" && isAdmin && (
							<PropertyPanel
								key={`all-properties-${account}`}
								account={account}
								showAll
							/>
						)}

						{/* Korisnik vidi samo nekretnine čiji je trenutni digitalni vlasnik. */}
						{activeSection === "my-properties" && isUser && (
							<PropertyPanel
								key={`my-properties-${account}`}
								account={account}
								showAll={false}
							/>
						)}

						{/* Svaki obični Korisnik može registrirati novu nekretninu. */}
						{activeSection === "register-property" && isUser && (
							<RegisterPropertyForm
								key={`register-property-${account}`}
								account={account}
							/>
						)}

						{/* Dokumentaciju potvrđuje samo Verifikator. */}
						{activeSection === "verification" && isVerifier && (
							<VerifyPropertiesPanel
								key={`verification-${account}`}
								account={account}
							/>
						)}

						{/* Korisnik može ponuditi na prodaju vlastitu potvrđenu nekretninu. */}
						{activeSection === "create-sale" && isUser && (
							<CreateSaleForm
								key={`create-sale-${account}`}
								account={account}
							/>
						)}

						{/*
						 * Korisnik vidi samo svoje aktivne prodaje.
						 *
						 * Administrator vidi sve aktivne prodaje,
						 * ali ih ne može otkazivati jer ActiveSalesPanel
						 * dopušta cancelSale samo stvarnom prodavatelju.
						 */}
						{activeSection === "active-sales" && (isUser || isAdmin) && (
							<ActiveSalesPanel
								key={`active-sales-${account}`}
								account={account}
								showAll={isAdmin}
							/>
						)}

						{/*
						 * Svaki obični Korisnik može pregledavati
						 * aktivne prodaje drugih korisnika i kupovati
						 * nekretnine koje nisu u njegovom vlasništvu.
						 */}
						{activeSection === "purchase" && isUser && (
							<PurchaseSalePanel
								key={`purchase-${account}`}
								account={account}
							/>
						)}

						{/* MockEUR dodjeljuje samo Administrator. */}
						{activeSection === "mockeur" && isAdmin && (
							<MintMockEURForm key={`mockeur-${account}`} account={account} />
						)}

						{/*
						 * Administrator vidi cjelokupnu povijest.
						 *
						 * Obični Korisnik vidi prodaje i kupnje
						 * povezane s vlastitom Ethereum adresom.
						 */}
						{activeSection === "history" && (isAdmin || isUser) && (
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
