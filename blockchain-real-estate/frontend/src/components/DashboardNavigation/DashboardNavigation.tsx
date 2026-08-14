import "./DashboardNavigation.css";

export type DashboardSection =
	| "overview"
	| "my-properties"
	| "all-properties"
	| "register-property"
	| "verification"
	| "create-sale"
	| "active-sales"
	| "purchase"
	| "mockeur"
	| "history";

interface DashboardNavigationProps {
	profile: string;
	activeSection: DashboardSection;
	onSectionChange: (section: DashboardSection) => void;
}

interface NavigationItem {
	id: DashboardSection;
	label: string;
}

const navigationByProfile: Record<string, NavigationItem[]> = {
	Administrator: [
		{ id: "overview", label: "Pregled" },
		{ id: "all-properties", label: "Sve nekretnine" },
		{ id: "mockeur", label: "MockEUR" },
		{ id: "history", label: "Povijest" },
	],

	Verifikator: [
		{ id: "overview", label: "Pregled" },
		{ id: "verification", label: "Verifikacija" },
	],

	Prodavatelj: [
		{ id: "overview", label: "Pregled" },
		{ id: "my-properties", label: "Moje nekretnine" },
		{ id: "register-property", label: "Registracija" },
		{ id: "create-sale", label: "Kreiranje prodaje" },
		{ id: "active-sales", label: "Aktivne prodaje" },
		{ id: "history", label: "Povijest" },
	],

	Kupac: [
		{ id: "overview", label: "Pregled" },
		{ id: "my-properties", label: "Moje nekretnine" },
		{ id: "purchase", label: "Kupnja" },
		{ id: "history", label: "Povijest" },
	],
};

export default function DashboardNavigation({
	profile,
	activeSection,
	onSectionChange,
}: DashboardNavigationProps) {
	const navigationItems = navigationByProfile[profile] ?? [
		{ id: "overview" as DashboardSection, label: "Pregled" },
	];

	return (
		<nav className="dashboard-navigation">
			<div className="dashboard-navigation-header">
				<p className="dashboard-navigation-eyebrow">Izbornik</p>

				<strong>{profile}</strong>
			</div>

			<div className="dashboard-navigation-items">
				{navigationItems.map((item) => (
					<button
						key={item.id}
						type="button"
						className={
							activeSection === item.id
								? "dashboard-navigation-item active"
								: "dashboard-navigation-item"
						}
						onClick={() => onSectionChange(item.id)}
					>
						{item.label}
					</button>
				))}
			</div>
		</nav>
	);
}
