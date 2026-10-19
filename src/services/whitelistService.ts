import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

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

  const data = getWhitelist();
  const existing = data.contacts.find((c) => c.phone === clean || (lid && c.lid === lid));
  if (existing) {
    if (name) existing.name = name;
    if (lid) existing.lid = lid;
    saveWhitelist(data);
    return existing;
  }

  const newContact: WhitelistContact = {
    phone: clean,
    lid: lid || undefined,
    name: name || undefined,
    addedAt: new Date().toISOString(),
  };

  data.contacts.push(newContact);
  saveWhitelist(data);
  logger.info({ phone: clean, name, lid }, 'Contato adicionado à whitelist');
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
  // Baileys pode entregar JIDs com sufixo de dispositivo, ex: 558781362724:12@s.whatsapp.net
  const userPart = (phoneOrJid.split('@')[0] || '').split(':')[0];
  const clean = normalizePhone(userPart);
  const data = getWhitelist();

  const isAuth = data.contacts.some((c) => {
    // Se a mensagem veio com LID (ex: 61186238329075@lid) e o contato tem esse LID associado
    if (c.lid && (c.lid === clean || c.lid === userPart || phoneOrJid.startsWith(c.lid))) {
      return true;
    }

    const contactClean = normalizePhone(c.phone);
    if (contactClean === clean) return true;

    // Se ambos terminarem com o mesmo número local (últimos 8 ou 9 dígitos com DDD)
    // Ex: 87981362724 ou 8781362724
    const cleanWithout55 = clean.startsWith('55') ? clean.slice(2) : clean;
    const contactWithout55 = contactClean.startsWith('55') ? contactClean.slice(2) : contactClean;

    if (cleanWithout55 === contactWithout55) return true;

    // Variação de nono dígito (com mesmo DDD)
    if (cleanWithout55.length === 11 && contactWithout55.length === 10) {
      // clean tem 9 dígitos, contact tem 8
      if (cleanWithout55.slice(0, 2) === contactWithout55.slice(0, 2) &&
          cleanWithout55.slice(3) === contactWithout55.slice(2)) {
        return true;
      }
    } else if (cleanWithout55.length === 10 && contactWithout55.length === 11) {
      // clean tem 8 dígitos, contact tem 9
      if (cleanWithout55.slice(0, 2) === contactWithout55.slice(0, 2) &&
          contactWithout55.slice(3) === cleanWithout55.slice(2)) {
        return true;
      }
    }

    return false;
  });

  return isAuth;
}

/**
 * Verifica se um grupo é autorizado
 */
export function isGroupAuthorized(groupId: string): boolean {
  const clean = normalizeGroupId(groupId);
  const data = getWhitelist();
  return data.groups.some((g) => g.groupId === clean);
}
