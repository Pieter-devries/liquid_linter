import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { lintLiquid } from './linter';
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('dist')); // Serve static files from the dist directory
app.post('/lint', (req, res) => {
    const { code, parameter } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }
    const result = lintLiquid(code, parameter);
    res.json(result);
});
app.listen(port, () => {
    console.log(`Linter API listening at http://localhost:${port}`);
});
