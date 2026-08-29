import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// Servicos
import { processImage } from './services/ai-orchestrator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Configurar multer para upload em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Rota de Health Check (útil para o Render)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Criativa Sisters Backend Online' });
});

// Rota Principal: Recebe Imagem -> Extrai Cores -> "Gera" 3D (Mock) -> Retorna Dimensões
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    console.log(`[API] Imagem recebida: ${req.file.originalname} (${req.file.size} bytes)`);

    // Injeta a imagem no orquestrador
    const result = await processImage(req.file.buffer, req.file.mimetype);

    // No futuro, salvaremos no Supabase aqui e retornaremos o ID real.
    // Por enquanto, criamos um ID falso para testar o redirecionamento.
    const projectId = `proj_${Math.floor(Math.random() * 10000)}`;

    res.json({
      success: true,
      projectId: projectId,
      data: result
    });

  } catch (error) {
    console.error('[API Error]:', error);
    res.status(500).json({ error: 'Erro interno ao processar a imagem.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Backend rodando na porta ${port}`);
});
