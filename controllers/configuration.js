//Pools handle multiple connections in postgres
import pg from 'pg';
// const { Pool } = require('pg')

//Database connection
const pool = new pg.Pool({
    user: 'ericsegev',
    host: 'localhost',
    database: 'ezra_ai',
    password: '',
    port: 5432
});

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import csvParser from 'csv-parser';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { emitWarning } from 'process';

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', req.body.account_id);
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const category = req.body.category || 'unknown';
        cb(null, `${category}_${timestamp}_${file.originalname}`);
    }
});

const upload = multer({ storage });

// Helper function to parse CSV
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Helper function to parse Excel
function parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

// Helper function to insert transactions
async function insertTransactions(table, accountId, category, data, pool) {
    const inserted = [];

    for (const row of data) {
        const values = [
            accountId,
            category,
            row.date || row.Date,
            row.description || row.Description,
            row.amount || row.Amount || row.debit || row.Debit || row.credit || row.Credit
        ];

        try {
            const result = await pool.query(
                `INSERT INTO ${table} (account_id, category, date, description, amount) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                values
            );
            inserted.push(result.rows[0]);
        } catch (err) {
            console.error('Insert error:', err);
        }
    }

    return inserted;
}



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
    creditCards: {
        name: 'credit_cards',
        fields: ['account_id', 'transaction_date', 'post_date', 'description', 'category', 'type', 'amount', 'memo']
    },
    users: {
        name: 'users',
        fields: ['account_id', 'username', 'password']
    }
}

//CREATE - Modified create function
const create = async (req, res) => {
    const { table } = req.params;
    console.log("req.body: ", req.body);
    console.log("category: ", req.body.category);
    
    const { values, data, category, acctId } = req.body;

    const client = await pool.connect();

    await client.query('BEGIN');

    if (data) {
        console.log('file upload')
        const tableDef = tableDefinitions[req.body.category]
        const query = `INSERT INTO ${tableDef.name} ("id",${tableDef.fields.map(col => `"${col}"`).join(', ')}) VALUES (DEFAULT, $1, ${data[0].map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`
        console.log("query: ", query);

        for (const row of data) {
            //convert the amount from string to number and take absolute values
            row[5] = Math.abs(parseFloat(row[5].replace(/,/g, '')));

            console.log("row: ", row)
            row.unshift(acctId)
            console.log("row: ", row)

            await client.query(query,row)
        }
    } else if (values) {
        const tableDef = tableDefinitions[table]
        const query = `INSERT INTO ${tableDef.name} ("id",${tableDef.fields.map(col => `"${col}"`).join(', ')}) VALUES (DEFAULT, ${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`
        console.log("query: ",query)
        //convert the amount from string to number and take absolute values
        // values[5] = Math.abs(parseFloat(values[5].replace(/,/g, '')));
        
        await client.query(query, values )
    } else {
        console.log('No data was provided');
    }

    await client.query('COMMIT');

    res.json({ 
            success: true, 
            rowsInserted: data? data.length : 1
        });

};


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


export {
    create,
    index,
    update,
    deleteRecord
}