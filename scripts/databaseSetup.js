//Pools handle multiple connections in postgres
const { Pool } = require('pg')

//Database connection
const pool = new Pool ({
    user: 'ericsegev',
    host: 'localhost',
    database: 'ezra_ai',
    password: '',
    port: 5432
});

const createDatabase = async () => {

    // const databaseQuery = `CREATE DATABASE IF NOT EXISTS ezra_ai;` ;
    
    const tableQueries = {
        // createDB: `
        //     CREATE DATABASE IF NOT EXISTS ezra_ai;
        // `,
        // demoTable: `
        //     CREATE TABLE IF NOT EXISTS demographics 
        //         (
        //             id SERIAL PRIMARY KEY, 
        //             account_id VARCHAR(100), 
        //             first_name VARCHAR(100), 
        //             last_name VARCHAR(100), 
        //             gender VARCHAR(100), 
        //             industry VARCHAR(100)
        //         )
        //     ;
        // `,
        incomeTable: `
            CREATE TABLE IF NOT EXISTS incomes 
                (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(100), 
                    source VARCHAR(100), 
                    amount BIGINT, 
                    frequency VARCHAR(100) 
                )
            ;
        `,
        assetsTable: `
            CREATE TABLE IF NOT EXISTS assets 
                (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(100), 
                    name VARCHAR(100),
                    category VARCHAR(100),  
                    value BIGINT
                )
            ;
        `,
        liabilitiesTable: `
            CREATE TABLE IF NOT EXISTS liabilities 
                (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(100), 
                    name VARCHAR(100),
                    category VARCHAR(100),  
                    value BIGINT
                )
            ;
        `,
        fixedCostsTable: `
            CREATE TABLE IF NOT EXISTS fixed_costs 
                (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(100), 
                    name VARCHAR(100), 
                    amount BIGINT, 
                    category VARCHAR(100)
                )
            ;
        `,
        filesTable: `
            CREATE TABLE IF NOT EXISTS files 
                (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(100), 
                    category VARCHAR(100), 
                    path VARCHAR(200)
                )
            ;
        `,
        usersTable: `
            CREATE TABLE IF NOT EXISTS users
                (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100), 
                    password VARCHAR(100),
                    account_id VARCHAR(100)
                )
            ;
        `,
    }

    //make sure database is created
    // await pool.query(databaseQuery)

    //Break down the queryObj into key: value pairs, each value is a 
    for (let [key, value] of Object.entries(tableQueries)) {
        console.log(`key: ${key}`)
        // console.log("value: ", value)
        const result = await pool.query(value);
        console.log("results: ", result)
    }    

}

// createDatabase()