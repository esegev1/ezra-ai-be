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

    if (type === 'budgetlang') {
        //pull out budget numbers (can be refactored later)
        const query = queries['budget'];
        const results = await pool.query(query, [acctId])

        //convert data to numbers to run precent analysis
        const housingExp = Number(results.housing_expenses);
        const otherExp = Number(results.other_expenses);
        const leftOver = Number(results.monthly_income) - (housingExp + otherExp);

        //check how much of the monthly budget is spend on categorie and analyze it
        const total = housingExp + otherExp + leftOver;
        const housingPer = housingExp/total;
        const fixedCostsPer = (housingExp+otherExp)/total

        const housingStr = housingPer > .3 ? 'You are spending too much on housing, this is a major expense and you should watch is intensly.' : 'You are doing well on housing expense!';
        const fixedCostsStr = fixedCostsPer > .65? 'This is too high! You are taking on major risk of spending too much of your money' : 'Your fixed costs are in check, but make sure you put the left over money into savings!'
        const moreStr = 'You can read more about the 50/30/20 rule here'

        const language = {
            housing: housingStr,
            fixedCosts: fixedCostsStr,
            more: moreStr
        }

        console.log("language: ", language)
        res.json(language)
    } else {
        const query = queries[type];
        const results = await pool.query(query, [acctId])
        console.log("results: ", results.rows)
        res.json(results.rows)

    }
    
    // res.json(results.rows)
}

module.exports = {
    show
}
