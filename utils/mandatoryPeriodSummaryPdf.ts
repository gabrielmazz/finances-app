export type MandatoryPeriodSummaryPdfTone = 'gain' | 'expense' | 'neutral';

export type MandatoryPeriodSummaryPdfMetric = {
	label: string;
	value: string;
	helper?: string;
	tone?: MandatoryPeriodSummaryPdfTone;
};

export type MandatoryPeriodSummaryPdfItem = {
	id: string;
	name: string;
	statusLabel: string;
	dateLabel: string;
	tagLabel: string;
	scheduleLabel: string;
	description: string;
	amountLabel: string;
	amountTone: MandatoryPeriodSummaryPdfTone;
};

type MandatoryPeriodSummaryPdfParams = {
	reportKindLabel: string;
	title: string;
	monthLabel: string;
	generatedAtLabel: string;
	primaryMetricLabel: string;
	primaryMetricValue: string;
	primaryMetricHelper: string;
	metrics: MandatoryPeriodSummaryPdfMetric[];
	items: MandatoryPeriodSummaryPdfItem[];
	cardBaseColor: string;
	cardGlowColor: string;
	cardHighlightColor: string;
	emptyStateLabel: string;
	privacyNotice: string | null;
};

const escapeHtml = (value: string | number | null | undefined) =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export const buildMandatoryPeriodSummaryPdfHtml = ({
	reportKindLabel,
	title,
	monthLabel,
	generatedAtLabel,
	primaryMetricLabel,
	primaryMetricValue,
	primaryMetricHelper,
	metrics,
	items,
	cardBaseColor,
	cardGlowColor,
	cardHighlightColor,
	emptyStateLabel,
	privacyNotice,
}: MandatoryPeriodSummaryPdfParams) => {
	const renderMetricCard = (metric: MandatoryPeriodSummaryPdfMetric) => `
		<div class="metric-card ${metric.tone ?? 'neutral'}">
			<div class="metric-label">${escapeHtml(metric.label)}</div>
			<div class="metric-value">${escapeHtml(metric.value)}</div>
			${metric.helper ? `<div class="metric-helper">${escapeHtml(metric.helper)}</div>` : ''}
		</div>
	`;

	const renderItemRow = (item: MandatoryPeriodSummaryPdfItem, index: number) => `
		<tr>
			<td class="index-cell">${String(index + 1).padStart(2, '0')}</td>
			<td>
				<div class="item-title">${escapeHtml(item.name)}</div>
				<div class="item-description">${escapeHtml(item.description)}</div>
			</td>
			<td>
				<div class="table-main">${escapeHtml(item.statusLabel)}</div>
				<div class="table-muted">${escapeHtml(item.tagLabel)}</div>
			</td>
			<td>
				<div class="table-main">${escapeHtml(item.dateLabel)}</div>
				<div class="table-muted">${escapeHtml(item.scheduleLabel)}</div>
			</td>
			<td class="amount-cell ${item.amountTone}">${escapeHtml(item.amountLabel)}</td>
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
						radial-gradient(circle at 85% 8%, ${cardHighlightColor} 0, transparent 34%),
						radial-gradient(circle at 18% 0%, ${cardGlowColor} 0, transparent 28%),
						linear-gradient(135deg, ${cardBaseColor}, #0f172a);
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

				.section {
					margin-top: 22px;
				}

				.section:first-child {
					margin-top: 0;
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
					min-height: 82px;
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					background: #f8fafc;
					padding: 13px;
				}

				.metric-card.gain {
					background: #ecfdf5;
					border-color: #bbf7d0;
				}

				.metric-card.expense {
					background: #fef2f2;
					border-color: #fecaca;
				}

				.metric-label {
					color: #64748b;
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				.metric-value {
					margin-top: 7px;
					color: #0f172a;
					font-size: 17px;
					font-weight: 850;
				}

				.metric-card.gain .metric-value,
				.amount-cell.gain {
					color: #047857;
				}

				.metric-card.expense .metric-value,
				.amount-cell.expense {
					color: #b91c1c;
				}

				.metric-helper {
					margin-top: 4px;
					color: #64748b;
					font-size: 10px;
				}

				table {
					width: 100%;
					border-collapse: separate;
					border-spacing: 0;
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					overflow: hidden;
				}

				thead th {
					background: #f1f5f9;
					color: #475569;
					font-size: 10px;
					font-weight: 850;
					padding: 10px 11px;
					text-align: left;
					text-transform: uppercase;
				}

				tbody td {
					border-top: 1px solid #e2e8f0;
					padding: 12px 11px;
					vertical-align: top;
				}

				tr {
					page-break-inside: avoid;
				}

				.index-cell {
					width: 42px;
					color: #94a3b8;
					font-weight: 800;
				}

				.item-title {
					font-size: 12px;
					font-weight: 850;
					color: #0f172a;
				}

				.item-description,
				.table-muted {
					margin-top: 3px;
					color: #64748b;
					font-size: 10px;
				}

				.table-main {
					font-weight: 750;
					color: #0f172a;
				}

				.amount-cell {
					width: 108px;
					text-align: right;
					white-space: nowrap;
					font-size: 12px;
					font-weight: 850;
					color: #0f172a;
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
							<p class="eyebrow">Lumus Finanças · ${escapeHtml(reportKindLabel)}</p>
							<h1>${escapeHtml(title)}</h1>
							<div class="hero-detail">
								${escapeHtml(monthLabel)} · Gerado em ${escapeHtml(generatedAtLabel)}
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

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Resumo do mês</h2>
								<p class="section-caption">Totais referentes ao ciclo mensal carregado na tela.</p>
							</div>
							<span class="badge">${escapeHtml(monthLabel)}</span>
						</div>
						<div class="metric-grid">
							${metrics.map(renderMetricCard).join('')}
						</div>
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Itens incluídos</h2>
								<p class="section-caption">Lista de recorrências com valores previstos ou realizados no ciclo atual.</p>
							</div>
							<span class="badge">${items.length} item(ns)</span>
						</div>

						${items.length > 0
							? `
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>Item</th>
											<th>Status / Tag</th>
											<th>Data / Regra</th>
											<th>Valor</th>
										</tr>
									</thead>
									<tbody>
										${items.map(renderItemRow).join('')}
									</tbody>
								</table>
							`
							: `<div class="empty-state">${escapeHtml(emptyStateLabel)}</div>`}
					</section>

					<div class="footer">
						Relatório gerado localmente pelo app. Recorrências seguem as regras de ciclo mensal documentadas no vault do Lumus Finanças.
					</div>
				</section>
			</main>
		</body>
		</html>
	`;
};
