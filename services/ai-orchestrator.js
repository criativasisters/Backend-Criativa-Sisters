import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function processImage(imageBuffer, mimeType) {
  console.log('[AI Orchestrator] Iniciando processamento...');
  
  let colors = ['#8A2BE2', '#FF3366']; // Cores fallback
  
  try {
    // 1. Extração de Cores via Gemini (Visão)
    if (process.env.GEMINI_API_KEY) {
      console.log('[AI Orchestrator] Consultando Gemini para extração de cores...');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          'Você é um assistente de impressão 3D. Analise esta imagem e retorne APENAS um array JSON válido com as 2 cores em formato Hexadecimal (ex: ["#FFFFFF", "#000000"]) que mais se destacam para uso em um filamento de impressora Bambu Lab.',
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: mimeType
            }
          }
        ],
        config: {
          responseMimeType: 'application/json',
        }
      });
      
      const textResponse = response.text;
      if (textResponse) {
        colors = JSON.parse(textResponse);
        console.log('[AI Orchestrator] Cores extraídas pelo Gemini:', colors);
      }
    }
  } catch (error) {
    console.warn('[AI Orchestrator] Erro ao consultar Gemini (usando fallback):', error.message);
  }

  // 2. Simulação de Geração 3D e Geometria (Mock Mode)
  // Em vez de chamar a API do Tripo3D que custaria dinheiro, vamos simular o retorno.
  const isMockMode = process.env.TRIPO3D_API_KEY === 'mock_mode';
  
  if (isMockMode) {
    console.log('[AI Orchestrator] MOCK MODE ATIVADO. Simulando a geração da malha...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simula tempo de processamento
    
    return {
      status: 'completed',
      modelUrl: 'mock', // Avisa o frontend para usar o componente MockModel (TorusKnot)
      colors: colors,
      dimensions: {
        x: 15.2,
        y: 21.0,
        z: 14.8
      }
    };
  }

  // TODO: Integração Real com Tripo3D/Meshy aqui
  throw new Error("Integração real da API 3D ainda não implementada.");
}
