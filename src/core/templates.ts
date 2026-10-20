export type TemplateVars = Record<string, string | number | null | undefined>;

const VARIABLE = /\{([a-z][a-z0-9_.]*)\}/gi;

/** Remplace les variables `{nom}` connues ; les inconnues restent telles quelles pour être repérées. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(VARIABLE, (match, name: string) => {
    const value = vars[name.toLowerCase()];
    return value === undefined || value === null ? match : String(value);
  });
}

interface UserLike {
  id: string;
  username: string;
  displayName: string;
}

interface GuildLike {
  name: string;
  memberCount: number;
}

/** Variables communes à tous les messages personnalisables. */
export function baseVars({ user, guild, channelId }: { user?: UserLike; guild?: GuildLike; channelId?: string }): TemplateVars {
  return {
    ...(user && {
      user: `<@${user.id}>`,
      "user.name": user.displayName,
      "user.tag": user.username,
      "user.id": user.id,
    }),
    ...(guild && { server: guild.name, count: guild.memberCount }),
    ...(channelId && { channel: `<#${channelId}>` }),
  };
}

export const BASE_VARIABLES: Record<string, string> = {
  "{user}": "mention du membre",
  "{user.name}": "nom affiché",
  "{user.tag}": "nom d'utilisateur",
  "{user.id}": "identifiant",
  "{server}": "nom du serveur",
  "{count}": "nombre de membres",
  "{channel}": "mention du salon",
};
