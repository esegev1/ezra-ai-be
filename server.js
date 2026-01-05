const cors = require('cors');

const dotenv = require('dotenv')
dotenv.config()

//Pools handle multiple connections in postgres
const { Pool } = require('pg')

const express = require('express')
const app = express()

// Parse JSON in request body
app.use(express.json());

// Enable CORS (allow requests from other domains)
app.use(cors());

//Run various analysis on user data
// const analysisCtrl = require('./controllers/analysis');
// app.get('/analysis/budget', analysisCtrl.budget);

//Database connection
const pool = new Pool ({
    user: 'ericsegev',
    host: 'localhost',
    database: 'ezra_ai',
    password: '',
    port: 5432
});

const PORT = process.env.PORT

const configurationCtrl = require('./controllers/configuration');
const analysisCtrl = require('./controllers/analysis');

//Interactions with the configuration tables
app.get('/config/:userAcctId', configurationCtrl.index)
app.post('/config/:table', configurationCtrl.create);
app.put('/config/:table/:field/:id', configurationCtrl.update)
app.delete('/config/:table/:id', configurationCtrl.deleteRecord);


//Product data for a specific analysis
app.get('/analysis/:type/:userAcctId', analysisCtrl.show)

app.listen(PORT, () => {
    console.log(`Server running on https://localhost: ${PORT}`)
})