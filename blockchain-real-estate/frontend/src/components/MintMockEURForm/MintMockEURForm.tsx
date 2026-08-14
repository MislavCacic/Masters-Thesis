import {
	BrowserProvider,
	Contract,
	formatUnits,
	getAddress,
	isAddress,
	JsonRpcProvider,
	parseUnits,
} from "ethers";

import { useEffect, useState, type FormEvent } from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { mockEURAbi } from "../../blockchain/mockEURAbi";

import "./MintMockEURForm.css";

interface MintMockEURFormProps {
	account: string;
}

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

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

	return "Dodjela simuliranih sredstava nije uspjela.";
}

export default function MintMockEURForm({ account }: MintMockEURFormProps) {
	const [recipientAddress, setRecipientAddress] = useState("");

	const [amount, setAmount] = useState("");

	const [isSubmitting, setIsSubmitting] = useState(false);

	const [statusMessage, setStatusMessage] = useState("");

	const [successMessage, setSuccessMessage] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	const [transactionHash, setTransactionHash] = useState("");

	useEffect(() => {
		setRecipientAddress("");
		setAmount("");

		setIsSubmitting(false);

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");
	}, [account]);

	async function handleSubmit(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setTransactionHash("");

		if (!window.ethereum) {
			setErrorMessage("MetaMask nije pronađen u pregledniku.");

			return;
		}

		const trimmedRecipient = recipientAddress.trim();

		if (!isAddress(trimmedRecipient)) {
			setErrorMessage("Unesena adresa korisnika nije valjana Ethereum adresa.");

			return;
		}

		const normalizedAmount = amount.trim().replace(",", ".");

		if (!normalizedAmount) {
			setErrorMessage("Unesi količinu simuliranih sredstava.");

			return;
		}

		setIsSubmitting(true);

		try {
			const amountInSmallestUnits = parseUnits(normalizedAmount, 2);

			if (amountInSmallestUnits <= 0n) {
				throw new Error("Količina mora biti veća od nule.");
			}

			const normalizedRecipient = getAddress(trimmedRecipient);

			/* =============================================
			   1. ČITANJE POČETNOG STANJA
			   ============================================= */

			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const network = await readProvider.getNetwork();

			if (network.chainId !== HARDHAT_CHAIN_ID) {
				throw new Error(
					`Neočekivana blockchain mreža. Chain ID: ${network.chainId.toString()}.`,
				);
			}

			const mockEURRead = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				readProvider,
			);

			const balanceBefore = (await mockEURRead.balanceOf(
				normalizedRecipient,
			)) as bigint;

			/* =============================================
			   2. METAMASK WRITE TRANSAKCIJA
			   ============================================= */

			const browserProvider = new BrowserProvider(window.ethereum);

			const signer = await browserProvider.getSigner();

			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const mockEURWrite = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				signer,
			);

			setStatusMessage("Potvrdi dodjelu MockEUR tokena u MetaMasku...");

			const transaction = await mockEURWrite.mint(
				normalizedRecipient,
				amountInSmallestUnits,
			);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			if (receipt.status !== 1) {
				throw new Error(
					"Blockchain transakcija dodjele MockEUR tokena nije uspješno izvršena.",
				);
			}

			/* =============================================
			   3. PROVJERA KONAČNOG STANJA
			   ============================================= */

			const postTransactionProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const mockEURPost = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				postTransactionProvider,
			);

			const [balanceAfter, tokenSymbol, tokenDecimals] = await Promise.all([
				mockEURPost.balanceOf(normalizedRecipient) as Promise<bigint>,

				mockEURPost.symbol() as Promise<string>,

				mockEURPost.decimals() as Promise<bigint>,
			]);

			const expectedBalance = balanceBefore + amountInSmallestUnits;

			if (balanceAfter !== expectedBalance) {
				throw new Error(
					"Blockchain stanje korisnika ne odgovara očekivanoj količini nakon dodjele sredstava.",
				);
			}

			/* =============================================
			   4. USPJEH
			   ============================================= */

			setStatusMessage("");

			setSuccessMessage(
				`Korisniku je dodijeljeno ${formatUnits(
					amountInSmallestUnits,
					Number(tokenDecimals),
				)} ${tokenSymbol}. Novo stanje korisnika: ${formatUnits(
					balanceAfter,
					Number(tokenDecimals),
				)} ${tokenSymbol}.`,
			);

			setAmount("");
		} catch (error) {
			setStatusMessage("");

			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="mint-card">
			<div className="mint-header">
				<div>
					<p className="eyebrow">Simulirana sredstva</p>

					<h2>Dodjela MockEUR tokena</h2>

					<p>
						Administrator korisnicima dodjeljuje simulirana sredstva potrebna za
						izvršenje kupoprodaje.
					</p>
				</div>
			</div>

			<form className="property-form mint-form" onSubmit={handleSubmit}>
				<label className="form-field">
					<span>Adresa korisnika</span>

					<input
						type="text"
						value={recipientAddress}
						onChange={(event) => setRecipientAddress(event.target.value)}
						placeholder="0x..."
						disabled={isSubmitting}
						required
					/>

					<small>Unesi punu Ethereum adresu korisnika iz MetaMaska.</small>
				</label>

				<label className="form-field">
					<span>Količina u mEUR</span>

					<input
						type="text"
						inputMode="decimal"
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						placeholder="Primjer: 150000.00"
						disabled={isSubmitting}
						required
					/>

					<small>
						MockEUR nema stvarnu novčanu vrijednost i koristi se samo u
						prototipu.
					</small>
				</label>

				<button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Dodjela u tijeku..." : "Dodijeli sredstva korisniku"}
				</button>
			</form>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Sredstva su uspješno dodijeljena</strong>

					<p>{successMessage}</p>
				</div>
			)}

			{transactionHash && (
				<div className="blockchain-value">
					<span>Hash transakcije</span>

					<code>{transactionHash}</code>
				</div>
			)}

			{errorMessage && <p className="error">{errorMessage}</p>}
		</section>
	);
}
