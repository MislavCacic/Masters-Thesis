import hre from "hardhat";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { viem } = await hre.network.create();

describe("MockEUR", function () {
	it("postavlja token i vraća ispravne osnovne podatke", async function () {
		const mockEUR = await viem.deployContract("MockEUR");

		const tokenName = await mockEUR.read.name();
		const tokenSymbol = await mockEUR.read.symbol();
		const tokenDecimals = await mockEUR.read.decimals();
		const totalSupply = await mockEUR.read.totalSupply();

		console.log("\n--- MOCK EUR TOKEN ---");
		console.log("Adresa ugovora:", mockEUR.address);
		console.log("Naziv tokena:", tokenName);
		console.log("Oznaka tokena:", tokenSymbol);
		console.log("Broj decimala:", tokenDecimals);
		console.log("Početna količina tokena:", totalSupply.toString());
		console.log("----------------------\n");

		assert.equal(tokenName, "Mock Euro", "Naziv tokena mora biti Mock Euro");

		assert.equal(tokenSymbol, "mEUR", "Oznaka tokena mora biti mEUR");

		assert.equal(tokenDecimals, 2, "Token mora koristiti dvije decimale");

		assert.equal(
			totalSupply,
			0n,
			"Početna ukupna količina tokena mora biti nula",
		);
	});

	it("stvara mEUR tokene i dodjeljuje ih kupcu", async function () {
		const [, buyer] = await viem.getWalletClients();
		const publicClient = await viem.getPublicClient();

		const mockEUR = await viem.deployContract("MockEUR");

		// Token ima dvije decimale:
		// 20.000.000 najmanjih jedinica = 200.000,00 mEUR
		const amount = 20_000_000n;

		const mintTransactionHash = await mockEUR.write.mint([
			buyer.account.address,
			amount,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		const buyerBalance = await mockEUR.read.balanceOf([buyer.account.address]);

		const totalSupply = await mockEUR.read.totalSupply();

		console.log("\n--- STVARANJE MOCK EUR TOKENA ---");
		console.log("Adresa kupca:", buyer.account.address);
		console.log("Stvorena količina u najmanjim jedinicama:", amount.toString());
		console.log(
			"Stanje kupca u najmanjim jedinicama:",
			buyerBalance.toString(),
		);
		console.log("Stanje kupca u mEUR:", Number(buyerBalance) / 100);
		console.log("Ukupna količina tokena:", totalSupply.toString());
		console.log("---------------------------------\n");

		assert.equal(buyerBalance, amount, "Kupac mora imati 200.000,00 mEUR");

		assert.equal(
			totalSupply,
			amount,
			"Ukupna količina mora odgovarati stvorenoj količini",
		);
	});

	it("ne dopušta korisniku bez minter uloge stvaranje tokena", async function () {
		const [, unauthorizedUser, buyer] = await viem.getWalletClients();

		const mockEUR = await viem.deployContract("MockEUR");

		const amount = 10_000_000n;

		console.log("\n--- NEOVLAŠTENO STVARANJE TOKENA ---");
		console.log(
			"Adresa neovlaštenog korisnika:",
			unauthorizedUser.account.address,
		);

		await assert.rejects(async () => {
			await mockEUR.write.mint([buyer.account.address, amount], {
				account: unauthorizedUser.account,
			});
		});

		const buyerBalance = await mockEUR.read.balanceOf([buyer.account.address]);

		const totalSupply = await mockEUR.read.totalSupply();

		console.log("Pokušaj stvaranja tokena: odbijen");
		console.log("Stanje kupca nakon pokušaja:", buyerBalance.toString());
		console.log("Ukupna količina nakon pokušaja:", totalSupply.toString());
		console.log("--------------------------------------\n");

		assert.equal(
			buyerBalance,
			0n,
			"Kupac ne smije dobiti tokene nakon neovlaštenog pokušaja",
		);

		assert.equal(totalSupply, 0n, "Ukupna količina tokena mora ostati nula");
	});

	it("omogućuje odobrenje i prijenos tokena putem transferFrom funkcije", async function () {
		const [, buyer, seller, escrowAccount] = await viem.getWalletClients();

		const publicClient = await viem.getPublicClient();

		const mockEUR = await viem.deployContract("MockEUR");

		const buyerInitialAmount = 20_000_000n; // 200.000,00 mEUR
		const purchasePrice = 15_000_000n; // 150.000,00 mEUR

		// Administrator dodjeljuje tokene kupcu.
		const mintTransactionHash = await mockEUR.write.mint([
			buyer.account.address,
			buyerInitialAmount,
		]);

		await publicClient.waitForTransactionReceipt({
			hash: mintTransactionHash,
		});

		// Kupac dopušta escrow adresi korištenje dijela svojih tokena.
		const approveTransactionHash = await mockEUR.write.approve(
			[escrowAccount.account.address, purchasePrice],
			{
				account: buyer.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: approveTransactionHash,
		});

		const allowanceBeforeTransfer = await mockEUR.read.allowance([
			buyer.account.address,
			escrowAccount.account.address,
		]);

		console.log("\n--- ODOBRENJE I PRIJENOS TOKENA ---");
		console.log("Adresa kupca:", buyer.account.address);
		console.log("Adresa prodavatelja:", seller.account.address);
		console.log("Simulirana escrow adresa:", escrowAccount.account.address);
		console.log("Odobreni iznos:", allowanceBeforeTransfer.toString());

		// Escrow koristi odobrenje i prenosi tokene kupca prodavatelju.
		const transferTransactionHash = await mockEUR.write.transferFrom(
			[buyer.account.address, seller.account.address, purchasePrice],
			{
				account: escrowAccount.account,
			},
		);

		await publicClient.waitForTransactionReceipt({
			hash: transferTransactionHash,
		});

		const buyerBalance = await mockEUR.read.balanceOf([buyer.account.address]);

		const sellerBalance = await mockEUR.read.balanceOf([
			seller.account.address,
		]);

		const allowanceAfterTransfer = await mockEUR.read.allowance([
			buyer.account.address,
			escrowAccount.account.address,
		]);

		console.log("Stanje kupca nakon prijenosa:", buyerBalance.toString());
		console.log(
			"Stanje prodavatelja nakon prijenosa:",
			sellerBalance.toString(),
		);
		console.log("Preostalo odobrenje:", allowanceAfterTransfer.toString());
		console.log("-------------------------------------\n");

		assert.equal(
			allowanceBeforeTransfer,
			purchasePrice,
			"Escrow mora imati odobrenje za kupoprodajnu cijenu",
		);

		assert.equal(buyerBalance, 5_000_000n, "Kupcu mora ostati 50.000,00 mEUR");

		assert.equal(
			sellerBalance,
			purchasePrice,
			"Prodavatelj mora primiti 150.000,00 mEUR",
		);

		assert.equal(
			allowanceAfterTransfer,
			0n,
			"Odobrenje mora biti potrošeno nakon prijenosa",
		);
	});
});
