/**
 * timeService.js
 * Responsável por gerenciar datas e horários, garantindo o fuso horário de Brasília (UTC-3).
 * Utilizado para exibir o timestamp de atualização no header do dashboard.
 */

/**
 * Retorna a data e hora atual no fuso horário de Brasília (America/Sao_Paulo).
 * Utiliza Intl.DateTimeFormat para garantir a precisão do fuso, independentemente
 * de onde o servidor Node.js esteja rodando.
 * 
 * @param {Date} [date=new Date()] - Data base (opcional, padrão é a data atual).
 * @returns {string} - Data e hora formatada no padrão brasileiro (ex: "25/10/2023 14:30:00").
 */
function getBrasiliaTime(date = new Date()) {
    const options = {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('pt-BR', options);
    const parts = formatter.formatToParts(date);
    
    // Extrai as partes formatadas
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    
    // Monta a string final: dd/mm/aaaa HH:MM:SS
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Retorna o timestamp atual em formato ISO para uso em logs, cache ou respostas de API.
 * @returns {string} - Timestamp em formato ISO 8601 (ex: "2023-10-25T17:30:00.000Z").
 */
function getCurrentTimestampISO() {
    return new Date().toISOString();
}

/**
 * Retorna o timestamp atual em milissegundos (Unix Epoch) para cálculos de TTL de cache.
 * @returns {number} - Timestamp em milissegundos.
 */
function getCurrentTimestampMs() {
    return Date.now();
}

module.exports = {
    getBrasiliaTime,
    getCurrentTimestampISO,
    getCurrentTimestampMs
};