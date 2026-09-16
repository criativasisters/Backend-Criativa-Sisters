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
          model: 'gemini-2.5-flash',
          contents: [
            'Você é um assistente de impressão 3D. Analise esta imagem e retorne APENAS um array JSON válido com as 2 cores em formato Hexadecimal (ex: ["#FFFFFF", "#000000"]) que mais se destacam para uso em um filamento de impressora Bambu Lab.',
            { inlineData: { mimeType: mimeType, data: fileBuffer.toString('base64') } }
          ],
          config: { responseMimeType: 'application/json' }
        });
        
        const rawText = typeof response.text === 'function' ? response.text() : (response.text || '');
        const text = String(rawText).trim();
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          colors = JSON.parse(jsonMatch[0]);
        }
      } catch (geminiError) {
        console.warn('[AI Orchestrator] Erro ao consultar Gemini (usando cores padrão):', geminiError.message);
      }
    }

    // 2. Upload para Tripo3D
    if (!TRIPO_API_KEY || TRIPO_API_KEY === 'mock_mode') {
      throw new Error("TRIPO3D_API_KEY não configurada no servidor.");
    }

    console.log('[AI Orchestrator] Fazendo upload da imagem para a Tripo3D...');
    const fileExt = mimeType.includes('png') ? 'png' : (mimeType.includes('webp') ? 'webp' : 'jpg');
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('file', blob, `upload.${fileExt}`);

    const uploadRes = await fetch(`${TRIPO_BASE}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    
    if (uploadData.code !== 0 || !uploadData.data?.file_token) {
      throw new Error(`Erro no upload Tripo: ${JSON.stringify(uploadData)}`);
    }
    const fileToken = uploadData.data.file_token;
    console.log(`[AI Orchestrator] Imagem enviada com sucesso. File Token: ${fileToken}`);

    // 3. Iniciar a Tarefa de Geração (image_to_model)
    console.log('[AI Orchestrator] Iniciando Geração 3D...');
    
    // O schema oficial da Tripo3D exige o objeto "file" para tasks do tipo "image_to_model"
    const taskPayload = {
      type: 'image_to_model',
      file: {
        type: fileExt,
        file_token: fileToken
      }
    };

    // Tentativa 1: Endpoint V3
    let genRes = await fetch(`${TRIPO_BASE}/generation/image-to-model`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TRIPO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskPayload)
    });
    let genData = await genRes.json();

    // Tentativa 2 (Fallback): Endpoint OpenAPI V2/Task se o V3 recusar formato
    if (genData.code !== 0) {
      console.warn('[AI Orchestrator] Tentativa V3 retornou erro, tentando endpoint alternativo /task...', genData);
      const altRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TRIPO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskPayload)
      });
      const altData = await altRes.json();
      if (altData.code === 0 && (altData.data?.task_id || altData.data?.taskId)) {
        genData = altData;
      }
    }

    if (genData.code !== 0) {
      throw new Error(`Erro na geração Tripo: ${JSON.stringify(genData)}`);
    }

    const taskId = genData.data?.task_id || genData.data?.taskId;
    console.log(`[AI Orchestrator] Tarefa criada com sucesso. Task ID: ${taskId}`);

    return {
      success: true,
      taskId: taskId,
      colors: colors
    };

  } catch (error) {
    console.error('[AI Orchestrator] Erro Crítico:', error);
    return { success: false, error: error.message };
  }
}

// 4. Função para checar o status da tarefa (Tripo3D async)
export async function checkTaskStatus(taskId) {
  try {
    // 1. Tenta endpoint V3
    let res = await fetch(`${TRIPO_BASE}/tasks/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` }
    });
    let data = await res.json();
    
    // 2. Se falhar, tenta endpoint V2
    if (data.code !== 0) {
      const altRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${TRIPO_API_KEY}` }
      });
      const altData = await altRes.json();
      if (altData.code === 0) {
        data = altData;
      }
    }

    if (data.code === 0 && data.data) {
      const output = data.data.output || {};
      const modelUrl = output.model_url || output.pbr_model || output.base_model || null;

      return {
        status: data.data.status, // 'queued', 'running', 'success', 'failed'
        progress: data.data.progress || 0,
        modelUrl: modelUrl
      };
    }
    throw new Error(`Falha ao checar status: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('[AI Orchestrator] Erro ao checar status:', error);
    return { status: 'failed', progress: 0, modelUrl: null };
  }
}
