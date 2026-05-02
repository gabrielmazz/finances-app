export type CategoryAnalysisPdfTone = 'gain' | 'expense' | 'neutral';

export type CategoryAnalysisPdfMetric = {
	label: string;
	value: string;
	helper?: string;
	tone?: CategoryAnalysisPdfTone;
};

export type CategoryAnalysisPdfMonth = {
	label: string;
	valueLabel: string;
	countLabel: string;
	isCurrentMonth: boolean;
};

export type CategoryAnalysisPdfBreakdown = {
	name: string;
	valueLabel: string;
	shareLabel: string;
};

export type CategoryAnalysisPdfMovement = {
	name: string;
	dateLabel: string;
	sourceLabel: string;
	description: string;
	amountLabel: string;
	amountTone: CategoryAnalysisPdfTone;
};

type CategoryAnalysisPdfParams = {
	title: string;
	categoryLabel: string;
	categoryKindLabel: string;
	movementTypeLabel: string;
	generatedAtLabel: string;
	insightMessage: string;
	statusLabel: string;
	primaryMetricLabel: string;
	primaryMetricValue: string;
	primaryMetricHelper: string;
	metrics: CategoryAnalysisPdfMetric[];
	months: CategoryAnalysisPdfMonth[];
	breakdown: CategoryAnalysisPdfBreakdown[];
	movements: CategoryAnalysisPdfMovement[];
	emptyBreakdownLabel: string;
	emptyMovementsLabel: string;
	privacyNotice: string | null;
};

const escapeHtml = (value: string | number | null | undefined) =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export const buildCategoryAnalysisPdfHtml = ({
	title,
	categoryLabel,
	categoryKindLabel,
	movementTypeLabel,
	generatedAtLabel,
	insightMessage,
	statusLabel,
	primaryMetricLabel,
	primaryMetricValue,
	primaryMetricHelper,
	metrics,
	months,
	breakdown,
	movements,
	emptyBreakdownLabel,
	emptyMovementsLabel,
	privacyNotice,
}: CategoryAnalysisPdfParams) => {
	const renderMetricCard = (metric: CategoryAnalysisPdfMetric) => `
		<div class="metric-card ${metric.tone ?? 'neutral'}">
			<div class="metric-label">${escapeHtml(metric.label)}</div>
			<div class="metric-value">${escapeHtml(metric.value)}</div>
			${metric.helper ? `<div class="metric-helper">${escapeHtml(metric.helper)}</div>` : ''}
		</div>
	`;

	const renderMonthRow = (month: CategoryAnalysisPdfMonth) => `
		<tr>
			<td>
				<div class="table-main">${escapeHtml(month.label)}</div>
				<div class="table-muted">${month.isCurrentMonth ? 'Mês atual' : 'Histórico'}</div>
			</td>
			<td class="amount-cell neutral">${escapeHtml(month.valueLabel)}</td>
			<td>${escapeHtml(month.countLabel)}</td>
		</tr>
	`;

	const renderBreakdownRow = (item: CategoryAnalysisPdfBreakdown, index: number) => `
		<tr>
			<td class="index-cell">${String(index + 1).padStart(2, '0')}</td>
			<td>
				<div class="table-main">${escapeHtml(item.name)}</div>
				<div class="table-muted">${escapeHtml(item.shareLabel)}</div>
			</td>
			<td class="amount-cell neutral">${escapeHtml(item.valueLabel)}</td>
		</tr>
	`;

	const renderMovementRow = (movement: CategoryAnalysisPdfMovement, index: number) => `
		<tr>
			<td class="index-cell">${String(index + 1).padStart(2, '0')}</td>
			<td>
				<div class="table-main">${escapeHtml(movement.name)}</div>
				<div class="table-muted">${escapeHtml(movement.description)}</div>
			</td>
			<td>
				<div class="table-main">${escapeHtml(movement.dateLabel)}</div>
				<div class="table-muted">${escapeHtml(movement.sourceLabel)}</div>
			</td>
			<td class="amount-cell ${movement.amountTone}">${escapeHtml(movement.amountLabel)}</td>
		</tr>
	`;

	return `
		<!doctype html>
		<html lang="pt-BR">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<style>
				@page {
					size: A4;
					margin: 24px;
				}

				* {
					box-sizing: border-box;
				}

				body {
					margin: 0;
					background: #f8fafc;
					color: #0f172a;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
					font-size: 12px;
					line-height: 1.45;
				}

				.report {
					background: #ffffff;
					border: 1px solid #e2e8f0;
					border-radius: 24px;
					overflow: hidden;
				}

				.hero {
					padding: 28px 30px 30px;
					color: #ffffff;
					background:
						radial-gradient(circle at 82% 10%, rgba(250, 204, 21, 0.45) 0, transparent 34%),
						radial-gradient(circle at 16% 0%, rgba(56, 189, 248, 0.28) 0, transparent 30%),
						linear-gradient(135deg, #111827, #0f172a);
				}

				.hero-grid {
					display: grid;
					grid-template-columns: 1.4fr 0.8fr;
					gap: 22px;
					align-items: end;
				}

				.eyebrow {
					margin: 0 0 8px;
					color: rgba(255,255,255,0.74);
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				h1 {
					margin: 0;
					font-size: 28px;
					line-height: 1.08;
				}

				.hero-detail {
					margin-top: 10px;
					color: rgba(255,255,255,0.78);
					font-size: 12px;
				}

				.hero-panel {
					border: 1px solid rgba(255,255,255,0.22);
					border-radius: 18px;
					background: rgba(255,255,255,0.12);
					padding: 16px;
				}

				.hero-panel .label {
					color: rgba(255,255,255,0.74);
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				.hero-panel .value {
					margin-top: 5px;
					font-size: 22px;
					font-weight: 800;
				}

				.hero-panel .helper {
					margin-top: 6px;
					color: rgba(255,255,255,0.78);
					font-size: 11px;
				}

				.content {
					padding: 24px 30px 30px;
				}

				.notice {
					margin-bottom: 16px;
					border: 1px solid #fde68a;
					border-radius: 14px;
					background: #fffbeb;
					color: #92400e;
					padding: 11px 13px;
					font-size: 11px;
					font-weight: 700;
				}

				.insight {
					border: 1px solid #fde68a;
					border-radius: 18px;
					background: #fffbeb;
					color: #713f12;
					padding: 14px 16px;
					font-weight: 700;
				}

				.section {
					margin-top: 22px;
				}

				.section-header {
					display: flex;
					justify-content: space-between;
					gap: 16px;
					align-items: flex-end;
					margin-bottom: 11px;
				}

				h2 {
					margin: 0;
					font-size: 15px;
					letter-spacing: 0;
				}

				.section-caption {
					margin: 3px 0 0;
					color: #64748b;
					font-size: 11px;
				}

				.badge {
					display: inline-block;
					border: 1px solid #e2e8f0;
					border-radius: 999px;
					background: #f8fafc;
					color: #334155;
					padding: 7px 10px;
					font-size: 10px;
					font-weight: 800;
				}

				.metric-grid {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 10px;
				}

				.metric-card {
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					background: #f8fafc;
					padding: 13px;
					min-height: 88px;
				}

				.metric-card.gain {
					border-color: #bbf7d0;
					background: #f0fdf4;
				}

				.metric-card.expense {
					border-color: #fecaca;
					background: #fef2f2;
				}

				.metric-label {
					color: #64748b;
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				.metric-value {
					margin-top: 6px;
					font-size: 17px;
					font-weight: 800;
				}

				.metric-helper {
					margin-top: 5px;
					color: #64748b;
					font-size: 10px;
				}

				table {
					width: 100%;
					border-collapse: collapse;
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					overflow: hidden;
				}

				th {
					background: #f8fafc;
					color: #475569;
					text-align: left;
					font-size: 10px;
					text-transform: uppercase;
					padding: 10px;
				}

				td {
					border-top: 1px solid #e2e8f0;
					padding: 10px;
					vertical-align: top;
				}

				.index-cell {
					width: 38px;
					color: #94a3b8;
					font-weight: 800;
				}

				.table-main {
					font-weight: 800;
				}

				.table-muted {
					margin-top: 3px;
					color: #64748b;
					font-size: 10px;
				}

				.amount-cell {
					text-align: right;
					font-weight: 800;
					white-space: nowrap;
				}

				.amount-cell.gain {
					color: #059669;
				}

				.amount-cell.expense {
					color: #dc2626;
				}

				.empty-state {
					border: 1px dashed #cbd5e1;
					border-radius: 16px;
					background: #f8fafc;
					color: #64748b;
					padding: 18px;
					text-align: center;
				}

				.footer {
					margin-top: 26px;
					border-top: 1px solid #e2e8f0;
					padding-top: 13px;
					color: #94a3b8;
					font-size: 10px;
				}
			</style>
		</head>
		<body>
			<main class="report">
				<section class="hero">
					<div class="hero-grid">
						<div>
							<p class="eyebrow">Lumus Finanças · ${escapeHtml(movementTypeLabel)}</p>
							<h1>${escapeHtml(title)}</h1>
							<div class="hero-detail">
								${escapeHtml(categoryLabel)} · ${escapeHtml(categoryKindLabel)} · Gerado em ${escapeHtml(generatedAtLabel)}
							</div>
						</div>

						<div class="hero-panel">
							<div class="label">${escapeHtml(primaryMetricLabel)}</div>
							<div class="value">${escapeHtml(primaryMetricValue)}</div>
							<div class="helper">${escapeHtml(primaryMetricHelper)}</div>
						</div>
					</div>
				</section>

				<section class="content">
					${privacyNotice ? `<div class="notice">${escapeHtml(privacyNotice)}</div>` : ''}
					<div class="insight">${escapeHtml(insightMessage)}</div>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Resumo da comparação</h2>
								<p class="section-caption">Mês atual comparado com a média histórica recente.</p>
							</div>
							<span class="badge">${escapeHtml(statusLabel)}</span>
						</div>
						<div class="metric-grid">
							${metrics.map(renderMetricCard).join('')}
						</div>
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Evolução mensal</h2>
								<p class="section-caption">Valores do mesmo recorte usado na tela.</p>
							</div>
							<span class="badge">${months.length} meses</span>
						</div>
						<table>
							<thead>
								<tr>
									<th>Mês</th>
									<th>Valor</th>
									<th>Movimentos</th>
								</tr>
							</thead>
							<tbody>
								${months.map(renderMonthRow).join('')}
							</tbody>
						</table>
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Bancos e dinheiro</h2>
								<p class="section-caption">Distribuição do mês atual por origem.</p>
							</div>
							<span class="badge">${breakdown.length} fonte(s)</span>
						</div>
						${breakdown.length > 0
							? `
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>Fonte</th>
											<th>Valor</th>
										</tr>
									</thead>
									<tbody>
										${breakdown.map(renderBreakdownRow).join('')}
									</tbody>
								</table>
							`
							: `<div class="empty-state">${escapeHtml(emptyBreakdownLabel)}</div>`}
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Movimentos recentes</h2>
								<p class="section-caption">Movimentos recentes da categoria selecionada.</p>
							</div>
							<span class="badge">${movements.length} item(ns)</span>
						</div>
						${movements.length > 0
							? `
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>Movimento</th>
											<th>Origem</th>
											<th>Valor</th>
										</tr>
									</thead>
									<tbody>
										${movements.map(renderMovementRow).join('')}
									</tbody>
								</table>
							`
							: `<div class="empty-state">${escapeHtml(emptyMovementsLabel)}</div>`}
					</section>

					<div class="footer">
						Relatório gerado localmente no app Lumus Finanças. Valores seguem a preferência de privacidade ativa no momento da exportação.
					</div>
				</section>
			</main>
		</body>
		</html>
	`;
};
