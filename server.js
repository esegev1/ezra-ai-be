/**
 * server.js
 * -----------------------------------------------------------------------------
 * Converted to ES Modules (ESM) to support modern 'import' syntax
 * and integration with the OpenAI controller.
 */

import 'dotenv/config'; // Automatically loads .env
import express from 'express';
import cors from 'cors';

// Import your controllers
// NOTE: When using ESM, you MUST include the file extension (e.g., .js or .mjs)
import * as configurationCtrl from './controllers/configuration.js';
import * as analysisCtrl from './controllers/analysis.js';
import * as openaiCtrl from './controllers/openai.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------

app.use(express.json());
app.use(cors());

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

// Interactions with the configuration tables
app.get('/config/:userAcctId', configurationCtrl.index);
app.post('/config/:table', configurationCtrl.create);
app.put('/config/:table/:field/:id', configurationCtrl.update);
app.delete('/config/:table/:id', configurationCtrl.deleteRecord);

// Simple analysis based on queries
app.get('/analysis/:type/:userAcctId', analysisCtrl.show);

// AI based analysis (The SSE Pipeline)
app.post('/openai', openaiCtrl.create);

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

