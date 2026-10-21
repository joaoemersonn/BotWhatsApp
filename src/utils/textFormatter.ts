/**
 * Converte formatações Markdown comuns (produzidas por modelos de linguagem como Gemini)
 * para a sintaxe nativa de formatação do WhatsApp.
 *
 * Regras:
 * 1. Preserva blocos de código multiline (```...```) e inline (`...`) intactos.
 * 2. Converte títulos Markdown (# Titulo, ## Titulo, ### Titulo) em *Titulo* (negrito).
 * 3. Converte negrito + itálico triplo (***texto*** ou ___texto___) em *_texto_*.
 * 4. Converte negrito duplo (**texto** ou __texto__) em *texto* (negrito do WhatsApp).
 * 5. Converte listas com asterisco no início da linha (* item) em marcadores limpos (• item),
 *    evitando que o WhatsApp confunda asteriscos de lista com tags de negrito.
 * 6. Elimina asteriscos duplos (**) soltos residuais.
 */
export function formatToWhatsApp(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const codeBlocks: string[] = [];
  const placeholderPrefix = '___WA_CODE_BLOCK_';

  // 1. Isola blocos de código multiline ```...```
  let formatted = text.replace(/```[\s\S]*?```/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholderPrefix}${idx}___`;
  });

  // 2. Isola código inline `...`
  formatted = formatted.replace(/`[^`\n]+`/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholderPrefix}${idx}___`;
  });

  // 3. Converte títulos Markdown (# Título, ## Título, ### Título) em *Título*
  formatted = formatted.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // 4. Converte negrito + itálico triplo (***texto*** ou ___texto___) em *_texto_*
  formatted = formatted.replace(/(\*{3}|_{3})\s*([^\*\n_]+?)\s*\1/g, '*_$2_*');

  // 5. Converte negrito com asterisco duplo (**texto**) em *texto*
  formatted = formatted.replace(/\*\*\s*([^\*\n]+?)\s*\*\*/g, '*$1*');

  // 6. Converte negrito com duplo underline (__texto__) em *texto*
  formatted = formatted.replace(/__\s*([^_\n]+?)\s*__/g, '*$1*');

  // 7. Converte marcadores de lista com asterisco solto (* item) em marcador (• item)
  formatted = formatted.replace(/^(\s*)\*\s+/gm, '$1• ');

  // 8. Remove quaisquer asteriscos duplos residuais que possam ter sobrado
  formatted = formatted.replace(/\*\*/g, '*');

  // 9. Restaura os blocos de código protegidos
  formatted = formatted.replace(new RegExp(`${placeholderPrefix}(\\d+)___`, 'g'), (_, index) => {
    return codeBlocks[Number(index)] || '';
  });

  return formatted;
}
