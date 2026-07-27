import {
	useCallback,
	useEffect,
	useState,
} from "react";

import {
	BrowserProvider,
	Contract,
	formatUnits,
} from "ethers";

import { CONTRACT_ADDRESSES } from "../blockchain/contracts";
import { mockEURAbi } from "../blockchain/mockEURAbi";
import { propertyRegistryAbi } from "../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../blockchain/realEstateEscrowAbi";

interface PurchaseSalePanelProps {
	account: string;
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

	return "Blockchain transakcija nije uspjela.";
}

export default function PurchaseSalePanel({
	account,
}: PurchaseSalePanelProps) {
	const [sales, setSales] = useState<ActiveSale[]>([]);

	const [buyerBalance, setBuyerBalance] = useState<bigint>(0n);
	const [escrowAllowance, setEscrowAllowance] =
		useState<bigint>(0n);

	const [isLoading, setIsLoading] = useState(false);
	const [processingAction, setProcessingAction] =
		useState("");

	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [transactionHash, setTransactionHash] = useState("");

	const loadPurchaseData =
		useCallback(async (): Promise<void> => {
			setIsLoading(true);
			setErrorMessage("");

			try {
				if (!window.ethereum) {
					throw new Error(
						"MetaMask nije pronađen u pregledniku.",
					);
				}

				const provider = new BrowserProvider(
					window.ethereum,
				);

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

				const [balance, allowance, saleCount] =
					await Promise.all([
						mockEUR.balanceOf(account) as Promise<bigint>,

						mockEUR.allowance(
							account,
							CONTRACT_ADDRESSES.realEstateEscrow,
						) as Promise<bigint>,

						realEstateEscrow.getSaleCount() as Promise<bigint>,
					]);

				setBuyerBalance(balance);
				setEscrowAllowance(allowance);

				const loadedSales: ActiveSale[] = [];

				for (
					let saleId = 1n;
					saleId <= saleCount;
					saleId++
				) {
					const sale =
						await realEstateEscrow.getSale(saleId);

					const exists = sale.exists as boolean;
					const status = Number(sale.status);
					const seller = sale.seller as string;

					const isCreated = status === 0;

					const belongsToAnotherAccount =
						seller.toLowerCase() !==
						account.toLowerCase();

					if (
						!exists ||
						!isCreated ||
						!belongsToAnotherAccount
					) {
						continue;
					}

					const propertyId =
						sale.propertyId as bigint;

					const property =
						await propertyRegistry.getProperty(
							propertyId,
						);

					loadedSales.push({
						id: sale.id as bigint,
						propertyId,
						seller,
						price: sale.price as bigint,

						propertyAddress:
							property.propertyAddress as string,

						cadastralMunicipality:
							property.cadastralMunicipality as string,

						parcelNumber:
							property.parcelNumber as string,
					});
				}

				setSales(loadedSales);
			} catch (error) {
				setSales([]);
				setErrorMessage(getErrorMessage(error));
			} finally {
				setIsLoading(false);
			}
		}, [account]);

	useEffect(() => {
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");
		setProcessingAction("");

		void loadPurchaseData();
	}, [account, loadPurchaseData]);

	async function getSignerContracts(): Promise<{
		mockEUR: Contract;
		realEstateEscrow: Contract;
		propertyRegistry: Contract;
	}> {
		if (!window.ethereum) {
			throw new Error(
				"MetaMask nije pronađen u pregledniku.",
			);
		}

		const provider = new BrowserProvider(
			window.ethereum,
		);

		const signer = await provider.getSigner();
		const signerAddress = await signer.getAddress();

		if (
			signerAddress.toLowerCase() !==
			account.toLowerCase()
		) {
			throw new Error(
				"MetaMask račun se promijenio. Pokušaj ponovno.",
			);
		}

		return {
			mockEUR: new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				signer,
			),

			realEstateEscrow: new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				signer,
			),

			propertyRegistry: new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				signer,
			),
		};
	}

	async function approveSale(
		sale: ActiveSale,
	): Promise<void> {
		setProcessingAction(
			`approve-${sale.id.toString()}`,
		);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		try {
			const { mockEUR } =
				await getSignerContracts();

			setStatusMessage(
				"Potvrdi odobrenje MockEUR tokena u MetaMasku...",
			);

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
				throw new Error(
					"Potvrda transakcije nije pronađena.",
				);
			}

			setStatusMessage("");

			setSuccessMessage(
				`Escrow ugovoru odobreno je korištenje ${formatUnits(
					sale.price,
					2,
				)} mEUR za prodaju ID ${sale.id.toString()}.`,
			);

			await loadPurchaseData();
		} catch (error) {
			setStatusMessage("");
			setErrorMessage(getErrorMessage(error));
		} finally {
			setProcessingAction("");
		}
	}

	async function purchaseSale(
		sale: ActiveSale,
	): Promise<void> {
		setProcessingAction(
			`purchase-${sale.id.toString()}`,
		);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		try {
			if (buyerBalance < sale.price) {
				throw new Error(
					"Kupac nema dovoljno MockEUR sredstava.",
				);
			}

			if (escrowAllowance < sale.price) {
				throw new Error(
					"Prvo je potrebno odobriti escrow ugovoru korištenje sredstava.",
				);
			}

			const {
				mockEUR,
				realEstateEscrow,
				propertyRegistry,
			} = await getSignerContracts();

			setStatusMessage(
				"Potvrdi kupnju nekretnine u MetaMasku...",
			);

			const transaction =
				await realEstateEscrow.fundSale(sale.id);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Pametni ugovor izvršava kupoprodaju. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error(
					"Potvrda kupoprodajne transakcije nije pronađena.",
				);
			}

			const [
				newDigitalOwner,
				newBuyerBalance,
				sellerBalance,
				completedSale,
			] = await Promise.all([
				propertyRegistry.getDigitalOwner(
					sale.propertyId,
				) as Promise<string>,

				mockEUR.balanceOf(account) as Promise<bigint>,

				mockEUR.balanceOf(
					sale.seller,
				) as Promise<bigint>,

				realEstateEscrow.getSale(
					sale.id,
				) as Promise<{
					status: bigint;
				}>,
			]);

			const completedStatus =
				Number(completedSale.status);

			if (completedStatus !== 2) {
				throw new Error(
					"Prodaja nije dobila očekivani status Completed.",
				);
			}

			if (
				newDigitalOwner.toLowerCase() !==
				account.toLowerCase()
			) {
				throw new Error(
					"Digitalno vlasništvo nije preneseno na kupca.",
				);
			}

			setStatusMessage("");

			setSuccessMessage(
				`Kupoprodaja je automatski završena. Kupac je novi digitalni vlasnik nekretnine ID ${sale.propertyId.toString()}. Stanje kupca: ${formatUnits(
					newBuyerBalance,
					2,
				)} mEUR. Stanje prodavatelja: ${formatUnits(
					sellerBalance,
					2,
				)} mEUR.`,
			);

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
					<p className="eyebrow">
						Aktivne kupoprodaje
					</p>

					<h2>Kupnja nekretnine</h2>

					<p>
						Kupac odobrava korištenje simuliranih
						sredstava i pokreće automatsko izvršenje
						pametnog ugovora.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() =>
						void loadPurchaseData()
					}
					disabled={
						isLoading ||
						processingAction !== ""
					}
				>
					{isLoading
						? "Učitavanje..."
						: "Osvježi prodaje"}
				</button>
			</div>

			<div className="token-summary">
				<div>
					<span>Stanje povezanog računa</span>

					<strong>
						{formatUnits(buyerBalance, 2)} mEUR
					</strong>
				</div>

				<div>
					<span>Odobreno escrow ugovoru</span>

					<strong>
						{formatUnits(
							escrowAllowance,
							2,
						)}{" "}
						mEUR
					</strong>
				</div>
			</div>

			{isLoading && sales.length === 0 && (
				<p className="transaction-status">
					Učitavaju se aktivne prodaje...
				</p>
			)}

			{!isLoading && sales.length === 0 && (
				<p className="empty-state">
					Trenutačno nema aktivnih prodaja
					dostupnih ovom računu.
				</p>
			)}

			<div className="property-list">
				{sales.map((sale) => {
					const hasEnoughBalance =
						buyerBalance >= sale.price;

					const hasEnoughAllowance =
						escrowAllowance >= sale.price;

					const isApproving =
						processingAction ===
						`approve-${sale.id.toString()}`;

					const isPurchasing =
						processingAction ===
						`purchase-${sale.id.toString()}`;

					const isProcessing =
						processingAction !== "";

					return (
						<article
							className="property-item"
							key={sale.id.toString()}
						>
							<div className="property-item-heading">
								<div>
									<span className="property-id">
										Prodaja ID{" "}
										{sale.id.toString()}
									</span>

									<h3>
										{sale.propertyAddress}
									</h3>
								</div>

								<span className="sale-price">
									{formatUnits(
										sale.price,
										2,
									)}{" "}
									mEUR
								</span>
							</div>

							<dl className="property-details">
								<div>
									<dt>Nekretnina ID</dt>
									<dd>
										{sale.propertyId.toString()}
									</dd>
								</div>

								<div>
									<dt>Katastarska općina</dt>
									<dd>
										{
											sale.cadastralMunicipality
										}
									</dd>
								</div>

								<div>
									<dt>Broj čestice</dt>
									<dd>
										{sale.parcelNumber}
									</dd>
								</div>

								<div>
									<dt>Prodavatelj</dt>
									<dd title={sale.seller}>
										{shortenAddress(
											sale.seller,
										)}
									</dd>
								</div>
							</dl>

							{!hasEnoughBalance && (
								<p className="purchase-warning">
									Kupac nema dovoljno MockEUR
									sredstava za ovu prodaju.
								</p>
							)}

							<div className="purchase-actions">
								<button
									type="button"
									className="approve-button"
									disabled={
										isProcessing ||
										hasEnoughAllowance ||
										!hasEnoughBalance
									}
									onClick={() =>
										void approveSale(sale)
									}
								>
									{isApproving
										? "Odobrenje u tijeku..."
										: hasEnoughAllowance
											? "Sredstva su odobrena"
											: "Odobri sredstva"}
								</button>

								<button
									type="button"
									className="purchase-button"
									disabled={
										isProcessing ||
										!hasEnoughBalance ||
										!hasEnoughAllowance
									}
									onClick={() =>
										void purchaseSale(sale)
									}
								>
									{isPurchasing
										? "Kupnja u tijeku..."
										: "Kupi nekretninu"}
								</button>
							</div>
						</article>
					);
				})}
			</div>

			{statusMessage && (
				<p className="transaction-status">
					{statusMessage}
				</p>
			)}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>
						Uspješna blockchain transakcija
					</strong>

					<p>{successMessage}</p>
				</div>
			)}

			{transactionHash && (
				<div className="blockchain-value">
					<span>Hash posljednje transakcije</span>
					<code>{transactionHash}</code>
				</div>
			)}

			{errorMessage && (
				<p className="error">{errorMessage}</p>
			)}
		</section>
	);
}