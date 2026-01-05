const queriesObj = {
    budget: `
        WITH income AS (
            SELECT 
            account_id,
                SUM(
                    CASE
                        WHEN frequency = 'every week' THEN (amount*52)/12
                        WHEN frequency = 'Every 2 Weeks' THEN (amount*26)/12
                        WHEN frequency = '15th And 30th' THEN (amount*24)/12
                        WHEN frequency = 'Monthly' THEN amount
                        ELSE 0
                    END
                ) AS monthly_income
            FROM incomes
            WHERE account_id=$1
            GROUP BY 1
        ),
        fixed_costs AS (
            SELECT 
                account_id,
                SUM(
                    CASE
                        WHEN category = 'Mortgage' THEN amount
                        WHEN category = 'HOA Fees' THEN amount
                        WHEN category = 'Utilities' THEN amount
                        ELSE 0
                    END
                ) AS housing_expenses,
                SUM(
                    CASE
                        WHEN category NOT IN ('Mortgage', 'HOA Fees', 'Utilities') THEN amount
                        ELSE 0
                    END
                ) AS other_expenses
            FROM fixed_costs
            WHERE account_id=$1
            GROUP BY 1
        )
        SELECT 
            a.monthly_income,
            b.housing_expenses,
            b.other_expenses
        FROM income a
        LEFT JOIN fixed_costs b
            ON a.account_id = b.account_id
        ;    
    `,
    topcosts: `
        SELECT 
            name, 
            amount  
        FROM fixed_costs 
        WHERE account_id=$1
        ORDER BY amount DESC 
        LIMIT 4
        ;
    `
}



module.exports = queriesObj;













// const tableDefinitions = {
//         demoTable: { 
//             name: 'demographics',
//             fields: ['id', 'account_id', 'first_name', 'last_name', 'gender', 'industry']
//         },
//         incomeTable: {
//             name: 'incomes',
//             fields: ['id', 'account_id', 'source', 'amount', 'frequency']
//         },
//         assetsTable: {
//             name: 'assets',
//             fields: ['id', 'account_id', 'name', 'category', 'value']
//         },
//         liabilitiesTable: {
//             name: 'liabilities',
//             fields: ['id', 'account_id', 'name', 'category', 'value']
//         },
//         fixedCostsTable:  {
//             name: 'fixed_costs',
//             fields: ['id', 'account_id', 'name', 'category', 'amount']
//         },
//         filesTable: {
//             name: 'files',
//             fields: ['id','account_id', 'category', 'path']
//         },
//         usersTable:  {
//             name: 'users',
//             fields: ['id', 'account_id', 'username', 'password']
//         }
//     }

// const insertdata = async (table, values) => {

//     const table = tableDefinitions[table].name;
//     const fields = tableDefinitions[table].fields;

//     const query = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${values.join(', ')});`

// } 