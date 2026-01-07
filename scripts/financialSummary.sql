

-- DROP TABLE IF EXISTS public.credit_cards CASCADE;

-- CREATE TABLE IF NOT EXISTS credit_cards
--                 (
--                     id SERIAL PRIMARY KEY,
--                     account_id VARCHAR(100), 
--                     transaction_date DATE,
--                     post_date DATE,
--                     description VARCHAR(400),
--                     category VARCHAR(100),
--                     type VARCHAR(100),
--                     amount NUMERIC,
--                     memo VARCHAR(200) 
--                 )
--             ;

-- ALTER TABLE public.credit_cards
-- ALTER COLUMN amount TYPE NUMERIC;

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
            FROM public.incomes
            WHERE account_id='2'
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
            FROM public.fixed_costs
            WHERE account_id='2'
            GROUP BY 1
        ),
        spending AS (
            SELECT
                account_id,
                -- TO_CHAR(transaction_date, 'Month') name, 
                SUM(amount) spending
            FROM public.credit_cards
            WHERE account_id = '2' 
            GROUP BY 1
        )
        
        SELECT 
            a.monthly_income,
            b.housing_expenses,
            b.other_expenses,
            c.spending
        FROM income a
        LEFT JOIN fixed_costs b
            ON a.account_id = b.account_id
        LEFT JOIN spending c
            ON a.account_id = c.account_id
        ;  