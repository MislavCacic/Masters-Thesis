import { BrowserProvider, Contract, keccak256 } from "ethers";
import { useEffect, useState, type FormEvent } from "react";

import { CONTRACT_ADDRESSES } from "../blockchain/contracts";
import { propertyRegistryAbi } from "../blockchain/propertyRegistryAbi";

interface RegisterPropertyFormProps {
	account: string;
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

	return "Registracija nekretnine nije uspjela.";
}

export default function RegisterPropertyForm({
	account,
}: RegisterPropertyFormProps) {
	const [cadastralMunicipality, setCadastralMunicipality] = useState("");
	const [parcelNumber, setParcelNumber] = useState("");
	const [propertyAddress, setPropertyAddress] = useState("");
	const [documentFile, setDocumentFile] = useState<File | null>(null);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [documentHash, setDocumentHash] = useState("");
	const [transactionHash, setTransactionHash] = useState("");

	useEffect(() => {
		setStatusMessage("");
		setSuccessMessage("");
		setErrorMessage("");
		setDocumentHash("");
		setTransactionHash("");
	}, [account]);

	async function handleSubmit(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();

		setErrorMessage("");
		setSuccessMessage("");
		setStatusMessage("");
		setDocumentHash("");
		setTransactionHash("");

		if (!window.ethereum) {
			setErrorMessage("MetaMask nije pronađen u pregledniku.");
			return;
		}

		if (
			!cadastralMunicipality.trim() ||
			!parcelNumber.trim() ||
			!propertyAddress.trim()
		) {
			setErrorMessage("Sva tekstualna polja moraju biti unesena.");
			return;
		}

		if (!documentFile) {
			setErrorMessage("Potrebno je odabrati dokument nekretnine.");
			return;
		}

		setIsSubmitting(true);

		try {
			setStatusMessage("Izračunava se hash dokumentacije...");

			const documentBytes = new Uint8Array(await documentFile.arrayBuffer());

			const calculatedDocumentHash = keccak256(documentBytes);

			setDocumentHash(calculatedDocumentHash);

			const provider = new BrowserProvider(window.ethereum);

			const signer = await provider.getSigner();
			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				signer,
			);

			setStatusMessage("Potvrdi registraciju u MetaMasku...");

			const transaction = await propertyRegistry.registerProperty(
				cadastralMunicipality.trim(),
				parcelNumber.trim(),
				propertyAddress.trim(),
				calculatedDocumentHash,
			);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			let registeredPropertyId: bigint | null = null;

			for (const log of receipt.logs) {
				try {
					const parsedLog = propertyRegistry.interface.parseLog(log);

					if (parsedLog?.name === "PropertyRegistered") {
						registeredPropertyId = parsedLog.args.propertyId as bigint;

						break;
					}
				} catch {
					// Log pripada drugom događaju i preskače se.
				}
			}

			const propertyIdText =
				registeredPropertyId?.toString() ?? "nije moguće očitati";

			setStatusMessage("");

			setSuccessMessage(
				`Nekretnina je registrirana. ID nekretnine: ${propertyIdText}. Status provjere: Pending.`,
			);

			setCadastralMunicipality("");
			setParcelNumber("");
			setPropertyAddress("");
			setDocumentFile(null);

			const fileInput = document.getElementById(
				"property-document",
			) as HTMLInputElement | null;

			if (fileInput) {
				fileInput.value = "";
			}
		} catch (error) {
			setStatusMessage("");
			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="property-card">
			<div className="property-card-header">
				<p className="eyebrow">Registar nekretnina</p>

				<h2>Registracija nekretnine</h2>

				<p>
					Povezani račun postaje početni digitalni vlasnik registrirane
					nekretnine.
				</p>
			</div>

			<div className="current-owner">
				<span>Digitalni vlasnik</span>
				<strong>{shortenAddress(account)}</strong>
			</div>

			<form className="property-form" onSubmit={handleSubmit}>
				<div className="form-grid">
					<label className="form-field">
						<span>Katastarska općina</span>

						<input
							type="text"
							value={cadastralMunicipality}
							onChange={(event) => setCadastralMunicipality(event.target.value)}
							placeholder="Primjer: Osijek"
							disabled={isSubmitting}
							required
						/>
					</label>

					<label className="form-field">
						<span>Broj katastarske čestice</span>

						<input
							type="text"
							value={parcelNumber}
							onChange={(event) => setParcelNumber(event.target.value)}
							placeholder="Primjer: 1234/5"
							disabled={isSubmitting}
							required
						/>
					</label>
				</div>

				<label className="form-field">
					<span>Adresa nekretnine</span>

					<input
						type="text"
						value={propertyAddress}
						onChange={(event) => setPropertyAddress(event.target.value)}
						placeholder="Primjer: Europska avenija 1, Osijek"
						disabled={isSubmitting}
						required
					/>
				</label>

				<label className="form-field">
					<span>Dokumentacija nekretnine</span>

					<input
						id="property-document"
						type="file"
						accept=".pdf,.png,.jpg,.jpeg"
						onChange={(event) =>
							setDocumentFile(event.target.files?.[0] ?? null)
						}
						disabled={isSubmitting}
						required
					/>

					<small>
						Datoteka se ne sprema na blockchain. Sprema se samo njezin
						kriptografski hash.
					</small>
				</label>

				<button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Registracija u tijeku..." : "Registriraj nekretninu"}
				</button>
			</form>

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Uspješna transakcija</strong>
					<p>{successMessage}</p>
				</div>
			)}

			{documentHash && (
				<div className="blockchain-value">
					<span>Hash dokumentacije</span>
					<code>{documentHash}</code>
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
