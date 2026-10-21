import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { customId } from "@/core/components";
import { messageDefs } from "@/core/messages";
import { Registry } from "@/core/registry";
import { modules } from "@/modules";

describe("registre des modules", () => {
  const registry = new Registry(modules);

  it("charge tous les modules sans doublon ni option mal ordonnée", () => {
    expect(registry.allCommands().length).toBeGreaterThan(0);
  });

  it("produit des commandes slash acceptables par Discord", () => {
    for (const command of registry.slashCommands()) {
      expect(command.name).toMatch(/^[\p{Ll}\p{Lo}\p{N}_-]{1,32}$/u);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
      expect(command.options?.length ?? 0).toBeLessThanOrEqual(25);
    }
    expect(registry.slashCommands().length).toBeLessThanOrEqual(100);
  });

  it("retrouve une commande par son alias, sans tenir compte de la casse", () => {
    expect(registry.find("HELP")?.name).toBe("aide");
    expect(registry.find("settings")?.name).toBe("config");
  });

  it("enregistre les messages système", () => {
    expect(messageDefs().map(message => message.key)).toEqual(expect.arrayContaining(["permission.refusee", "module.desactive", "erreur.inattendue"]));
  });

  it("garde les identifiants de composants sous 100 caractères avec un identifiant de niveau complet", () => {
    const id = customId("cfg", "123456789012345678901", "lvl-edit-save", "0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(id.length).toBeLessThanOrEqual(100);
  });
});

describe("visibilité des commandes slash", () => {
  const commands = Object.fromEntries(new Registry(modules.map(module => ({ ...module, messages: [] }))).slashCommands().map(command => [command.name, command]));
  const manageGuild = String(PermissionFlagsBits.ManageGuild);

  it("cache les commandes d'administration aux membres sans « Gérer le serveur »", () => {
    for (const name of ["config", "prefixe", "couleur", "module", "acces", "permission", "profil", "message", "site", "logs", "tickets"]) {
      expect(commands[name]?.default_member_permissions).toBe(manageGuild);
    }
  });

  it("laisse les commandes des joueurs visibles par tous", () => {
    for (const name of ["aide", "ping", "candidature", "ticket"]) expect(commands[name]?.default_member_permissions).toBeNull();
  });

  it("réserve le créateur d'embeds aux membres qui gèrent les messages", () => {
    expect(commands.embed?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageMessages));
  });
});
