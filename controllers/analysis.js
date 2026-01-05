//Pools handle multiple connections in postgres
const { Pool } = require('pg')
const queries = require('../scripts/queries');

//Database connection
const pool = new Pool({
    user: 'ericsegev',
    host: 'localhost',
    database: 'ezra_ai',
    password: '',
    port: 5432
});


const show = async (req, res) => {
    console.log(`request`);
    const type = req.params.type;
    const acctId = req.params.userAcctId;

    const query = queries[type];
    const results = await pool.query(query, [acctId])
    console.log("results: ", results.rows)


    res.json(results.rows)
}

module.exports = {
    show
}
