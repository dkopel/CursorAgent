import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import datapointRoutes from './routes/datapointRoutes.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/datapoints', datapointRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`SpotMap API running on http://localhost:${PORT}`);
});
