export function getPropertyStatusLabel(status: number): string {
	switch (status) {
		case 0:
			return "Na čekanju";
		case 1:
			return "Potvrđena";
		case 2:
			return "Odbijena";
		default:
			return "Nepoznat status";
	}
}

export function getSaleStatusLabel(status: number): string {
	switch (status) {
		case 0:
			return "Kreirana";
		case 1:
			return "Financirana";
		case 2:
			return "Završena";
		case 3:
			return "Otkazana";
		default:
			return "Nepoznat status";
	}
}
