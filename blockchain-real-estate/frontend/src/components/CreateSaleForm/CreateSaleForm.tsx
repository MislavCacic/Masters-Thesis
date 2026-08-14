import { BrowserProvider, Contract, JsonRpcProvider, parseUnits } from "ethers";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type FormEvent,
} from "react";

import {
	CONTRACT_ADDRESSES,
	HARDHAT_CHAIN_ID,
} from "../../blockchain/contracts";

import { propertyRegistryAbi } from "../../blockchain/propertyRegistryAbi";
import { realEstateEscrowAbi } from "../../blockchain/realEstateEscrowAbi";

import "./CreateSaleForm.css";

interface CreateSaleFormProps {
	account: string;
}

interface PropertyOption {
	id: bigint;
	cadastralMunicipality: string;
	parcelNumber: string;
	propertyAddress: string;
	hasValidDocuments: boolean;
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

	return "Kreiranje prodaje nije uspjelo.";
}

export default function CreateSaleForm({ account }: CreateSaleFormProps) {
	const [properties, setProperties] = useState<PropertyOption[]>([]);

	const [selectedPropertyId, setSelectedPropertyId] = useState("");

	const [price, setPrice] = useState("");

	const [isLoading, setIsLoading] = useState(false);

	const [isSubmitting, setIsSubmitting] = useState(false);

	const [statusMessage, setStatusMessage] = useState("");

	const [successMessage, setSuccessMessage] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	const [transactionHash, setTransactionHash] = useState("");

	/*
	 * Zaštita od zastarjelih blockchain odgovora.
	 *
	 * Ako se MetaMask račun promijeni dok prethodni
	 * zahtjev još traje, rezultat starog zahtjeva
	 * ne smije prepisati podatke novog računa.
	 */
	const requestIdRef = useRef(0);

	const loadEligibleProperties = useCallback(async (): Promise<void> => {
		if (!account) {
			setProperties([]);
			setSelectedPropertyId("");

			return;
		}

		const requestId = ++requestIdRef.current;

		setIsLoading(true);
		setErrorMessage("");

		try {
			/*
			 * Sve READ operacije idu izravno
			 * prema lokalnom Hardhat nodeu.
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

			const propertyRegistry = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				provider,
			);

			const realEstateEscrow = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				provider,
			);

			const [propertyCount, saleCount] = await Promise.all([
				propertyRegistry.getPropertyCount() as Promise<bigint>,

				realEstateEscrow.getSaleCount() as Promise<bigint>,
			]);

			if (requestId !== requestIdRef.current) {
				return;
			}

			/*
			 * Prvo određujemo koje nekretnine
			 * već imaju aktivnu prodaju.
			 */
			const propertiesWithActiveSale = new Set<string>();

			for (let saleId = 1n; saleId <= saleCount; saleId++) {
				const sale = await realEstateEscrow.getSale(saleId);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const saleExists = sale.exists as boolean;

				const saleStatus = Number(sale.status);

				const salePropertyId = sale.propertyId as bigint;

				/*
				 * SaleStatus:
				 *
				 * 0 = Created
				 * 1 = Funded
				 * 2 = Completed
				 * 3 = Cancelled
				 *
				 * Funded je u našem escrow ugovoru
				 * samo prijelazni status unutar iste
				 * blockchain transakcije.
				 */
				const isActive = saleStatus === 0 || saleStatus === 1;

				if (saleExists && isActive) {
					propertiesWithActiveSale.add(salePropertyId.toString());
				}
			}

			const eligibleProperties: PropertyOption[] = [];

			const normalizedAccount = account.toLowerCase();

			for (let propertyId = 1n; propertyId <= propertyCount; propertyId++) {
				/*
				 * Blockchain sam određuje jesu li
				 * sva tri obvezna dokumenta valjana.
				 */
				const [property, hasValidDocuments] = await Promise.all([
					propertyRegistry.getProperty(propertyId),

					propertyRegistry.hasValidDocuments(propertyId),
				]);

				if (requestId !== requestIdRef.current) {
					return;
				}

				const exists = property.exists as boolean;

				const digitalOwner = property.digitalOwner as string;

				const belongsToConnectedAccount =
					digitalOwner.toLowerCase() === normalizedAccount;

				const documentsValid = hasValidDocuments as boolean;

				const hasNoActiveSale = !propertiesWithActiveSale.has(
					propertyId.toString(),
				);

				/*
				 * U dropdown ulazi samo nekretnina:
				 *
				 * - koja postoji
				 * - kojoj je povezani račun vlasnik
				 * - kojoj su svi dokumenti potvrđeni
				 * - koja nema drugu aktivnu prodaju
				 */
				if (
					exists &&
					belongsToConnectedAccount &&
					documentsValid &&
					hasNoActiveSale
				) {
					eligibleProperties.push({
						id: property.id as bigint,

						cadastralMunicipality: property.cadastralMunicipality as string,

						parcelNumber: property.parcelNumber as string,

						propertyAddress: property.propertyAddress as string,

						hasValidDocuments: documentsValid,
					});
				}
			}

			eligibleProperties.sort((a, b) => {
				if (a.id === b.id) {
					return 0;
				}

				return a.id > b.id ? -1 : 1;
			});

			if (requestId !== requestIdRef.current) {
				return;
			}

			setProperties(eligibleProperties);

			setSelectedPropertyId((currentValue) => {
				const selectedStillExists = eligibleProperties.some(
					(property) => property.id.toString() === currentValue,
				);

				if (selectedStillExists) {
					return currentValue;
				}

				return eligibleProperties[0]?.id.toString() ?? "";
			});
		} catch (error) {
			if (requestId === requestIdRef.current) {
				setErrorMessage(getErrorMessage(error));

				setProperties([]);

				setSelectedPropertyId("");
			}
		} finally {
			if (requestId === requestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [account]);

	useEffect(() => {
		setProperties([]);

		setSelectedPropertyId("");

		setPrice("");

		setStatusMessage("");

		setSuccessMessage("");

		setErrorMessage("");

		setTransactionHash("");

		void loadEligibleProperties();

		return () => {
			requestIdRef.current++;
		};
	}, [loadEligibleProperties]);

	useEffect(() => {
		if (!successMessage) {
			return;
		}

		const messageTimer = window.setTimeout(() => {
			setSuccessMessage("");

			setTransactionHash("");
		}, 6000);

		return () => {
			window.clearTimeout(messageTimer);
		};
	}, [successMessage]);

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

		if (!selectedPropertyId) {
			setErrorMessage(
				"Odaberi nekretninu koja ima potpuno potvrđenu dokumentaciju.",
			);

			return;
		}

		const normalizedPrice = price.trim().replace(",", ".");

		if (!normalizedPrice) {
			setErrorMessage("Unesi cijenu nekretnine.");

			return;
		}

		setIsSubmitting(true);

		try {
			const priceInSmallestUnits = parseUnits(normalizedPrice, 2);

			if (priceInSmallestUnits <= 0n) {
				throw new Error("Cijena mora biti veća od nule.");
			}

			const propertyId = BigInt(selectedPropertyId);

			/*
			 * Neposredno prije MetaMask WRITE transakcije
			 * još jednom čitamo aktualno blockchain stanje
			 * izravno s Hardhat nodea.
			 */
			const readProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const readNetwork = await readProvider.getNetwork();

			if (readNetwork.chainId !== HARDHAT_CHAIN_ID) {
				throw new Error("Hardhat local mreža nije dostupna.");
			}

			const propertyRegistryRead = new Contract(
				CONTRACT_ADDRESSES.propertyRegistry,
				propertyRegistryAbi,
				readProvider,
			);

			const realEstateEscrowRead = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				readProvider,
			);

			const [hasValidDocuments, digitalOwner, saleCountBefore] =
				await Promise.all([
					propertyRegistryRead.hasValidDocuments(
						propertyId,
					) as Promise<boolean>,

					propertyRegistryRead.getDigitalOwner(propertyId) as Promise<string>,

					realEstateEscrowRead.getSaleCount() as Promise<bigint>,
				]);

			if (!hasValidDocuments) {
				throw new Error("Nekretnina nema potpuno potvrđenu dokumentaciju.");
			}

			if (digitalOwner.toLowerCase() !== account.toLowerCase()) {
				throw new Error(
					"Povezani račun više nije digitalni vlasnik nekretnine.",
				);
			}

			/*
			 * MetaMask koristimo samo za WRITE
			 * operaciju koju prodavatelj mora potpisati.
			 */
			const browserProvider = new BrowserProvider(window.ethereum);

			const signer = await browserProvider.getSigner();

			const signerAddress = await signer.getAddress();

			if (signerAddress.toLowerCase() !== account.toLowerCase()) {
				throw new Error("MetaMask račun se promijenio. Pokušaj ponovno.");
			}

			const realEstateEscrowWrite = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				signer,
			);

			setStatusMessage("Potvrdi kreiranje prodaje u MetaMasku...");

			/*
			 * Iako smo na frontendu provjerili
			 * dokumentaciju i vlasništvo,
			 * RealEstateEscrow.createSale()
			 * ponovno provjerava uvjete.
			 *
			 * Frontend zato ne može zaobići
			 * sigurnosna pravila smart contracta.
			 */
			const transaction = await realEstateEscrowWrite.createSale(
				propertyId,
				priceInSmallestUnits,
			);

			setTransactionHash(transaction.hash);

			setStatusMessage(
				"Transakcija je poslana. Čeka se potvrda blockchaina...",
			);

			const receipt = await transaction.wait();

			if (!receipt) {
				throw new Error("Potvrda blockchain transakcije nije pronađena.");
			}

			/*
			 * Nakon potvrde transakcije ponovno
			 * čitamo stanje izravno s Hardhat nodea,
			 * a ne preko MetaMask providera.
			 */
			const postTransactionProvider = new JsonRpcProvider(LOCAL_RPC_URL);

			const realEstateEscrowPost = new Contract(
				CONTRACT_ADDRESSES.realEstateEscrow,
				realEstateEscrowAbi,
				postTransactionProvider,
			);

			const saleCountAfter =
				(await realEstateEscrowPost.getSaleCount()) as bigint;

			if (saleCountAfter <= saleCountBefore) {
				throw new Error("Blockchain nije evidentirao novu prodaju.");
			}

			const createdSale = await realEstateEscrowPost.getSale(saleCountAfter);

			const createdSaleId = createdSale.id as bigint;

			const createdPropertyId = createdSale.propertyId as bigint;

			const createdSeller = createdSale.seller as string;

			const createdPrice = createdSale.price as bigint;

			const createdStatus = Number(createdSale.status);

			const createdExists = createdSale.exists as boolean;

			/*
			 * Provjeravamo da blockchain zapis
			 * stvarno odgovara prodaji koju je
			 * korisnik upravo kreirao.
			 */
			if (!createdExists) {
				throw new Error("Novokreirana prodaja nije pronađena na blockchainu.");
			}

			if (createdPropertyId !== propertyId) {
				throw new Error("Blockchain je vratio neočekivani ID nekretnine.");
			}

			if (createdSeller.toLowerCase() !== account.toLowerCase()) {
				throw new Error("Blockchain je vratio neočekivanog prodavatelja.");
			}

			if (createdPrice !== priceInSmallestUnits) {
				throw new Error("Blockchain je vratio neočekivanu prodajnu cijenu.");
			}

			if (createdStatus !== 0) {
				throw new Error("Novokreirana prodaja nema očekivani status Kreirana.");
			}

			setStatusMessage("");

			setSuccessMessage(
				`Prodaja je kreirana. ID prodaje: ${createdSaleId.toString()}. Cijena: ${normalizedPrice} mEUR.`,
			);

			setPrice("");

			/*
			 * Nekretnina sada ima aktivnu prodaju
			 * i više se ne smije prikazivati u
			 * dropdownu dostupnih nekretnina.
			 */
			await loadEligibleProperties();
		} catch (error) {
			setStatusMessage("");

			setErrorMessage(getErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="sale-card">
			<div className="sale-header">
				<div>
					<p className="eyebrow">Pametni ugovor za kupoprodaju</p>

					<h2>Kreiranje prodaje</h2>

					<p>
						Prodavatelj može ponuditi samo nekretninu u svom digitalnom
						vlasništvu kojoj su sva tri obvezna dokumenta potvrđena.
					</p>
				</div>

				<button
					type="button"
					className="secondary-button"
					onClick={() => {
						setStatusMessage("");

						setSuccessMessage("");

						setErrorMessage("");

						setTransactionHash("");

						void loadEligibleProperties();
					}}
					disabled={isLoading || isSubmitting}
				>
					{isLoading ? "Učitavanje..." : "Osvježi nekretnine"}
				</button>
			</div>

			{isLoading && (
				<p className="transaction-status">
					Blockchain provjerava vlasništvo, dokumentaciju i aktivne prodaje...
				</p>
			)}

			{!isLoading && properties.length === 0 && (
				<p className="empty-state">
					Povezani račun nema nekretninu s potpuno potvrđenom dokumentacijom
					koja je dostupna za prodaju.
				</p>
			)}

			{properties.length > 0 && (
				<form className="property-form sale-form" onSubmit={handleSubmit}>
					<label className="form-field">
						<span>Nekretnina</span>

						<select
							value={selectedPropertyId}
							onChange={(event) => setSelectedPropertyId(event.target.value)}
							disabled={isSubmitting}
							required
						>
							{properties.map((property) => (
								<option
									key={property.id.toString()}
									value={property.id.toString()}
								>
									ID {property.id.toString()} — {property.propertyAddress} —
									čestica {property.parcelNumber}
								</option>
							))}
						</select>

						<small>
							Prikazuju se samo nekretnine s 3/3 potvrđena dokumenta koje nemaju
							drugu aktivnu prodaju.
						</small>
					</label>

					<label className="form-field">
						<span>Prodajna cijena u mEUR</span>

						<input
							type="text"
							inputMode="decimal"
							value={price}
							onChange={(event) => setPrice(event.target.value)}
							placeholder="Primjer: 150000.00"
							disabled={isSubmitting}
							required
						/>

						<small>
							MockEUR koristi dvije decimale. Ovo nisu stvarni euri, nego
							simulirana sredstva za potrebe prototipa.
						</small>
					</label>

					<button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Kreiranje prodaje..." : "Kreiraj prodaju"}
					</button>
				</form>
			)}

			{statusMessage && <p className="transaction-status">{statusMessage}</p>}

			{successMessage && (
				<div className="transaction-result success-result">
					<strong>Prodaja je kreirana</strong>

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
