import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// Servicos
import { process3DGeneration, checkTaskStatus } from './services/ai-orchestrator.js';

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

// Rota de Health Check / Anti-Sleep (Cron-Job)
app.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Ping recebido do Cron-job! Backend mantido acordado.`);
  res.json({ 
    status: 'ok', 
    message: 'Criativa Sisters Backend Online - Sleep Evitado!',
    time: timestamp
  });
});

// Rota 1: Inicia a Geração 3D
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada.' });
    }

    // Chama o orquestrador que envia para Tripo3D e Gemini
    const result = await process3DGeneration(req.file.buffer, req.file.mimetype);

    if (result.success) {
      // Retorna o taskId imediatamente para não travar o HTTP
      return res.json({
        success: true,
        taskId: result.taskId,
        colors: result.colors
      });
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor' });
  }
});

// Rota 2: Verifica o Status da Tarefa no Tripo3D
app.get('/api/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await checkTaskStatus(taskId);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Backend rodando na porta ${port}`);
});
