import pino from "pino";

function transport() {
  // Sortie lisible dans un terminal, JSON partout ailleurs (hébergeur, Docker).
  if (!process.stdout.isTTY) return undefined;
  try {
    return pino.transport({ target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } });
  } catch {
    return undefined;
  }
}

export const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: undefined }, transport());
