import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { GuildSettings } from "@/config/store";
import type { CommandDef } from "./command";
import { allows, describeResolved, memberWeight, resolveRequirement, type MemberAccess, type Resolved } from "./permissions";
import { getRegistry } from "./registry";

export function isModuleEnabled(settings: GuildSettings, moduleId: string): boolean {
  if (getRegistry().module(moduleId)?.locked) return true;
  return settings.modules.get(moduleId)?.enabled ?? true;
}

/** Exigence effective d'une commande : accès réglé, sinon permission Discord par défaut. */
export function requirementOf(settings: GuildSettings, command: CommandDef): Resolved {
  return resolveRequirement(settings.levels, {
    defaultPermission: command.defaultPermission,
    protected: command.protected,
    moduleLevelId: settings.modules.get(command.module)?.levelId,
    override: settings.commandOverrides.get(command.name),
  });
}

export function memberAccess(settings: GuildSettings, member: GuildMember): MemberAccess {
  return {
    weight: memberWeight(settings.levels, member.roles.cache.keys()),
    administrator: member.permissions.has(PermissionFlagsBits.Administrator),
    hasPermission: permission => member.permissions.has(permission),
  };
}

export function canUse(settings: GuildSettings, member: GuildMember, command: CommandDef): boolean {
  return allows(requirementOf(settings, command), memberAccess(settings, member));
}

export function requiredLabel(settings: GuildSettings, command: CommandDef): string {
  return describeResolved(requirementOf(settings, command));
}
