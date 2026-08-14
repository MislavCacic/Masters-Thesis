import { useEffect, useState, type FormEvent } from "react";

import {
	BrowserProvider,
	Contract,
	formatUnits,
	getAddress,
	isAddress,
	parseUnits,
} from "ethers";

import { CONTRACT_ADDRESSES } from "../../blockchain/contracts";
import { mockEURAbi } from "../../blockchain/mockEURAbi";

import "./MintMockEURForm.css";

interface MintMockEURFormProps {
	account: string;
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
			setErrorMessage("Unesena adresa kupca nije valjana Ethereum adresa.");
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

			const provider = new BrowserProvider(window.ethereum);

			const signer = await provider.getSigner();
			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const mockEUR = new Contract(
				CONTRACT_ADDRESSES.mockEUR,
				mockEURAbi,
				signer,
			);

			const normalizedRecipient = getAddress(trimmedRecipient);

			setStatusMessage("Potvrdi dodjelu MockEUR tokena u MetaMasku...");

			const transaction = await mockEUR.mint(
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

			const buyerBalance = (await mockEUR.balanceOf(
				normalizedRecipient,
			)) as bigint;

			setStatusMessage("");

			setSuccessMessage(
				`Kupcu je dodijeljeno ${normalizedAmount} mEUR. Novo stanje kupca: ${formatUnits(
					buyerBalance,
					2,
				)} mEUR.`,
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
						Administrator kupcu dodjeljuje simulirana sredstva potrebna za
						izvršenje kupoprodaje.
					</p>
				</div>
			</div>

			<form className="property-form mint-form" onSubmit={handleSubmit}>
				<label className="form-field">
					<span>Adresa kupca</span>

					<input
						type="text"
						value={recipientAddress}
						onChange={(event) => setRecipientAddress(event.target.value)}
						placeholder="0x..."
						disabled={isSubmitting}
						required
					/>

					<small>Unesi punu Ethereum adresu računa Kupac iz MetaMaska.</small>
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
					{isSubmitting ? "Dodjela u tijeku..." : "Dodijeli sredstva kupcu"}
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
