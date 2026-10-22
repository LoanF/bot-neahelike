import { execSync } from "node:child_process";
import pino from "pino";

/**
 * Les logs sont écrits en UTF-8. Une console Windows reste souvent sur une ancienne page de code (850, 437),
 * et les accents s'y affichent mal (« Pr├®sence »). On la passe en UTF-8 (page 65001) pour la fenêtre en cours.
 */
function utf8WindowsConsole() {
  if (process.platform !== "win32" || !process.stdout.isTTY) return;
  try {
    execSync("chcp 65001", { stdio: "ignore" });
  } catch {
    // Sans chcp, les logs restent lisibles, seuls les accents sont mal affichés.
  }
}

utf8WindowsConsole();

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
