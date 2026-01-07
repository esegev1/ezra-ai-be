

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