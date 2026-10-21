import {
  PlayBoxRelatorio,
  PlayBoxAluguel,
  PlayBoxEstabelecimento,
  PlayBoxEstoqueResponse,
  PlayBoxPreviaColeta,
  PlayBoxColeta,
} from '../../services/playboxService.js';

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

export function formatEstoque(estoque: PlayBoxEstoqueResponse): string {
  const r = estoque.resumo;
  const lines = [
    '🧸 *ESTOQUE DE PELÚCIAS & BRINQUEDOS*',
    '',
    `• *Total de Máquinas:* ${r.totalMaquinas}`,
    `• *Total de Pelúcias em Estoque:* ${r.totalPeluciasEmEstoque} un.`,
    `• *Média por Máquina:* ${r.mediaPeluciasPorMaquina} un.`,
    `• *Máquinas em Alerta (< 30 un.):* ${r.maquinasEmAlerta > 0 ? `⚠️ ${r.maquinasEmAlerta} máquina(s)` : '✅ Nenhuma'}`,
    '',
    '📋 *Situação por Máquina:*',
  ];

  estoque.maquinas.forEach((m) => {
    const alerta = m.estoqueBaixo ? '⚠️ ALERTA' : '🟢 OK';
    const loc = m.estabelecimentoNome ? `${m.estabelecimentoNome}${m.cidade ? ` (${m.cidade})` : ''}` : m.nome;
    lines.push(
      `• *${m.nome}* [ID ${m.maquinaId}] - ${loc}: *${m.estoqueAtual}/${m.capacidadeMaxima}* un. (${m.percentualOcupacao}%) - ${alerta}`
    );
  });

  lines.push('', '↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}

export function formatPreviaColeta(p: PlayBoxPreviaColeta): string {
  const ultimaStr = p.dataHoraUltimaColeta
    ? new Date(p.dataHoraUltimaColeta).toLocaleString('pt-BR')
    : 'Marco Zero (Primeira Coleta)';

  return [
    '💵 *PRÉVIA DE VALOR ESPERADO (COLETA)*',
    '',
    `• *Máquina:* ${p.maquinaNome} [ID: ${p.maquinaId}]`,
    `• *Local:* ${p.estabelecimentoNome || 'Não informado'}`,
    `• *Período:* ${p.periodoFormatado}`,
    `• *Dias Apurados:* ${p.diasApurados} dia(s)`,
    `• *Última Coleta:* ${ultimaStr}`,
    '',
    `💰 *Valor Esperado em Espécie:* *${formatCurrency(p.valorEsperado)}*`,
    '',
    '💡 _Este é o valor em dinheiro (notas/moedas) calculado com base nas transações registradas no cofre._',
    '',
    '↩️ _Digite *0* para voltar ao menu principal._',
  ].join('\n');
}

export function formatColetasPendentes(coletas: PlayBoxColeta[]): string {
  if (!coletas || coletas.length === 0) {
    return [
      '💵 *COLETAS PENDENTES DE CONFERÊNCIA*',
      '',
      '✅ Nenhuma coleta pendente no momento! Todos os caixas foram conferidos e conciliados.',
      '',
      '↩️ _Digite *0* para voltar ao menu principal._',
    ].join('\n');
  }

  const lines = [
    `💵 *COLETAS PENDENTES DE CONFERÊNCIA* (${coletas.length}):`,
    '',
  ];

  coletas.forEach((c) => {
    const dataStr = new Date(c.dataHoraColeta).toLocaleString('pt-BR');
    lines.push(`• *[#${c.id}] ${c.maquinaNome}* - ${c.estabelecimentoNome || 'Sem local'}`);
    lines.push(`  Retirada: ${dataStr} | Esperado: *${formatCurrency(c.valorEsperado)}*`);
    if (c.responsavel) lines.push(`  Resp: ${c.responsavel}`);
    lines.push('');
  });

  lines.push('💡 _Para conferir uma coleta, fale com a IA: "Conferir coleta ID X com R$ Y"_');
  lines.push('', '↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}

export function formatHistoricoColetas(coletas: PlayBoxColeta[]): string {
  if (!coletas || coletas.length === 0) {
    return [
      '📜 *HISTÓRICO DE COLETAS*',
      '',
      'Nenhum registro de coleta encontrado.',
      '',
      '↩️ _Digite *0* para voltar ao menu principal._',
    ].join('\n');
  }

  const lines = [
    `📜 *HISTÓRICO DE COLETAS* (Últimos ${Math.min(coletas.length, 10)}):`,
    '',
  ];

  coletas.slice(0, 10).forEach((c) => {
    let statusIcon = '⏳ Pendente';
    if (c.status === 'CONFERIDO') statusIcon = '✅ Exato';
    else if (c.status === 'CONFERIDO_DIVERGENTE') statusIcon = '⚠️ Divergente';

    const dataStr = new Date(c.dataHoraColeta).toLocaleDateString('pt-BR');
    const difStr = c.diferenca !== undefined && c.diferenca !== null ? ` | Dif: ${formatCurrency(c.diferenca)}` : '';
    lines.push(`• *[#${c.id}] ${c.maquinaNome}* (${dataStr})`);
    lines.push(`  Esp: ${formatCurrency(c.valorEsperado)} | Real: ${c.valorReal != null ? formatCurrency(c.valorReal) : 'N/C'}${difStr} | ${statusIcon}`);
    lines.push('');
  });

  lines.push('↩️ _Digite *0* para voltar ao menu principal._');
  return lines.join('\n');
}
