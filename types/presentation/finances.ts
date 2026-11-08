import type { InvestmentCashFlow } from '@/utils/investmentPortfolio';

import type { InvestmentSync } from '@/utils/investmentPortfolio';

export type FinanceInvestmentPortfolioActivity = {
	cashFlows: InvestmentCashFlow[];
	syncs: InvestmentSync[];
};
