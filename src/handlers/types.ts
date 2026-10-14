import makeWASocket, { proto } from '@whiskeysockets/baileys';

export type WASocket = ReturnType<typeof makeWASocket>;

export interface CommandContext {
  sock: WASocket;
  message: proto.IWebMessageInfo;
  senderJid: string;
  fromMe: boolean;
  isGroup: boolean;
  args: string[];
  command: string;
  body: string;
  reply: (text: string) => Promise<any>;
}

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  execute: (ctx: CommandContext) => Promise<void>;
}
