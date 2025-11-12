import chalk from "chalk";

// =================== CONFIG ===================
const owners = [""]; // ajouter les numéros propriétaires ici

// =================== ETAT DES PROTECTIONS ===================
export const statusProtections = {
  antiLink: false,
  antiPromote: false,
  antiDemote: false,
  antiBot: false
};

// =================== FONCTIONS ===================

// Vérifie si le bot est admin
async function isBotAdmin(sock, groupId) {
  try {
    const metadata = await sock.groupMetadata(groupId);
    const botId = sock.user.id;
    const botInfo = metadata.participants.find(p => p.id === botId);
    return botInfo?.admin !== null;
  } catch {
    return false;
  }
}

// Anti-Link (supprime uniquement le message, silencieux)
export function antiLink(sock) {
  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!statusProtections.antiLink) return;
    const msg = messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption;

    if (!text) return;

    try {
      if (!from.endsWith("@g.us")) return;

      const groupMetadata = await sock.groupMetadata(from);
      const sender = msg.key.participant || from;
      const isAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin;

      if (owners.includes(sender) || isAdmin) return;

      const linkRegex =
        /(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9.-]+\.[a-z]{2,}\b)/gi;

      if (linkRegex.test(text)) {
        if (!msg.key.fromMe) {
          await sock.sendMessage(from, { delete: msg.key });
          console.log(chalk.yellow(`[ANTI-LINK] Lien supprimé dans ${from}`));
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
}

// Anti-Promote (rétrogradation silencieuse)
export function antiPromote(sock) {
  sock.ev.on("group-participants.update", async (update) => {
    if (!statusProtections.antiPromote) return;
    if (update.action !== "promote") return;
    const groupId = update.id;

    try {
      for (const participant of update.participants) {
        if (owners.includes(participant)) continue;
        await sock.groupParticipantsUpdate(groupId, [participant], "demote");
        console.log(chalk.yellow(`[ANTI-PROMOTE] ${participant} est demote dans ${groupId}`));
      }
    } catch (e) {
      console.error(e);
    }
  });
}

// Anti-Demote (re-promotion silencieuse)
export function antiDemote(sock) {
  sock.ev.on("group-participants.update", async (update) => {
    if (!statusProtections.antiDemote) return;
    if (update.action !== "demote") return;
    const groupId = update.id;

    try {
      for (const participant of update.participants) {
        if (owners.includes(participant)) continue;
        await sock.groupParticipantsUpdate(groupId, [participant], "promote");
        console.log(chalk.yellow(`[ANTI-DEMOTE] ${participant} est promu dans ${groupId}`));
      }
    } catch (e) {
      console.error(e);
    }
  });
}

// Anti-Bot (supprime les bots ajoutés, silencieux)
export function antiBot(sock) {
  sock.ev.on("group-participants.update", async (update) => {
    if (!statusProtections.antiBot) return;
    if (update.action === "add") {
      try {
        for (const participant of update.participants) {
          if (participant.includes("bot") && !owners.includes(participant)) {
            await sock.groupParticipantsUpdate(update.id, [participant], "remove");
            console.log(chalk.red(`[ANTI-BOT] Bot ${participant} supprimé du groupe ${update.id}`));
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  });
}

// Commande !protect (silencieuse, ne répond jamais)
export function protectCommand(sock) {
  // On désactive totalement les réponses, donc on n'écoute plus pour envoyer quoi que ce soit
  // Cette fonction peut rester vide ou juste modifier statusProtections
}

// =================== INIT ===================
export function initProtections(sock) {
  antiLink(sock);
  antiPromote(sock);
  antiDemote(sock);
  antiBot(sock);
  // protectCommand(sock); // ne rien envoyer pour rester silencieux
}
