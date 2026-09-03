import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TRIPO_API_KEY = process.env.TRIPO3D_API_KEY;
const TRIPO_BASE = 'https://openapi.tripo3d.ai/v3';

export async function process3DGeneration(fileBuffer, mimeType = 'image/jpeg') {
  try {
    // 1. Extração de Cores via Gemini
    let colors = ['#8A2BE2', '#FF3366'];
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('[AI Orchestrator] Consultando Gemini para extração de cores...');
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            'Você é um assistente de impressão 3D. Analise esta imagem e retorne APENAS um array JSON válido com as 2 cores em formato Hexadecimal (ex: ["#FFFFFF", "#000000"]) que mais se destacam para uso em um filamento de impressora Bambu Lab.',
            { inlineData: { mimeType: mimeType, data: fileBuffer.toString('base64') } }
          ],
          config: { responseMimeType: 'application/json' }
        });
        
        const text = response.text().trim();
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          colors = JSON.parse(jsonMatch[0]);
        }
      } catch (geminiError) {
        console.warn('[AI Orchestrator] Erro ao consultar Gemini (usando fallback):', geminiError.message);
      }
    }

    // 2. Upload para Tripo3D (v3)
    if (!TRIPO_API_KEY || TRIPO_API_KEY === 'mock_mode') {
      throw new Error("TRIPO3D_API_KEY não configurada.");
    }

    console.log('[AI Orchestrator] Fazendo upload da imagem para a Tripo3D...');
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('file', blob, 'upload.jpg');

    const uploadRes = await fetch(`${TRIPO_BASE}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    
    if (uploadData.code !== 0) {
      throw new Error(`Erro no upload Tripo: ${JSON.stringify(uploadData)}`);
    }
    const fileToken = uploadData.data.file_token;

    // 3. Iniciar a Tarefa de Geração (image-to-model)
    console.log('[AI Orchestrator] Iniciando Geração 3D...');
    const genRes = await fetch(`${TRIPO_BASE}/generation/image-to-model`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TRIPO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'image_to_model',
        file_token: fileToken,
        model: 'v3.1-20260211' // Conforme PDF v3.1 
      })
    });
    
    const genData = await genRes.json();
    if (genData.code !== 0) {
      throw new Error(`Erro na geração Tripo: ${JSON.stringify(genData)}`);
    }

    const taskId = genData.data.task_id;
    console.log(`[AI Orchestrator] Tarefa criada com sucesso. Task ID: ${taskId}`);

    return {
      success: true,
      taskId: taskId,
      colors: colors
    };

  } catch (error) {
    console.error('[AI Orchestrator] Erro Critico:', error);
    return { success: false, error: error.message };
  }
}

// 4. Função para checar o status da tarefa (Tripo3D async)
export async function checkTaskStatus(taskId) {
  try {
    const res = await fetch(`${TRIPO_BASE}/tasks/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` }
    });
    const data = await res.json();
    
    if (data.code === 0 && data.data) {
      return {
        status: data.data.status, // 'queued', 'running', 'success', 'failed'
        progress: data.data.progress,
        modelUrl: data.data.output?.model_url || null
      };
    }
    throw new Error('Falha ao checar status');
  } catch (error) {
    console.error('[AI Orchestrator] Erro ao checar status:', error);
    return { status: 'failed', progress: 0, modelUrl: null };
  }
}
