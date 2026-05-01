import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Locale = "en" | "es" | "fr" | "pt-BR";
type Params = Record<string, string | number>;

const translations: Record<Exclude<Locale, "en">, Record<string, string>> = {
  es: {
    "security.mode.current": "Modo actual: {mode}",
    "security.config.path": "Ruta de configuración: {path}",
    "security.mode.basic": "Básico: comandos críticos bloqueados, localhost/127.x permitido",
    "security.mode.max": "Máximo: todos los comandos bloqueados, protección SSRF completa",
    "security.mode.setBasic": "/security mode basic  — relajar restricciones para desarrollo",
    "security.mode.setMax": "/security mode max    — bloqueo completo (predeterminado)",
    "security.alreadyMode": "El modo de seguridad ya es {mode}",
    "security.persistFailed": "ERROR al guardar el modo de seguridad: no se pudo escribir {path}",
    "security.modeChanged": "Modo de seguridad cambiado a {mode}",
    "security.invalidMode": "Modo no válido: \"{mode}\". Usa \"basic\" o \"max\".",
    "security.extendedAllowed": "Los comandos extendidos ahora están PERMITIDOS: rm, sudo, npm, apt, git, curl, wget, etc.",
    "security.localhostAllowed": "Las URLs localhost y 127.x ahora están PERMITIDAS para SSRF",
    "security.criticalStillBlocked": "Los comandos críticos siguen bloqueados: dd, mkfs, shred, fdisk, ssh, etc.",
    "security.fullLockdown": "Bloqueo completo activo — los {count} comandos están bloqueados",
    "security.fullSsrf": "Protección SSRF completa — localhost e IPs privadas bloqueadas",
    "security.auditRequiresTui": "La auditoría de seguridad requiere modo TUI",
  },
  fr: {
    "security.mode.current": "Mode actuel : {mode}",
    "security.config.path": "Chemin de configuration : {path}",
    "security.mode.basic": "Basique : commandes critiques bloquées, localhost/127.x autorisé",
    "security.mode.max": "Maximum : toutes les commandes bloquées, protection SSRF complète",
    "security.mode.setBasic": "/security mode basic  — assouplir les restrictions pour le développement",
    "security.mode.setMax": "/security mode max    — verrouillage complet (par défaut)",
    "security.alreadyMode": "Le mode de sécurité est déjà {mode}",
    "security.persistFailed": "ÉCHEC de l’enregistrement du mode de sécurité : impossible d’écrire {path}",
    "security.modeChanged": "Mode de sécurité défini sur {mode}",
    "security.invalidMode": "Mode non valide : \"{mode}\". Utilisez \"basic\" ou \"max\".",
    "security.extendedAllowed": "Les commandes étendues sont maintenant AUTORISÉES : rm, sudo, npm, apt, git, curl, wget, etc.",
    "security.localhostAllowed": "Les URL localhost et 127.x sont maintenant AUTORISÉES pour SSRF",
    "security.criticalStillBlocked": "Les commandes critiques restent bloquées : dd, mkfs, shred, fdisk, ssh, etc.",
    "security.fullLockdown": "Verrouillage complet actif — les {count} commandes sont bloquées",
    "security.fullSsrf": "Protection SSRF complète — localhost et IP privées bloqués",
    "security.auditRequiresTui": "L’audit de sécurité nécessite le mode TUI",
  },
  "pt-BR": {
    "security.mode.current": "Modo atual: {mode}",
    "security.config.path": "Caminho de configuração: {path}",
    "security.mode.basic": "Básico: comandos críticos bloqueados, localhost/127.x permitido",
    "security.mode.max": "Máximo: todos os comandos bloqueados, proteção SSRF completa",
    "security.mode.setBasic": "/security mode basic  — relaxar restrições para desenvolvimento",
    "security.mode.setMax": "/security mode max    — bloqueio completo (padrão)",
    "security.alreadyMode": "O modo de segurança já é {mode}",
    "security.persistFailed": "FALHA ao persistir o modo de segurança: não foi possível escrever {path}",
    "security.modeChanged": "Modo de segurança definido para {mode}",
    "security.invalidMode": "Modo inválido: \"{mode}\". Use \"basic\" ou \"max\".",
    "security.extendedAllowed": "Comandos estendidos agora estão PERMITIDOS: rm, sudo, npm, apt, git, curl, wget, etc.",
    "security.localhostAllowed": "URLs localhost e 127.x agora estão PERMITIDAS para SSRF",
    "security.criticalStillBlocked": "Comandos críticos continuam bloqueados: dd, mkfs, shred, fdisk, ssh, etc.",
    "security.fullLockdown": "Bloqueio completo ativo — todos os {count} comandos bloqueados",
    "security.fullSsrf": "Proteção SSRF completa — localhost e IPs privados bloqueados",
    "security.auditRequiresTui": "A auditoria de segurança requer modo TUI",
  },
};

let currentLocale: Locale = "en";

export function initI18n(pi: ExtensionAPI): void {
  pi.events?.emit?.("pi-core/i18n/registerBundle", {
    namespace: "vtstech-security",
    defaultLocale: "en",
    locales: translations,
  });

  pi.events?.emit?.("pi-core/i18n/requestApi", {
    onReady: (api: { getLocale?: () => string; onLocaleChange?: (cb: (locale: string) => void) => void }) => {
      const next = api.getLocale?.();
      if (isLocale(next)) currentLocale = next;
      api.onLocaleChange?.((locale) => {
        if (isLocale(locale)) currentLocale = locale;
      });
    },
  });
}

export function t(key: string, fallback: string, params: Params = {}): string {
  const template = currentLocale === "en" ? fallback : translations[currentLocale]?.[key] ?? fallback;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

function isLocale(locale: string | undefined): locale is Locale {
  return locale === "en" || locale === "es" || locale === "fr" || locale === "pt-BR";
}
