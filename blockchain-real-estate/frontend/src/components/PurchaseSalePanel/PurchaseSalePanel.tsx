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

import { mockEURAbi } from "../../blockchain/mockEURAbi";
import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";
import { getSaleStatusLabel } from "../../utils/statusLabels";

import "./PurchaseSalePanel.css";

interface PurchaseSalePanelProps {
	account: string;
}

interface PurchaseConditions {
	saleExists: boolean;
	saleActive: boolean;
	documentsValid: boolean;
	sellerIsOwner: boolean;
	buyerIsNotSeller: boolean;
	buyerHasSufficientBalance: boolean;
	buyerHasSufficientAllowance: boolean;
	readyForPurchase: boolean;
}

interface ActiveSale {
	id: bigint;
	propertyId: bigint;
	seller: string;
	price: bigint;
	propertyAddress: string;
	cadastralMunicipality: string;
	parcelNumber: string;
	conditions: PurchaseConditions;
}

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

function shortenAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getConditionLabel(value: boolean): string {
	return value ? "Zadovoljeno" : "Nije zadovoljeno";
}

function getConditionClass(value: boolean): string {
	return value ? "verified" : "rejected";
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

	return "Blockchain transakcija nije uspjela.";
}

export default function PurchaseSalePanel({ account }: PurchaseSalePanelProps) {
	const [sales, setSales] = useState<ActiveSale[]>([]);

	const [buyerBalance, setBuyerBalance] = useState<bigint>(0n);

	const [escrowAllowance, setEscrowAllowance] = useState<bigint>(0n);

	const [isLoading, setIsLoading] = useState(false);

	const [processingAction, setProcessingAction] = useState("");

	const [statusMessage, setStatusMessage] = useState("");

	const [successMessage, setSuccessMessage] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	const [transactionHash, setTransactionHash] = useState("");

	/*
	 * Svako učitavanje dobiva vlastiti ID.
	 *
	 * Ako se MetaMask račun promijeni dok prethodni
	 * blockchain zahtjev još traje, stari rezultat
	 * ne smije prepisati podatke novog računa.
	 */
	const requestIdRef = useRef(0);

	const loadPurchaseData = useCallback(async (): Promise<void> => {
		if (!account) {
			setSales([]);
			setBuyerBalance(0n);
			setEscrowAllowance(0n);

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * Sve READ operacije se čitaju izravno
			 * s lokalnog Hardhat RPC-a.
			 *
			 * Za njih MetaMask nije potreban.
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

			const [balance, allowance, saleCount] = await Promise.all([
				mockEUR.balanceOf(account) as Promise<bigint>,

				mockEUR.allowance(
					account,
					CONTRACT_ADDRESSES.realEstateEscrow,
				) as Promise<bigint>,

				realEstateEscrow.getSaleCount() as Promise<bigint>,
			]);

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
				 * Kupcu prikazujemo samo Created.
				 */
				const isCreated = status === 0;

				const belongsToAnotherAccount =
					seller.toLowerCase() !== normalizedAccount;

				if (!exists || !isCreated || !belongsToAnotherAccount) {
					continue;
				}

				const propertyId = sale.propertyId as bigint;

				/*
				 * frontend NE računa sam
				 * uvjete kupoprodaje.
				 *
				 * getPurchaseConditions()
				 * ih vraća iz smart contracta.
				 */
				const [property, blockchainConditions] = await Promise.all([
					propertyRegistry.getProperty(propertyId),

					realEstateEscrow.getPurchaseConditions(saleId, account),
				]);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const conditions: PurchaseConditions = {
					saleExists: blockchainConditions.saleExists as boolean,

					saleActive: blockchainConditions.saleActive as boolean,

					documentsValid: blockchainConditions.documentsValid as boolean,

					sellerIsOwner: blockchainConditions.sellerIsOwner as boolean,

					buyerIsNotSeller: blockchainConditions.buyerIsNotSeller as boolean,

					buyerHasSufficientBalance:
						blockchainConditions.buyerHasSufficientBalance as boolean,

					buyerHasSufficientAllowance:
						blockchainConditions.buyerHasSufficientAllowance as boolean,

					readyForPurchase: blockchainConditions.readyForPurchase as boolean,
				};

				loadedSales.push({
					id: sale.id as bigint,

					propertyId,

					seller,

					price: sale.price as bigint,

					propertyAddress: property.propertyAddress as string,

					cadastralMunicipality: property.cadastralMunicipality as string,

					parcelNumber: property.parcelNumber as string,

					conditions,
				});
			}

			/*
			 * Novije prodaje se prikazuju prve.
			 */
			loadedSales.sort((a, b) => {
				if (a.id === b.id) {
					return 0;
				}

				return a.id > b.id ? -1 : 1;
			});

			if (requestId === requestIdRef.current) {
				setBuyerBalance(balance);

				setEscrowAllowance(allowance);

				setSales(loadedSales);
			}
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setSales([]);

				setBuyerBalance(0n);

				setEscrowAllowance(0n);

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
		 * Odmah se čiste podaci prethodnog
		 * MetaMask računa.
		 */
		setSales([]);

		setBuyerBalance(0n);

		setEscrowAllowance(0n);

		setStatusMessage("");

		setSuccessMessage("");

		setErrorMessage("");

		setTransactionHash("");

		setProcessingAction("");

		void loadPurchaseData();

		return () => {
			/*
			 * Invalidira se eventualni stari
			 * READ zahtjev.
			 */
			requestIdRef.current++;
		};
	}, [loadPurchaseData]);

	async function getSignerContracts(): Promise<{
		mockEUR: Contract;
		realEstateEscrow: Contract;
	}> {
		if (!window.ethereum) {
			throw new Error("MetaMask nije pronađen u pregledniku.");
		}

		/*
		 * MetaMask se koristi samo za WRITE
		 * transakcije koje korisnik mora potpisati.
		 */
		const provider = new BrowserProvider(window.ethereum);

		const signer = await provider.getSigner();

		const signerAddress = await signer.getAddress();

		if (signerAddress.toLowerCase() !== account.toLowerCase()) {
			throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
		}

		return {
			mockEUR: new Contract(CONTRACT_ADDRESSES.mockEUR, mockEURAbi, signer),

			realEstateEscrow: new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				signer,
			),
		};
	}

	async function approveSale(sale: ActiveSale): Promise<void> {
		setProcessingAction(`approve-${sale.id.toString()}`);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		try {
			/*
			 * Ovo je samo pomoćna frontend
			 * zaštita.
			 *
			 * Stvarni uvjeti ostaju pod
			 * kontrolom smart contracta.
			 */
			if (!sale.conditions.buyerHasSufficientBalance) {
				throw new Error(
					"Kupac nema dovoljno MockEUR sredstava za ovu prodaju.",
				);
			}

			const { mockEUR } = await getSignerContracts();

			setStatusMessage("Potvrdi odobrenje MockEUR tokena u MetaMasku...");

			/*
			 * Kupac odobrava samo točan iznos
			 * potreban za ovu kupoprodaju.
			 */
			const transaction = await mockEUR.approve(
				CONTRACT_ADDRESSES.realEstateEscrow,
				sale.price,
			);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda transakcije nije pronađena.");
			}

			setStatusMessage("");

			setSuccessMessage(
				`Escrow ugovoru odobreno je korištenje ${formatUnits(
					sale.price,
					2,
				)} mEUR za prodaju ID ${sale.id.toString()}.`,
			);

			/*
			 * Sada se ponovno čita stanje
			 * direktno s Hardhat RPC-a.
			 *
			 * getPurchaseConditions()
			 * mora vratiti allowance = true.
			 */
			await loadPurchaseData();
		} catch (error) {
			setStatusMessage("");

			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingAction("");
		}
	}

	async function purchaseSale(sale: ActiveSale): Promise<void> {
		setProcessingAction(`purchase-${sale.id.toString()}`);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		try {
			/*
			 * Neposredno prije WRITE transakcije
			 * ponovno se pita smart contract jesu li
			 * svi uvjeti još uvijek zadovoljeni.
			 *
			 * Čitanje ide direktno preko Hardhat RPC-a.
			 */
			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const readEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				readProvider,
			);

			const latestConditions = await readEscrow.getPurchaseConditions(
				sale.id,
				account,
			);

			if (!(latestConditions.readyForPurchase as boolean)) {
				throw new Error(
					"Smart contract potvrđuje da još nisu ispunjeni svi uvjeti za kupoprodaju.",
				);
			}

			const { realEstateEscrow } = await getSignerContracts();

			setStatusMessage(
				"Svi uvjeti su zadovoljeni. Potvrdi kupnju nekretnine u MetaMasku...",
			);

			/*
			 * fundSale je ključna WRITE operacija.
			 *
			 * Smart contract ponovno provjerava:
			 *
			 * - status prodaje
			 * - dokumentaciju
			 * - vlasništvo prodavatelja
			 * - da kupac nije prodavatelj
			 * - saldo kupca
			 * - allowance
			 *
			 * Ako je sve zadovoljeno, ugovor
			 * automatski:
			 *
			 * 1. uzima sredstva kupca
			 * 2. prenosi digitalno vlasništvo
			 * 3. isplaćuje prodavatelja
			 * 4. završava prodaju
			 */
			const transaction = await realEstateEscrow.fundSale(sale.id);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Pametni ugovor automatski izvršava kupoprodaju. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda kupoprodajne transakcije nije pronađena.");
			}

			/*
			 * Nakon potvrđene transakcije konačno
			 * stanje se NE čitam preko MetaMaska,
			 * nego direktno s Hardhat nodea.
			 */
			const postTransactionProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const propertyRegistryRead = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				postTransactionProvider,
			);

			const mockEURRead = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				postTransactionProvider,
			);

			const realEstateEscrowRead = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				postTransactionProvider,
			);

			const [newDigitalOwner, newBuyerBalance, sellerBalance, completedSale] =
				await Promise.all([
					propertyRegistryRead.getDigitalOwner(
						sale.propertyId,
					) as Promise<string>,

					mockEURRead.balanceOf(account) as Promise<bigint>,

					mockEURRead.balanceOf(sale.seller) as Promise<bigint>,

					realEstateEscrowRead.getSale(sale.id),
				]);

			const completedStatus = Number(completedSale.status);

			if (completedStatus !== 2) {
				throw new Error(
					`Prodaja nije dobila očekivani status ${getSaleStatusLabel(2)}.`,
				);
			}

			if (newDigitalOwner.toLowerCase() !== account.toLowerCase()) {
				throw new Error("Digitalno vlasništvo nije preneseno na kupca.");
			}

			setStatusMessage("");

			setSuccessMessage(
				`Kupoprodaja je automatski završena. Kupac je novi digitalni vlasnik nekretnine ID ${sale.propertyId.toString()}. Stanje kupca: ${formatUnits(
					newBuyerBalance,
					2,
				)} mEUR. Stanje prodavatelja: ${formatUnits(sellerBalance, 2)} mEUR.`,
			);

			/*
			 * Prodaja je sada Completed pa
			 * nestaje iz popisa aktivnih prodaja.
			 */
			await loadPurchaseData();
		} catch (error) {
			setStatusMessage("");

			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingAction("");
		}
	}

	return (
		<section className="purchase-card">
			<div className="purchase-header">
				<div>
					<p className="eyebrow">Aktivne kupoprodaje</p>

					<h2>Kupnja nekretnine</h2>

					<p>
						Pametni ugovor provjerava dokumentaciju, vlasništvo, raspoloživa
						sredstva i odobrenje sredstava prije automatskog izvršenja
						kupoprodaje.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => void loadPurchaseData()}
					disabled={isLoading || processingAction !== ""}
				>
					{isLoading ? "Učitavanje..." : "Osvježi prodaje"}
				</button>
			</div>

			<div className="token-summary">
				<div>
					<span>Stanje povezanog računa</span>

					<strong>{formatUnits(buyerBalance, 2)} mEUR</strong>
				</div>

				<div>
					<span>Odobreno escrow ugovoru</span>

					<strong>{formatUnits(escrowAllowance, 2)} mEUR</strong>
				</div>
			</div>

			{isLoading && sales.length === 0 && (
				<p className="transaction-status">
					Blockchain provjerava aktivne prodaje i uvjete kupoprodaje...
				</p>
			)}

			{!isLoading && sales.length === 0 && (
				<p className="empty-state">
					Trenutačno nema aktivnih prodaja dostupnih ovom računu.
				</p>
			)}

			<div className="property-list">
				{sales.map((sale) => {
					const { conditions } = sale;

					const isApproving =
						processingAction === `approve-${sale.id.toString()}`;

					const isPurchasing =
						processingAction === `purchase-${sale.id.toString()}`;

					const isProcessing = processingAction !== "";

					return (
						<article className="property-item" key={sale.id.toString()}>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Prodaja ID {sale.id.toString()}
									</span>

									<h3>{sale.propertyAddress}</h3>
								</div>

								<span className="sale-price">
									{formatUnits(sale.price, 2)} mEUR
								</span>
							</div>

							<dl className="property-details">
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
							</dl>

							<div className="transaction-result">
								<strong>Uvjeti za izvršenje kupoprodaje</strong>

								<dl className="property-details">
									<div>
										<dt>Prodaja postoji</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.saleExists,
												)}`}
											>
												{getConditionLabel(conditions.saleExists)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Prodaja je aktivna</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.saleActive,
												)}`}
											>
												{getConditionLabel(conditions.saleActive)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Dokumentacija je valjana</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.documentsValid,
												)}`}
											>
												{getConditionLabel(conditions.documentsValid)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Prodavatelj je vlasnik</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.sellerIsOwner,
												)}`}
											>
												{getConditionLabel(conditions.sellerIsOwner)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Kupac nije prodavatelj</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.buyerIsNotSeller,
												)}`}
											>
												{getConditionLabel(conditions.buyerIsNotSeller)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Kupac ima dovoljno sredstava</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.buyerHasSufficientBalance,
												)}`}
											>
												{getConditionLabel(
													conditions.buyerHasSufficientBalance,
												)}
											</span>
										</dd>
									</div>

									<div>
										<dt>Allowance je dovoljan</dt>

										<dd>
											<span
												className={`status-badge status-${getConditionClass(
													conditions.buyerHasSufficientAllowance,
												)}`}
											>
												{getConditionLabel(
													conditions.buyerHasSufficientAllowance,
												)}
											</span>
										</dd>
									</div>
								</dl>

								<p>
									<strong>
										Spremno za kupoprodaju:{" "}
										{conditions.readyForPurchase ? "DA" : "NE"}
									</strong>
								</p>
							</div>

							{!conditions.buyerHasSufficientBalance && (
								<p className="purchase-warning">
									Kupac nema dovoljno MockEUR sredstava za ovu prodaju.
								</p>
							)}

							{conditions.buyerHasSufficientBalance &&
								!conditions.buyerHasSufficientAllowance && (
									<p className="purchase-warning">
										Kupac ima dovoljno sredstava, ali ih još nije odobrio escrow
										ugovoru.
									</p>
								)}

							{conditions.readyForPurchase && (
								<div className="transaction-result success-result">
									<strong>Svi uvjeti su zadovoljeni</strong>

									<p>
										Smart contract označava ovu kupoprodaju spremnom za
										automatsko izvršenje.
									</p>
								</div>
							)}

							<div className="purchase-actions">
								<button
									type="button"
									className="approve-button"
									disabled={
										isProcessing ||
										conditions.buyerHasSufficientAllowance ||
										!conditions.buyerHasSufficientBalance
									}
									onClick={() => void approveSale(sale)}
								>
									{isApproving
										? "Odobrenje u tijeku..."
										: conditions.buyerHasSufficientAllowance
											? "Sredstva su odobrena"
											: "Odobri sredstva"}
								</button>

								<button
									type="button"
									className="purchase-button"
									disabled={isProcessing || !conditions.readyForPurchase}
									onClick={() => void purchaseSale(sale)}
								>
									{isPurchasing ? "Kupnja u tijeku..." : "Kupi nekretninu"}
								</button>
							</div>
						</article>
					);
				})}
			</div>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Uspješna blockchain transakcija</strong>

					<p>{successMessage}</p>
				</div>
			)}

			{transactionHash && (
				<div className="blockchain-value">
					<span>Hash posljednje transakcije</span>

					<code>{transactionHash}</code>
				</div>
			)}

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
