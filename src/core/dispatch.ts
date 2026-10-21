import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
} from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { env } from "@/env";
import { logger } from "@/logger";
import { canUse, isModuleEnabled, requiredLabel, unavailableTables } from "./access";
import { normalizeChoice, parseBoolean, parseInteger, parseSnowflake, tokenizeWithIndex, type Token } from "./args";
import { usage, type ArgValue, type CommandDef, type OptionDef, type SubcommandDef } from "./command";
import { ANYONE, parseCustomId, type PanelInteraction } from "./components";
import { CommandContext } from "./context";
import { failure } from "./embeds";
import { UserError } from "./errors";
import { renderMessage } from "./messages";
import { getRegistry } from "./registry";

/** Message de refus si le module est coupé ou si le membre n'a pas l'accès requis. */
function refusal(settings: GuildSettings, member: GuildMember, command: CommandDef): string | null {
  const missing = unavailableTables(command.module);
  if (missing) {
    const label = getRegistry().module(command.module)?.label ?? command.module;
    return `Le module **${label}** n'est pas encore disponible : la base n'a pas sa table (${missing.join(", ")}). Elle doit d'abord être ajoutée au schéma du site.`;
  }
  if (!isModuleEnabled(settings, command.module)) {
    const label = getRegistry().module(command.module)?.label ?? command.module;
    return renderMessage(settings, "module.desactive", { module: label });
  }
  if (!canUse(settings, member, command)) return renderMessage(settings, "permission.refusee", { acces: requiredLabel(settings, command), niveau: requiredLabel(settings, command) });
  return null;
}

async function run(ctx: CommandContext) {
  try {
    await ctx.command.run(ctx);
  } catch (error) {
    if (error instanceof UserError) {
      await ctx.reply({ embeds: [failure(ctx.settings, error.message)] }, { private: true });
      return;
    }
    throw error;
  }
}

// ─── Commandes slash ────────────────────────────────────────────────────────

function readSlashOption(interaction: ChatInputCommandInteraction<"cached">, option: OptionDef): ArgValue | null {
  const { options } = interaction;
  switch (option.type) {
    case "string":
      return options.getString(option.name);
    case "integer":
      return options.getInteger(option.name);
    case "boolean":
      return options.getBoolean(option.name);
    case "user":
      return options.getUser(option.name);
    case "role":
      return options.getRole(option.name);
    case "channel":
      return options.getChannel(option.name);
  }
}

async function runSlash(interaction: ChatInputCommandInteraction<"cached">) {
  const command = getRegistry().find(interaction.commandName);
  if (!command) return;
  const settings = await getSettings(interaction.guildId);

  const denied = refusal(settings, interaction.member, command);
  if (denied) {
    await interaction.reply({ embeds: [failure(settings, denied)], flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = command.subcommands ? interaction.options.getSubcommand() : null;
  const definition = command.subcommands?.find(sub => sub.name === subcommand);
  const args = new Map<string, ArgValue>();
  for (const option of definition?.options ?? command.options ?? []) {
    const value = readSlashOption(interaction, option);
    if (value !== null) args.set(option.name, value);
  }

  await run(
    new CommandContext({ command, subcommand, settings, member: interaction.member, channel: interaction.channel, args, interaction }),
  );
}

async function runAutocomplete(interaction: AutocompleteInteraction<"cached">) {
  const command = getRegistry().find(interaction.commandName);
  const focused = interaction.options.getFocused(true);
  const subcommand = interaction.options.getSubcommand(false);
  const options = (subcommand ? command?.subcommands?.find(sub => sub.name === subcommand)?.options : command?.options) ?? [];
  const option = options.find(candidate => candidate.name === focused.name);
  const settings = await getSettings(interaction.guildId);

  if (!command || !option?.autocomplete || refusal(settings, interaction.member, command)) {
    await interaction.respond([]);
    return;
  }

  const query = String(focused.value).toLowerCase();
  const choices = await option.autocomplete({ settings, member: interaction.member, query });
  await interaction.respond(
    choices.filter(choice => choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query)).slice(0, 25),
  );
}

// ─── Commandes préfixe ──────────────────────────────────────────────────────

async function resolvePrefixValue(guild: Guild, option: OptionDef, raw: string): Promise<ArgValue> {
  const invalid = (what: string) => new UserError(`${what} : « ${raw} » (option \`${option.name}\`).`);
  switch (option.type) {
    case "string": {
      const value = option.choices ? normalizeChoice(option.choices, raw) : raw;
      if (value === null) throw invalid(`Valeur inconnue, choix possibles : ${option.choices!.map(choice => choice.value).join(", ")}`);
      if (option.maxLength !== undefined && value.length > option.maxLength) throw invalid(`Texte trop long (${option.maxLength} caractères au plus)`);
      return value;
    }
    case "integer": {
      const value = parseInteger(raw);
      if (value === null) throw invalid("Nombre entier attendu");
      if (option.minValue !== undefined && value < option.minValue) throw invalid(`Valeur minimale ${option.minValue}`);
      if (option.maxValue !== undefined && value > option.maxValue) throw invalid(`Valeur maximale ${option.maxValue}`);
      return value;
    }
    case "boolean": {
      const value = parseBoolean(raw);
      if (value === null) throw invalid("Réponse attendue : oui ou non");
      return value;
    }
    case "user": {
      const id = parseSnowflake(raw);
      const user = id ? await guild.client.users.fetch(id).catch(() => null) : null;
      if (!user) throw invalid("Membre introuvable (mention ou identifiant)");
      return user;
    }
    case "role": {
      const id = parseSnowflake(raw);
      const role = id ? guild.roles.cache.get(id) : guild.roles.cache.find(candidate => candidate.name.toLowerCase() === raw.toLowerCase());
      if (!role) throw invalid("Rôle introuvable");
      return role;
    }
    case "channel": {
      const id = parseSnowflake(raw);
      const channel = id
        ? guild.channels.cache.get(id)
        : guild.channels.cache.find(candidate => candidate.name.toLowerCase() === raw.replace(/^#/, "").toLowerCase());
      if (!channel) throw invalid("Salon introuvable");
      return channel;
    }
  }
}

async function parsePrefixArgs(guild: Guild, body: string, tokens: Token[], options: OptionDef[], usageLine: string) {
  const args = new Map<string, ArgValue>();
  for (const [index, option] of options.entries()) {
    const token = tokens[index];
    if (!token) {
      if (option.required) throw new UserError(`Il manque \`${option.name}\`.\nUsage : \`${usageLine}\``);
      continue;
    }
    if (option.rest) {
      args.set(option.name, await resolvePrefixValue(guild, option, body.slice(token.index).trim()));
      break;
    }
    args.set(option.name, await resolvePrefixValue(guild, option, token.value));
  }
  return args;
}

function subcommandHelp(command: CommandDef, prefix: string) {
  const lines = command.subcommands!.map(sub => `\`${usage(command, prefix, sub)}\` — ${sub.description}`);
  return `Sous-commandes de \`${prefix}${command.name}\` :\n${lines.join("\n")}`;
}

async function runPrefix(message: Message<true>) {
  const settings = await getSettings(message.guildId);
  const { prefix } = settings.config;
  const content = message.content;

  let body: string | null = null;
  if (content.toLowerCase().startsWith(prefix.toLowerCase())) {
    body = content.slice(prefix.length);
  } else {
    const mention = new RegExp(`^<@!?${message.client.user.id}>\\s*`).exec(content);
    if (mention) body = content.slice(mention[0].length);
  }
  if (body === null) return;

  const [first, ...rest] = tokenizeWithIndex(body);
  const command = first && getRegistry().find(first.value);
  if (!command) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const reply = (text: string) => message.reply({ embeds: [failure(settings, text)], allowedMentions: { repliedUser: false } });

  const denied = refusal(settings, member, command);
  if (denied) {
    await reply(denied);
    return;
  }

  try {
    let tokens = rest;
    let subcommand: SubcommandDef | undefined;
    if (command.subcommands) {
      subcommand = command.subcommands.find(sub => sub.name === tokens[0]?.value.toLowerCase());
      if (!subcommand) throw new UserError(subcommandHelp(command, prefix));
      tokens = tokens.slice(1);
    }
    const options = subcommand?.options ?? command.options ?? [];
    const args = await parsePrefixArgs(message.guild, body, tokens, options, usage(command, prefix, subcommand));
    const ctx = new CommandContext({ command, subcommand: subcommand?.name ?? null, settings, member, channel: message.channel, args, message });
    await run(ctx);
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    await reply(error.message);
  }
}

// ─── Boutons, menus et formulaires ──────────────────────────────────────────

async function runComponent(interaction: PanelInteraction) {
  const { prefix, ownerId, action, args } = parseCustomId(interaction.customId);
  const handler = getRegistry().component(prefix);
  if (!handler) return;
  const settings = await getSettings(interaction.guildId);
  const deny = (text: string) => interaction.reply({ embeds: [failure(settings, text)], flags: MessageFlags.Ephemeral });

  if (ownerId !== ANYONE && ownerId !== interaction.user.id) {
    await deny("Ce panneau appartient à un autre membre : ouvre le tien avec la commande correspondante.");
    return;
  }
  const command = handler.command ? getRegistry().find(handler.command) : undefined;
  const denied = command && refusal(settings, interaction.member, command);
  if (denied) {
    await deny(denied);
    return;
  }

  try {
    await handler.handle(interaction, { settings, action, args });
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    if (interaction.replied || interaction.deferred) await interaction.followUp({ embeds: [failure(settings, error.message)], flags: MessageFlags.Ephemeral });
    else await deny(error.message);
  }
}

// ─── Points d'entrée ────────────────────────────────────────────────────────

export async function handleInteraction(interaction: Interaction) {
  if (!interaction.inCachedGuild() || interaction.guildId !== env().DISCORD_GUILD_ID) return;
  try {
    if (interaction.isChatInputCommand()) await runSlash(interaction);
    else if (interaction.isAutocomplete()) await runAutocomplete(interaction);
    else if (interaction.isMessageComponent() || interaction.isModalSubmit()) await runComponent(interaction);
  } catch (error) {
    logger.error({ err: error, interaction: interaction.isCommand() ? interaction.commandName : "customId" in interaction ? interaction.customId : interaction.type }, "Interaction en échec");
    if (!interaction.isRepliable()) return;
    const settings = await getSettings(interaction.guildId).catch(() => null);
    const text = settings ? renderMessage(settings, "erreur.inattendue") : "Une erreur inattendue est survenue.";
    const payload = settings ? { embeds: [failure(settings, text)] } : { content: text };
    const send = interaction.replied || interaction.deferred ? interaction.followUp.bind(interaction) : interaction.reply.bind(interaction);
    await send({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

export async function handleMessage(message: Message) {
  if (message.author.bot || !message.inGuild() || message.guildId !== env().DISCORD_GUILD_ID) return;
  try {
    await runPrefix(message);
  } catch (error) {
    logger.error({ err: error, content: message.content.slice(0, 100) }, "Commande préfixe en échec");
    await message.reply({ content: "Une erreur inattendue est survenue.", allowedMentions: { repliedUser: false } }).catch(() => {});
  }
}
