import AccountBalancePanel from "../AccountBalancePanel/AccountBalancePanel";
import type { DashboardSection } from "../DashboardNavigation/DashboardNavigation";
import DashboardStats from "../DashboardStats/DashboardStats";

import "./DashboardOverview.css";

interface DashboardOverviewProps {
	account: string;
	applicationProfile: string;
	onSectionChange: (section: DashboardSection) => void;
}

interface QuickAction {
	label: string;
	section: DashboardSection;
	description: string;
}

const actionsByProfile: Record<string, QuickAction[]> = {
	Administrator: [
		{
			label: "Sve nekretnine",
			section: "all-properties",
			description: "Pregled svih nekretnina registriranih u sustavu.",
		},
		{
			label: "Dodjela MockEUR",
			section: "mockeur",
			description: "Dodijeli simulirana sredstva korisnicima sustava.",
		},
		{
			label: "Povijest",
			section: "history",
			description: "Pregled završenih i otkazanih kupoprodaja.",
		},
	],

	Verifikator: [
		{
			label: "Verifikacija",
			section: "verification",
			description: "Pregledaj dokumentaciju i potvrdi ili odbij nekretninu.",
		},
	],

	Prodavatelj: [
		{
			label: "Moje nekretnine",
			section: "my-properties",
			description: "Pregled nekretnina u tvom digitalnom vlasništvu.",
		},
		{
			label: "Registriraj nekretninu",
			section: "register-property",
			description: "Dodaj novu nekretninu u blockchain registar.",
		},
		{
			label: "Kreiraj prodaju",
			section: "create-sale",
			description: "Ponudi potvrđenu nekretninu na prodaju.",
		},
		{
			label: "Aktivne prodaje",
			section: "active-sales",
			description: "Pregledaj ili otkaži svoje aktivne prodaje.",
		},
	],

	Kupac: [
		{
			label: "Moje nekretnine",
			section: "my-properties",
			description: "Pregled nekretnina koje su u tvom digitalnom vlasništvu.",
		},
		{
			label: "Kupnja nekretnine",
			section: "purchase",
			description: "Pregledaj aktivne prodaje i pokreni kupoprodaju.",
		},
		{
			label: "Povijest",
			section: "history",
			description: "Pregledaj prethodno završene kupoprodaje.",
		},
	],
};

export default function DashboardOverview({
	account,
	applicationProfile,
	onSectionChange,
}: DashboardOverviewProps) {
	const actions = actionsByProfile[applicationProfile] ?? [];

	return (
		<div className="dashboard-overview">
			<section className="dashboard-overview-card">
				<p className="dashboard-overview-eyebrow">Nadzorna ploča</p>

				<h2>{applicationProfile}</h2>

				<p className="dashboard-overview-description">
					Odaberi jednu od dostupnih funkcionalnosti sustava.
				</p>

				{actions.length > 0 && (
					<div className="dashboard-overview-actions">
						{actions.map((action) => (
							<button
								key={action.section}
								type="button"
								className="dashboard-overview-action"
								onClick={() => onSectionChange(action.section)}
							>
								<strong>{action.label}</strong>
								<span>{action.description}</span>
							</button>
						))}
					</div>
				)}
			</section>

			<DashboardStats
				account={account}
				applicationProfile={applicationProfile}
			/>

			<AccountBalancePanel
				account={account}
				applicationProfile={applicationProfile}
			/>
		</div>
	);
}
