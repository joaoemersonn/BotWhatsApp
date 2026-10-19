import { PlayBoxRelatorio, PlayBoxAluguel, PlayBoxEstabelecimento } from '../../services/playboxService.js';

export function formatCurrency(value: number = 0): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatRelatorio(rel: PlayBoxRelatorio): string {
  const g = rel.resumoGeral;
  const formas = g.formasPagamento;

  const lines = [
    `📊 *${rel.titulo.toUpperCase()}*`,
    `⏱️ _Período: ${new Date(rel.dataInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} até ${new Date(rel.dataFim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}_`,
    '',
    '💵 *Resumo Geral:*',
    `• *Faturamento Bruto:* ${formatCurrency(g.faturamentoBruto)}`,
    `• *Estornos:* ${formatCurrency(g.totalEstornos)}`,
    `• *Faturamento Líquido:* ${formatCurrency(g.faturamentoLiquido)}`,
    `• *Prêmios Liberados:* ${g.quantidadePremios} un.`,
    `• *Transações:* ${g.totalRegistros}`,
    '',
    '💳 *Formas de Pagamento:*',
    `• 💵 Espécie: ${formatCurrency(formas.especie)}`,
    `• 💠 PIX: ${formatCurrency(formas.pix)}`,
    `• 💳 Cartão Crédito: ${formatCurrency(formas.credito)}`,
    `• 💳 Cartão Débito: ${formatCurrency(formas.debito)}`,
  ];

  if (rel.porEstabelecimento && rel.porEstabelecimento.length > 0) {
    lines.push('', '📍 *Top Locais:*');
    rel.porEstabelecimento.slice(0, 5).forEach((est: any, idx: number) => {
      lines.push(
        `${idx + 1}. *${est.estabelecimentoNome}* (${est.cidade}): ${formatCurrency(est.faturamentoLiquido)}`
      );
    });
  }

  lines.push('', '↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}

export function formatAlugueis(alugueis: PlayBoxAluguel[], titulo: string): string {
  if (!alugueis || alugueis.length === 0) {
    return [
      `💰 *${titulo}*`,
      '',
      '✅ Nenhum aluguel encontrado nesta categoria.',
      '',
      '↩️ _Digite *0* para voltar ao menu principal._',
    ].join('\n');
  }

  const lines = [`💰 *${titulo}* (Total: ${alugueis.length}):`, ''];

  alugueis.slice(0, 10).forEach((al) => {
    const est = al.estabelecimento?.nome || 'Local Desconhecido';
    const cid = al.estabelecimento?.cidade ? ` - ${al.estabelecimento.cidade}` : '';
    const statusIcon = al.pago ? '🟢 Pago' : '⏳ Pendente';
    const venc = al.dataVencimento.split('-').reverse().join('/');
    lines.push(`• *${est}${cid}*`);
    lines.push(`  Valor: ${formatCurrency(al.valor)} | Venc: ${venc} | ${statusIcon}`);
  });

  if (alugueis.length > 10) {
    lines.push('', `_...e mais ${alugueis.length - 10} registros._`);
  }

  lines.push('', '↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}

export function formatEstabelecimentos(estabelecimentos: PlayBoxEstabelecimento[]): string {
  const ativos = estabelecimentos.filter((e) => e.ativo);
  const lines = [
    `📍 *ESTABELECIMENTOS ATIVOS* (${ativos.length}):`,
    '',
  ];

  ativos.forEach((est) => {
    const pix = est.meiosPagamento?.find((m: any) => m.tipo === 'PIX')?.chaveOuDetalhe || 'Sem chave PIX';
    lines.push(`• *[#${est.id}] ${est.nome}* (${est.cidade})`);
    lines.push(`  Resp: ${est.responsavel || 'Não informado'} | Aluguel: ${formatCurrency(est.valorAcordado)}`);
    lines.push(`  PIX: \`${pix}\``);
    lines.push('');
  });

  lines.push('↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}
