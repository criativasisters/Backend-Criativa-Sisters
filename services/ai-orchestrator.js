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

    // 2. Validação da chave Tripo3D (com fallback comercial se for mock_mode)
    if (!TRIPO_API_KEY || TRIPO_API_KEY === 'mock_mode') {
      console.warn('[AI Orchestrator] TRIPO3D_API_KEY não configurada ou em mock_mode. Ativando visualizador de contingência comercial...');
      return {
        success: true,
        taskId: `cs_fallback_${Date.now()}`,
        colors: colors,
        isFallback: true
      };
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
    
    // Schema oficial Tripo3D: file object + model version
    const taskPayload = {
      type: 'image_to_model',
      file: {
        type: fileExt,
        file_token: fileToken
      },
      model: 'v3.1-20260211',
      model_version: 'v3.1-20260211'
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
    if (genData.code !== 0 && genData.code !== 2010) {
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

    // Tratamento de Créditos Esgotados na Tripo3D (Code 2010):
    // Em vez de quebrar a jornada do cliente, aciona o Fallback Comercial
    // (Visualizador 3D Paramétrico + Conexão Direta com Especialista de Modelagem)
    if (genData.code === 2010) {
      console.warn('[AI Orchestrator] Saldo de créditos da conta Tripo3D zerado (code 2010). Ativando Rede de Segurança Comercial (Human-in-the-Loop)...');
      return {
        success: true,
        taskId: `cs_fallback_${Date.now()}`,
        colors: colors,
        isFallback: true,
        notice: 'Créditos da IA esgotados na provedora Tripo3D. Direcionando para visualizador de contingência comercial.'
      };
    }

    if (genData.code !== 0) {
      throw new Error(`Erro na geração Tripo: ${JSON.stringify(genData)}`);
    }

    const taskId = genData.data?.task_id || genData.data?.taskId;
    console.log(`[AI Orchestrator] Tarefa criada com sucesso. Task ID: ${taskId}`);

    return {
      success: true,
      taskId: taskId,
      colors: colors,
      isFallback: false
    };

  } catch (error) {
    console.error('[AI Orchestrator] Erro Crítico:', error);
    return { success: false, error: error.message };
  }
}

// 4. Função para checar o status da tarefa (Tripo3D async)
export async function checkTaskStatus(taskId) {
  try {
    // Se for uma tarefa originada pelo modo de contingência comercial
    if (taskId.startsWith('cs_fallback_') || taskId.startsWith('mock_')) {
      return {
        status: 'success',
        progress: 100,
        modelUrl: 'mock',
        isFallback: true
      };
    }

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
        modelUrl: modelUrl,
        isFallback: false
      };
    }
    throw new Error(`Falha ao checar status: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('[AI Orchestrator] Erro ao checar status:', error);
    return { status: 'failed', progress: 0, modelUrl: null, isFallback: false };
  }
}

/**
 * Consulta o saldo atual de créditos na Tripo3D API V3
 * Endpoint oficial: GET https://openapi.tripo3d.ai/v3/account/balance
 */
export async function getTripoBalance() {
  try {
    if (!TRIPO_API_KEY || TRIPO_API_KEY === 'mock_mode') {
      return {
        success: true,
        balance: 0,
        frozen: 0,
        mode: 'mock',
        message: 'Modo de contingência / mock ativo'
      };
    }

    const res = await fetch(`${TRIPO_BASE}/account/balance`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TRIPO_API_KEY}`
      }
    });

    const data = await res.json();

    if (data.code === 0 && data.data) {
      return {
        success: true,
        balance: Number(data.data.balance ?? 0),
        frozen: Number(data.data.frozen ?? 0),
        mode: 'live'
      };
    }

    return {
      success: false,
      code: data.code,
      error: data.message || 'Erro ao consultar saldo na Tripo3D',
      balance: 0,
      frozen: 0,
      mode: 'live'
    };
  } catch (error) {
    console.error('[AI Orchestrator] Falha na requisição de saldo Tripo3D:', error);
    return {
      success: false,
      error: error.message || 'Falha de conexão com a Tripo3D',
      balance: 0,
      frozen: 0,
      mode: 'error'
    };
  }
}

