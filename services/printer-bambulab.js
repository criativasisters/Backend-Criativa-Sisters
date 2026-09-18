import mqtt from 'mqtt';

/**
 * Assinatura MQTT para monitorar a Bambu Lab A1 Combo.
 */
export function connectBambuPrinter() {
  const host = process.env.BAMBU_IP || '192.168.1.100';
  const accessCode = process.env.BAMBU_ACCESS_CODE || '00000000';
  const serial = process.env.BAMBU_SERIAL || '00M00A000000000';

  console.log(`[Printer] Tentando conexão MQTT com impressora no IP ${host}...`);

  const client = mqtt.connect(`mqtts://${host}:8883`, {
    username: 'bblp',
    password: accessCode,
    rejectUnauthorized: false // BambuLab usa certificado self-signed
  });

  client.on('connect', () => {
    console.log('[Printer] Conectado à Bambu Lab A1 Combo via MQTT!');
    // Assinar os tópicos de reporte
    client.subscribe(`device/${serial}/report`, (err) => {
      if (err) console.error('[Printer] Falha ao assinar tópico de reporte.');
    });
  });

  client.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.print && data.print.mc_percent) {
        console.log(`[Printer Progress] ${data.print.mc_percent}% Concluído.`);
      }
    } catch (e) {
      // Ignore parse errors on heartbeat
    }
  });

  client.on('error', (err) => {
    console.warn('[Printer] Erro na conexão MQTT da BambuLab:', err.message);
  });

  return client;
}
