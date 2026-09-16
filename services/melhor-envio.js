import fetch from 'node-fetch';

const MELHOR_ENVIO_URL = 'https://www.melhorenvio.com.br/api/v2';
// Se fosse ambiente de teste usaríamos sandbox, mas o token parece de produção/sandbox real.
// Para garantir, vamos usar a URL base padrão. Se for sandbox, a url seria sandbox.melhorenvio.com.br

export async function calculateShipping(postalCode, weightGrams) {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  
  if (!token) {
    throw new Error('Token do Melhor Envio não configurado no backend.');
  }

  // Peso mínimo do melhor envio costuma ser 0.1 (100g)
  const weightKg = Math.max(weightGrams / 1000, 0.1);

  const payload = {
    from: {
      postal_code: '01001000', // CEP Origem (Mock/Exemplo da Criativa Sisters) - Mudar depois
    },
    to: {
      postal_code: postalCode.replace(/\D/g, ''),
    },
    products: [
      {
        id: 'x',
        width: 15,
        height: 15,
        length: 15,
        weight: weightKg,
        insurance_value: 50.0,
        quantity: 1
      }
    ]
  };

  try {
    const response = await fetch(`${MELHOR_ENVIO_URL}/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'CriativaSisters (contato@criativasisters.com)'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro no Melhor Envio:', data);
      throw new Error(data.message || 'Erro ao calcular frete no Melhor Envio');
    }

    // Filtrar Correios (PAC e SEDEX) apenas para facilitar o MVP
    // Correios PAC = id 1, Correios SEDEX = id 2
    const filtered = data.filter(d => (d.id === 1 || d.id === 2) && !d.error);
    
    return filtered.map(d => ({
      id: d.id,
      name: d.name,
      price: d.custom_price || d.price, // Valor final para o cliente
      delivery_time: d.custom_delivery_time || d.delivery_time
    }));

  } catch (error) {
    console.error('Erro na integração de Frete:', error);
    throw error;
  }
}
