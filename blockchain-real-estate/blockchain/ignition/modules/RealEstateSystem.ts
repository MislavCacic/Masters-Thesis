import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RealEstateSystem", (m) => {
	// Account #0 ostaje administrator sustava.
	const administrator = m.getAccount(0);

	// Account #3 postaje zasebni verifikator dokumentacije.
	const verifier = m.getAccount(3);

	const propertyRegistry = m.contract("PropertyRegistry", [], {
		from: administrator,
	});

	const mockEUR = m.contract("MockEUR", [], {
		from: administrator,
	});

	const realEstateEscrow = m.contract(
		"RealEstateEscrow",
		[propertyRegistry, mockEUR],
		{
			from: administrator,
		},
	);

	const verifierRole = m.staticCall(propertyRegistry, "VERIFIER_ROLE");

	const transferRole = m.staticCall(propertyRegistry, "TRANSFER_ROLE");

	// Poseban račun dobiva pravo provjere dokumentacije.
	m.call(propertyRegistry, "grantRole", [verifierRole, verifier], {
		from: administrator,
		id: "GrantVerifierRole",
	});

	// Samo escrow ugovor smije mijenjati digitalnog vlasnika.
	m.call(propertyRegistry, "grantRole", [transferRole, realEstateEscrow], {
		from: administrator,
		id: "GrantTransferRoleToEscrow",
	});

	return {
		propertyRegistry,
		mockEUR,
		realEstateEscrow,
	};
});
