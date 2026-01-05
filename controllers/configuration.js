//Pools handle multiple connections in postgres
const { Pool } = require('pg')

//Database connection
const pool = new Pool({
    user: 'ericsegev',
    host: 'localhost',
    database: 'ezra_ai',
    password: '',
    port: 5432
});

const tableDefinitions = {
    demographics: {
        name: 'demographics',
        fields: ['account_id', 'first_name', 'last_name', 'gender', 'industry']
    },
    incomes: {
        name: 'incomes',
        fields: ['account_id', 'source', 'frequency', 'amount']
    },
    assets: {
        name: 'assets',
        fields: ['account_id', 'name', 'category', 'value']
    },
    liabilities: {
        name: 'liabilities',
        fields: ['account_id', 'name', 'category', 'value']
    },
    fixedCosts: {
        name: 'fixed_costs',
        fields: ['account_id', 'name', 'category', 'amount']
    },
    files: {
        name: 'files',
        fields: ['account_id', 'category', 'path']
    },
    users: {
        name: 'users',
        fields: ['account_id', 'username', 'password']
    }
}

//CREATE
const create = async (req, res) => {
    const tableParam = req.params.table
    const table = tableDefinitions[tableParam].name;
    console.log(`table: ${table}`)
    const fields = tableDefinitions[tableParam].fields;
    const values = req.body.values

    // Generates the string: "$1, $2, $3, $4, $5"
    const variablesStr = values.map((_, i) => `$${i + 1}`).join(', ');

    //Build query by joining the fields array and the provided body from the req
    const query = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${variablesStr}) RETURNING id;`
    console.log(`Executing: ${query} with ${values}`)

    const result = await pool.query(query, values)

    res.json({
        success: true,
        data: result.rows[0].id
    });
}

//READ
const index = async (req, res) => {
    const userAcctId = req.params.userAcctId;

    const demographicsResult = await pool.query(`SELECT * FROM demographics WHERE account_id=$1;`, [userAcctId]);
    const incomesResult = await pool.query(`SELECT * FROM incomes WHERE account_id=$1;`, [userAcctId]);
    const assetsResult = await pool.query(`SELECT * FROM assets WHERE account_id=$1;`, [userAcctId]);
    const liabilitiesResult = await pool.query(`SELECT * FROM liabilities WHERE account_id=$1;`, [userAcctId]);
    const fixedCostsResult = await pool.query(`SELECT * FROM fixed_costs WHERE account_id=$1;`, [userAcctId]);

    // console.log('Demographics:', demographicsResult.rows); // Check console

    const response = {
        demographics: demographicsResult.rows,
        incomes: incomesResult.rows,
        assets: assetsResult.rows,
        liabilities: liabilitiesResult.rows,
        fixedCosts: fixedCostsResult.rows,
    };

    // console.log('Sending response:', response); // Check what's being sent

    res.json(response);
}

//UPDATE
const update = async (req, res) => {
    const tableParam = req.params.table
    const table = tableDefinitions[tableParam].name;
    const field = req.params.field;
    const id = req.params.id;
    console.log(`table: ${table}, body: ${req.body[0]}`)
    // const fields = tableDefinitions[tableParam].fields;
    const value = req.body[0];

    // Generates the string: "$1, $2, $3, $4, $5"
    // const variablesStr = values.map((_, i) => `$${i + 1}`).join(', ');

    //Build query by joining the fields array and the provided body from the req
    const query = `UPDATE ${table} SET ${field} = $1 WHERE id=$2 RETURNING id;`
    const values = [value, id];
    // const query = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${variablesStr}) RETURNING id;`
    console.log(`Executing: ${query} with ${values}`)

    const result = await pool.query(query, values)

    res.json({
        success: true,
        data: result.rows[0].id
    });
}

//DELETE
const deleteRecord = async (req, res) => {
    const tableParam = req.params.table
    const table = tableDefinitions[tableParam].name;
    const id = req.params.id

    const query = `DELETE FROM ${table} WHERE id = $1 RETURNING id;`

    const result = await pool.query(query, [id])

    res.json({
        success: true,
        data: result.rows[0].id
    });
}


module.exports = {
    create,
    index,
    update,
    deleteRecord
}