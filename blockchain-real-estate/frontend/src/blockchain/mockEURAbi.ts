export const mockEURAbi = [
	// Podaci tokena
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",

	// Stanja i odobrenja
	"function balanceOf(address account) view returns (uint256)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function approve(address spender, uint256 amount) returns (bool)",

	// Dodjela simuliranih sredstava
	"function mint(address recipient, uint256 amount)",

	// Događaji
	"event Transfer(address indexed from, address indexed to, uint256 value)",
	"event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;
