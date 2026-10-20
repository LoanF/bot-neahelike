import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { GuildSettings } from "@/config/store";
import type { CommandDef } from "./command";
import { describeWeight, memberWeight, requiredWeight } from "./permissions";
import { getRegistry } from "./registry";

export function isModuleEnabled(settings: GuildSettings, moduleId: string): boolean {
  if (getRegistry().module(moduleId)?.locked) return true;
  return settings.modules.get(moduleId)?.enabled ?? true;
}

export function commandWeight(settings: GuildSettings, command: CommandDef): number {
  return requiredWeight(settings.levels, {
    defaultWeight: command.defaultWeight,
    protected: command.protected,
    moduleLevelId: settings.modules.get(command.module)?.levelId,
    override: settings.commandOverrides.get(command.name),
  });
}

export function weightOf(settings: GuildSettings, member: GuildMember): number {
  return memberWeight(settings.levels, member.roles.cache.keys(), member.permissions.has(PermissionFlagsBits.Administrator));
}

export function canUse(settings: GuildSettings, member: GuildMember, command: CommandDef): boolean {
  return weightOf(settings, member) >= commandWeight(settings, command);
}

export function requiredLabel(settings: GuildSettings, command: CommandDef): string {
  return describeWeight(settings.levels, commandWeight(settings, command));
}
