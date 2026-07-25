import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RealEstateSystemModule", (m) => {
	// 1. Postavljanje registra nekretnina.
	const propertyRegistry = m.contract("PropertyRegistry");

	// 2. Postavljanje simuliranog euro tokena.
	const mockEUR = m.contract("MockEUR");

	// 3. Postavljanje escrow ugovora i povezivanje
	// s registrom nekretnina i mEUR tokenom.
	const realEstateEscrow = m.contract("RealEstateEscrow", [
		propertyRegistry,
		mockEUR,
	]);

	// 4. Čitanje identifikatora TRANSFER_ROLE uloge iz registra.
	const transferRole = m.staticCall(propertyRegistry, "TRANSFER_ROLE");

	// 5. Dodjeljivanje TRANSFER_ROLE uloge escrow ugovoru.
	m.call(propertyRegistry, "grantRole", [transferRole, realEstateEscrow], {
		id: "GrantTransferRoleToEscrow",
	});

	return {
		propertyRegistry,
		mockEUR,
		realEstateEscrow,
	};
});
