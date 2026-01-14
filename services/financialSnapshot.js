import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Postgres connection
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        user: "ericsegev",
        host: "localhost",
        database: "ezra_ai",
        password: "",
        port: 5432,
    });

/**
 * Safely convert nullable DB values to numbers.
 */
const toNum = (v) => (v ?? 0);    

/**
 * normalizeMonthlyIncome(amount, frequency)
 * Converts various pay frequencies into a standardized monthly number.
 */
const normalizeMonthlyIncome = (amount, frequency) => {
    if (!amount || !frequency) return 0;

    const frequencyMultipliers = {
        "Every 2 Weeks": (amount * 26) / 12,
        "15th And 30th": amount * 2,
        Weekly: (amount * 52) / 12,
        Monthly: amount,
    };

    return frequencyMultipliers[frequency] ?? 0;
};

/**
 * getFinancialSnapshot(accountId)
 * Fetches all relevant financial data for a specific user.   
 */
export const getFinancialSnapshot = async (accountId=2) => {
    const [fixedCostsResult, incomesResult, assetsResult, liabilitiesResult, spendingResult] =
        await Promise.all([
            pool.query(
                `SELECT name, amount, category
                FROM fixed_costs
                WHERE account_id = $1
                ORDER BY amount DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT source, amount, frequency
                FROM incomes
                WHERE account_id = $1
                ORDER BY amount DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT name, category, value
                FROM assets
                WHERE account_id = $1
                ORDER BY value DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT name, category, value
                FROM liabilities
                WHERE account_id = $1
                ORDER BY value DESC`,
                [accountId]
            ),
            pool.query(
                `SELECT
                    TO_CHAR(transaction_date, 'Month') name, 
                    category, 
                    SUM(amount) value
                FROM credit_cards
                WHERE account_id = $1 
                GROUP BY 1,2;`,
                [accountId]
            ),
        ]);

// Map rows -> clean objects
const fixedCosts = fixedCostsResult.rows.map(({ name, category, amount }) => ({
    name,
    category,
    amount: toNum(amount),
}));

const incomes = incomesResult.rows.map(({ source, amount, frequency }) => {
    const numAmount = toNum(amount);
    return {
        source,
        // frequency,
        // originalAmount: numAmount,
        monthlyAmount: normalizeMonthlyIncome(numAmount, frequency),
    };
});

const assets = assetsResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

const liabilities = liabilitiesResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

const spending = spendingResult.rows.map(({ name, category, value }) => ({
    name,
    category,
    value: toNum(value),
}));

// Aggregation - Use Number() to prevent string concatenation
const totalFixedCosts = fixedCosts.reduce((sum, { amount }) => sum + Number(amount || 0), 0);
const totalMonthlyIncome = incomes.reduce((sum, { monthlyAmount }) => sum + Number(monthlyAmount || 0), 0);
const totalAssets = assets.reduce((sum, { value }) => sum + Number(value || 0), 0);
const totalLiabilities = liabilities.reduce((sum, { value }) => sum + Number(value || 0), 0);
const totalSpending = spending.reduce((sum, { value }) => sum + Number(value || 0), 0);

const output = {
    fixedCosts,
    incomes,
    assets,
    liabilities,
    spending,
    totals: {
        totalFixedCosts,
        totalMonthlyIncome,
        totalAssets,
        totalLiabilities,
        totalSpending,
        netWorthApprox: totalAssets - totalLiabilities,
        monthlyCashflowApprox: totalMonthlyIncome - totalFixedCosts - totalSpending,
    },
};
// console.log("output: ", output)

return (output)
};

// getFinancialSnapshot();