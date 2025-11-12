// === Imports ===
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from "@whiskeysockets/baileys";

import chalk from "chalk";
import fs from "fs";
import path from "path";
import pino from "pino";
import readline from "readline";

import { initProtections } from "./block.js";
import { welcomeEvents } from "./commands/welcome.js";
import { autoreactEvents } from "./commands/autoreact.js";
import { autorecordingEvents } from "./commands/autorecording.js";
import { statusReactEvents } from "./commands/statusreact.js";
import statusLike from "./events/statuslike.js";
export { getBareNumber };
export { getMode, setMode };
// === Config simplifiée ===
const PREFIX = "+";
const STATUS_REACT = "🥶";

// === Mode private/public ===
const MODE_FILE = "./mode.json";

function getMode() {
  if (!fs.existsSync(MODE_FILE)) {
    fs.writeFileSync(MODE_FILE, JSON.stringify({ mode: "private" }, null, 2));
    return "private";
  }
  const data = JSON.parse(fs.readFileSync(MODE_FILE, "utf-8"));
  return data.mode || "private";
}

function setMode(newMode) {
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode: newMode }, null, 2));
}

// === Helper readline spécial Pterodactyl ===
function question(query) {
  process.stdout.write(query + "\n> ");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.on("line", input => {
      rl.close();
      resolve(input);
    });
    process.stdout.write("");
  });
}

// === Normalisation du JID ===
function normalizeJid(jid) {
  if (!jid) return null;
  return jid.split(":")[0].replace("@lid", "@s.whatsapp.net");
}

// === Gestion sudo.json ===
const SUDO_FILE = "./sudo.json";
function loadSudo() {
  if (!fs.existsSync(SUDO_FILE)) return [];
  return JSON.parse(fs.readFileSync(SUDO_FILE, "utf-8"));
}

// === Fonctions config utilisateurs ===
const CONFIG_PATH = path.join("./config.json");
function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({ users: {} }, null, 2));
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}
function saveConfig(configFile) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(configFile, null, 2)); }
function getUserConfig(number) { return getConfig().users[number] || null; }
function setUserConfig(number, data) {
  const cfg = getConfig();
  cfg.users[number] = { ...(cfg.users[number] || {}), ...data };
  saveConfig(cfg);
}

function getBareNumber(input) {
  if (!input) return "";
  const s = String(input);
  const beforeAt = s.split("@")[0];
  const beforeColon = beforeAt.split(":")[0];
  return beforeColon.replace(/[^0-9]/g, "");
}

function unwrapMessage(m) {
  return m?.ephemeralMessage?.message ||
         m?.viewOnceMessageV2?.message ||
         m?.viewOnceMessageV2Extension?.message ||
         m?.documentWithCaptionMessage?.message ||
         m?.viewOnceMessage?.message ||
         m;
}

function pickText(m) {
  return m?.conversation ||
         m?.extendedTextMessage?.text ||
         m?.imageMessage?.caption ||
         m?.videoMessage?.caption ||
         m?.buttonsResponseMessage?.selectedButtonId ||
         m?.listResponseMessage?.singleSelectReply?.selectedRowId ||
         m?.templateButtonReplyMessage?.selectedId ||
         m?.reactionMessage?.text ||
         m?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
}

function afficherBanner() {
  console.log("\SAKAMOTO 🌹\n");
}

// === Fonction principale ===
async function startPairing() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  // === Si pas encore enregistré ===
  if (!state.creds.registered) {
    console.log(chalk.cyan("\n=== 🟢 CONFIGURATION DE L’APPAREIL ===\n"));
    await new Promise(r => setTimeout(r, 1000));
    const phoneNumber = await question(chalk.cyan.bold("⚡ Entre ton numéro WhatsApp (ex: 241XXXXXXXX): "));
    console.log("");
    const code = await sock.requestPairingCode(phoneNumber.trim());
    console.log(chalk.greenBright("\n🌹 Code d’appairage : ") + chalk.yellowBright.bold(code.split("").join(" ")));
  }

  // === Événements de connexion ===
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log(chalk.greenBright("🌹 Connecté à WhatsApp avec succès !"));
      afficherBanner();

      const ownerId = normalizeJid(sock.user?.id);
      const ownerBare = getBareNumber(ownerId);
      const ownerLid = sock.user?.lid ? getBareNumber(sock.user.lid) : null;
      global.owners = [ownerBare];
      if (ownerLid) global.owners.push(ownerLid);

      console.log(chalk.green(`🌹 Propriétaire ID : ${ownerBare}`));
      console.log(chalk.yellow(`🌹 Propriétaire LID : ${ownerLid || "non disponible"}`));

      const ownerJid = ownerBare + "@s.whatsapp.net";

      // === Premier démarrage ===
      if (!fs.existsSync("./.firstboot")) {
        fs.writeFileSync("./.firstboot", "done");

        const messageTexte = `
╔═════༺picolo-𝗠𝗗༻═════╗
➤ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 : https://whatsapp.com/channel/0029VbB8P8WLCoWwr0nDDc0n

➤ 𝗗𝗲𝘃 : wa.me/24165849067

➤𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺 : t.me/DemonKing237
╚═════༺picolo-𝗠𝗗༻═════╝

        `;

        await sock.sendMessage(ownerJid, {
          video: { url: "https://files.catbox.moe/2ezt9q.mp4" },
          caption: messageTexte
        });

        console.log(chalk.red("⚡ Premier démarrage → redémarrage automatique dans 5s..."));
        setTimeout(() => process.exit(1), 5000);
        return;
      }
    } else if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      console.log(chalk.red("❌ Déconnecté :", reason));
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(startPairing, 5000);
      } else {
        console.log(chalk.red("💀 Session expirée. Supprimez le dossier session et relancez."));
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // === Auto status like ===
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.remoteJid === "status@broadcast") {
      await statusLike(sock, messages, STATUS_REACT);
    }
  });

  // === Initialisation des protections et commandes ===
  initProtections(sock);
  welcomeEvents(sock);
  autoreactEvents(sock);
  autorecordingEvents(sock);
  statusReactEvents(sock);

  // === Chargement des commandes ===
  const commands = {};
  const commandFiles = fs.readdirSync(path.join("./commands")).filter(f => f.endsWith(".js"));
  for (const file of commandFiles) {
    const command = await import(path.resolve(`./commands/${file}`));
    commands[command.name] = command;
  }

  // === Gestion des messages avec mode private/public ===
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    if (isGroup && !msg.key.participant) {
      msg.key.participant = msg.participant || msg.message?.extendedTextMessage?.contextInfo?.participant || msg.key.remoteJid;
    }

    let realSenderJid = msg.key.fromMe ? sock.user.id : (msg.key.participant || from);
    try { realSenderJid = sock.decodeJid(realSenderJid); } 
    catch { realSenderJid = normalizeJid(realSenderJid); }

    const senderNum = getBareNumber(realSenderJid);
    const inner = unwrapMessage(msg.message);
    const text = pickText(inner);
    if (!text) return;

    // === Vérification du mode ===
    const mode = getMode();
    if (mode === "private") {
      const sudoList = loadSudo().map(n => String(n).replace(/[^0-9]/g, ""));
      const allowedUsers = [...(global.owners || []), ...sudoList];
      if (!allowedUsers.includes(senderNum)) return;
    }

    // === Affichage console ===
    if (isGroup) {
      try {
        const groupMetadata = await sock.groupMetadata(from);
        console.log(chalk.blue(`[GROUPE: ${groupMetadata.subject}] (${senderNum}) → ${text}`));
      } catch {
        console.log(chalk.blue(`[GROUPE] (${senderNum}) → ${text}`));
      }
    } else console.log(chalk.yellow(`[PRIVÉ] (${senderNum}) → ${text}`));

    // === Préférences utilisateur ===
    let userPrefs = getUserConfig(from) || {};
    if (!userPrefs.prefix) userPrefs.prefix = PREFIX;
    if (!text.startsWith(userPrefs.prefix)) return;

    const args = text.slice(userPrefs.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    if (commands[cmd]) {
      try { await commands[cmd].execute(sock, msg, args, from); } 
      catch (err) { console.error(chalk.red(`Erreur commande ${cmd} :`), err); }
    }
  });

  // === Auto-response si bot ou owner tagué ===
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return;

    const from = msg.key.remoteJid;
    const inner = unwrapMessage(msg.message);
    const text = pickText(inner);
    if (!text) return;

    const mentions = inner?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // ⚙️ Vérifie si la réponse est activée
    const settingsFile = `./tag_settings/${from.replace(/[^0-9]/g, "")}.json`;
    if (fs.existsSync(settingsFile)) {
      const { enabled } = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
      if (!enabled) return;
    }

    // Comparaison par numéro pur
    const mentionedNums = mentions.map(j => getBareNumber(j));
    const botNum = getBareNumber(sock.user?.id);
    const botLidNum = getBareNumber(sock.user?.lid);
    const ownerNum = global.owners?.[0] || null;

    if (mentionedNums.includes(botNum) || mentionedNums.includes(botLidNum) || mentionedNums.includes(ownerNum)) {
      const soundFile = `./tag_sounds/${from.replace(/[^0-9]/g, "")}.mp3`;
      if (fs.existsSync(soundFile)) {
        const buffer = fs.readFileSync(soundFile);
        await sock.sendMessage(from, { audio: buffer, mimetype: "audio/mp4", ptt: true });
      } else {
        const sender = msg.pushName || getBareNumber(msg.key.participant);
        await sock.sendMessage(from, { text: `🤖 ${sender} a mentionné le bot/owner — ils répondront bientôt !` });
      }
    }
  });
}

// === Lancement du bot ===
startPairing();
