import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { lintLiquid } from './linter.js';

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from the current directory

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
