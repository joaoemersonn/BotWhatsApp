import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

export interface WhitelistContact {
  phone: string;
  lid?: string;
  name?: string;
  addedAt: string;
}

export interface WhitelistGroup {
  groupId: string;
  name?: string;
  addedAt: string;
}

export interface WhitelistData {
  contacts: WhitelistContact[];
  groups: WhitelistGroup[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');

/**
 * Consulta os mapeamentos do Baileys para resolver o número de telefone a partir de um LID
 */
export function getPhoneForLid(lid: string): string | null {
  try {
    const cleanLid = normalizePhone((lid.split('@')[0] || '').split(':')[0]);
    const reverseFile = path.join(config.authDir, `lid-mapping-${cleanLid}_reverse.json`);
    if (fs.existsSync(reverseFile)) {
      const raw = fs.readFileSync(reverseFile, 'utf-8');
      const phone = JSON.parse(raw);
      if (phone) return normalizePhone(String(phone));
    }
  } catch (err) {
    logger.debug({ err, lid }, 'Erro ao ler arquivo reverse LID mapping');
  }
  return null;
}

/**
 * Consulta os mapeamentos do Baileys para resolver o LID a partir de um número de telefone
 */
export function getLidForPhone(phone: string): string | null {
  try {
    const clean = normalizePhone(phone);
    const variations = [clean];
    if (clean.startsWith('55') && clean.length === 13) {
      // Com e sem nono dígito
      variations.push(clean.slice(0, 4) + clean.slice(5));
    } else if (clean.startsWith('55') && clean.length === 12) {
      variations.push(clean.slice(0, 4) + '9' + clean.slice(4));
    }

    for (const v of variations) {
      const mapFile = path.join(config.authDir, `lid-mapping-${v}.json`);
      if (fs.existsSync(mapFile)) {
        const raw = fs.readFileSync(mapFile, 'utf-8');
        const lid = JSON.parse(raw);
        if (lid) return String(lid);
      }
    }
  } catch (err) {
    logger.debug({ err, phone }, 'Erro ao ler arquivo LID mapping');
  }
  return null;
}

// Garante que o diretório data exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializa o arquivo se não existir
if (!fs.existsSync(WHITELIST_FILE)) {
  const initialData: WhitelistData = {
    contacts: [
      {
        phone: '5587981362724',
        lid: '61186238329075',
        name: 'Administrador / Operador',
        addedAt: new Date().toISOString(),
      },
      {
        phone: '558781362724',
        lid: '61186238329075',
        name: 'Administrador / Operador (sem 9)',
        addedAt: new Date().toISOString(),
      },
    ],
    groups: [],
  };
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
}

/**
 * Lê os dados atuais da Whitelist
 */
export function getWhitelist(): WhitelistData {
  try {
    const raw = fs.readFileSync(WHITELIST_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error({ err }, 'Erro ao ler arquivo de whitelist');
    return { contacts: [], groups: [] };
  }
}

/**
 * Salva os dados na Whitelist
 */
function saveWhitelist(data: WhitelistData): void {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err }, 'Erro ao salvar arquivo de whitelist');
  }
}

/**
 * Normaliza um número de telefone removendo caracteres não numéricos
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Normaliza o ID de grupo
 */
export function normalizeGroupId(groupId: string): string {
  const trimmed = groupId.trim();
  return trimmed.endsWith('@g.us') ? trimmed : `${trimmed}@g.us`;
}

/**
 * Adiciona um contato/operador autorizado
 */
export function addAuthorizedContact(phone: string, name?: string, lid?: string): WhitelistContact {
  const clean = normalizePhone(phone);
  if (!clean || clean.length < 8) {
    throw new Error('Número de telefone inválido.');
  }

  // Tenta resolver automaticamente o LID associado a esse telefone nos arquivos da sessão
  const resolvedLid = lid || getLidForPhone(clean);

  const data = getWhitelist();
  const existing = data.contacts.find((c) => c.phone === clean || (resolvedLid && c.lid === resolvedLid));
  if (existing) {
    if (name) existing.name = name;
    if (resolvedLid) existing.lid = resolvedLid;
    saveWhitelist(data);
    return existing;
  }

  const newContact: WhitelistContact = {
    phone: clean,
    lid: resolvedLid || undefined,
    name: name || undefined,
    addedAt: new Date().toISOString(),
  };

  data.contacts.push(newContact);
  saveWhitelist(data);
  logger.info({ phone: clean, name, lid: resolvedLid }, 'Contato adicionado à whitelist');
  return newContact;
}

/**
 * Remove um contato autorizado
 */
export function removeAuthorizedContact(phone: string): boolean {
  const clean = normalizePhone(phone);
  const data = getWhitelist();
  const index = data.contacts.findIndex((c) => c.phone === clean);
  if (index === -1) return false;

  data.contacts.splice(index, 1);
  saveWhitelist(data);
  logger.info({ phone: clean }, 'Contato removido da whitelist');
  return true;
}

/**
 * Adiciona um grupo autorizado
 */
export function addAuthorizedGroup(groupId: string, name?: string): WhitelistGroup {
  const clean = normalizeGroupId(groupId);
  const data = getWhitelist();
  const existing = data.groups.find((g) => g.groupId === clean);
  if (existing) {
    if (name) existing.name = name;
    saveWhitelist(data);
    return existing;
  }

  const newGroup: WhitelistGroup = {
    groupId: clean,
    name: name || undefined,
    addedAt: new Date().toISOString(),
  };

  data.groups.push(newGroup);
  saveWhitelist(data);
  logger.info({ groupId: clean, name }, 'Grupo adicionado à whitelist');
  return newGroup;
}

/**
 * Remove um grupo autorizado
 */
export function removeAuthorizedGroup(groupId: string): boolean {
  const clean = normalizeGroupId(groupId);
  const data = getWhitelist();
  const index = data.groups.findIndex((g) => g.groupId === clean);
  if (index === -1) return false;

  data.groups.splice(index, 1);
  saveWhitelist(data);
  logger.info({ groupId: clean }, 'Grupo removido da whitelist');
  return true;
}

/**
 * Verifica se um número de telefone é um operador autorizado
 */
export function isContactAuthorized(phoneOrJid: string): boolean {
  // Baileys pode entregar JIDs com sufixo de dispositivo, ex: 558781362724:12@s.whatsapp.net ou 61186238329075@lid
  const userPart = (phoneOrJid.split('@')[0] || '').split(':')[0];
  const clean = normalizePhone(userPart);
  const isLid = phoneOrJid.endsWith('@lid') || phoneOrJid.includes('@lid');
  const mappedPhone = isLid ? getPhoneForLid(userPart) : null;

  const data = getWhitelist();

  const isAuth = data.contacts.some((c) => {
    // 1. Se a mensagem veio com LID e o contato já tem esse LID salvo
    if (c.lid && (c.lid === clean || c.lid === userPart || phoneOrJid.startsWith(c.lid))) {
      return true;
    }

    // 2. Se a mensagem veio com LID e conseguimos mapear para o telefone real pela sessão
    if (mappedPhone) {
      const contactClean = normalizePhone(c.phone);
      if (contactClean === mappedPhone) return true;
      if (checkPhoneMatch(contactClean, mappedPhone)) return true;
    }

    // 3. Comparação direta de número de telefone
    const contactClean = normalizePhone(c.phone);
    if (contactClean === clean) return true;

    return checkPhoneMatch(contactClean, clean);
  });

  return isAuth;
}

/**
 * Helper para comparar telefones considerando DDI e nono dígito do Brasil
 */
function checkPhoneMatch(phoneA: string, phoneB: string): boolean {
  const aWithout55 = phoneA.startsWith('55') ? phoneA.slice(2) : phoneA;
  const bWithout55 = phoneB.startsWith('55') ? phoneB.slice(2) : phoneB;

  if (aWithout55 === bWithout55) return true;

  // Variação de nono dígito (com mesmo DDD)
  if (aWithout55.length === 11 && bWithout55.length === 10) {
    if (aWithout55.slice(0, 2) === bWithout55.slice(0, 2) &&
        aWithout55.slice(3) === bWithout55.slice(2)) {
      return true;
    }
  } else if (aWithout55.length === 10 && bWithout55.length === 11) {
    if (aWithout55.slice(0, 2) === bWithout55.slice(0, 2) &&
        bWithout55.slice(3) === aWithout55.slice(2)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se um grupo é autorizado
 */
export function isGroupAuthorized(groupId: string): boolean {
  const clean = normalizeGroupId(groupId);
  const data = getWhitelist();
  return data.groups.some((g) => g.groupId === clean);
}
