import { NodeIO } from '@gltf-transform/core';
import { bounds } from '@gltf-transform/functions';

/**
 * Faz download do GLB e calcula o Bounding Box paramétrico exato.
 * Evita o "efeito letreiro" garantindo o volume Z adequado.
 */
export async function calculateParametricDimensions(glbUrl, targetHeightCm = 15.0) {
  try {
    if (!glbUrl || glbUrl === 'mock') {
      return { x: targetHeightCm, y: targetHeightCm, z: targetHeightCm * 0.8, isFallback: true };
    }

    console.log(`[Geometry Engine] Baixando modelo de ${glbUrl}...`);
    const res = await fetch(glbUrl);
    if (!res.ok) throw new Error(`Falha ao baixar GLB: ${res.statusText}`);
    const buffer = await res.arrayBuffer();

    console.log(`[Geometry Engine] Parseando GLB para cálculo de Bounding Box...`);
    const io = new NodeIO();
    const document = await io.readBinary(new Uint8Array(buffer));

    // Calcula Bounding Box original usando as funções matemáticas
    const bbox = bounds(document.getRoot().listScenes()[0]);
    const origWidth = bbox.max[0] - bbox.min[0];
    const origHeight = bbox.max[1] - bbox.min[1];
    const origDepth = bbox.max[2] - bbox.min[2];

    // Evita achatamento (Z mínimo de 30% da altura para estátuas realistas)
    let adjustedDepth = origDepth;
    if (origDepth < origHeight * 0.3) {
      console.warn('[Geometry Engine] Efeito Letreiro detectado. Ajustando Z (Profundidade) paramétrica.');
      adjustedDepth = origHeight * 0.35; 
    }

    // Escalar para o tamanho alvo em centímetros (baseado na Altura/Y desejada)
    const scale = targetHeightCm / origHeight;

    const finalX = Number((origWidth * scale).toFixed(2));
    const finalY = Number(targetHeightCm.toFixed(2));
    const finalZ = Number((adjustedDepth * scale).toFixed(2));

    console.log(`[Geometry Engine] Dimensões calculadas: X=${finalX}cm, Y=${finalY}cm, Z=${finalZ}cm`);

    return { x: finalX, y: finalY, z: finalZ, isFallback: false };
  } catch (error) {
    console.error('[Geometry Engine] Erro ao calcular dimensões:', error);
    // Fallback paramétrico padrão para busts/estátuas
    return { x: targetHeightCm * 0.6, y: targetHeightCm, z: targetHeightCm * 0.4, isFallback: true };
  }
}
