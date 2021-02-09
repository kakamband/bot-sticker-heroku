const fs = require("fs");
const {
  WAConnection,
  MessageType,
  ReconnectMode,
} = require("@adiwajshing/baileys");
const ffmpeg = require("fluent-ffmpeg");
const streamifier = require("streamifier");
const Axios = require("axios");
const Crypto = require("crypto");
const { tmpdir } = require("os");
const path = require("path");
const imageminWebp = require("imagemin-webp");

async function connectToWhatsApp() {
  const conn = new WAConnection(); // instantiate
  conn.autoReconnect = ReconnectMode.onConnectionLost; // only automatically reconnect when the connection breaks
  conn.logger.level = "fatal"; // set to 'debug' to see what kind of stuff you can implement
  // attempt to reconnect at most 10 times in a row
  conn.connectOptions.maxRetries = 10;
  conn.on("credentials-updated", () => {
    console.log("Credenciales actualizadas");
    const authInfo = conn.base64EncodedAuthInfo(); // get all the auth info we need to restore this session
    fs.writeFileSync("./auth_info.json", JSON.stringify(authInfo, null, "\t")); // save this info to a file
  });
  fs.existsSync("./auth_info.json") && conn.loadAuthInfo("./auth_info.json");
  await conn.connect();
  conn.on("chat-update", async (chatUpdate) => {
    if (chatUpdate.messages) {
      let m = chatUpdate.messages.all()[0];
      if (!m.message) return;
      handleCommand(m);
    }
  });
  async function handleCommand(m) {
    const messageType = Object.keys(m.message)[0];
    if (
      messageType == MessageType.image &&
      m.message.imageMessage.url &&
      m.message.imageMessage.caption == "/sticker"
    ) {
      let imageBuffer = await conn.downloadMediaMessage(m);
      let sticker = await imageminWebp({ preset: "icon" })(imageBuffer);
      await conn.sendMessage(m.key.remoteJid, sticker, MessageType.sticker);
      console.log("Imagen de etiqueta enviada a: " + m.key.remoteJid);
    } else if (
      messageType == MessageType.video &&
      m.message.videoMessage.url &&
      m.message.videoMessage.caption == "/sticker"
    ) {
      let processOptions = {
        fps: 20,
        startTime: `00:00:00.0`,
        endTime: `00:00:07.0`,
        loop: 0,
      };
      const tempFile = path.join(
        tmpdir(),
        `processing.${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
      );
      let videoBuffer = await conn.downloadMediaMessage(m);
      const videoStream = await streamifier.createReadStream(videoBuffer);
      let success = await new Promise((resolve, reject) => {
        var command = ffmpeg(videoStream)
          .inputFormat("mp4")
          .on("error", function (err) {
            console.log("Ocurrió un error: " + err.message);
            reject(err);
          })
          .on("start", function (cmd) {
            console.log("Empezado" + cmd);
          })
          .addOutputOptions([
            `-vcodec`,
            `libwebp`,
            `-vf`,
            `crop=w='min(min(iw\,ih)\,500)':h='min(min(iw\,ih)\,500)',scale=500:500,setsar=1,fps=${processOptions.fps}`,
            `-loop`,
            `${processOptions.loop}`,
            `-ss`,
            processOptions.startTime,
            `-t`,
            processOptions.endTime,
            `-preset`,
            `default`,
            `-an`,
            `-vsync`,
            `0`,
            `-s`,
            `512:512`,
          ])
          .toFormat("webp")
          .on("end", () => {
            resolve(true);
          })
          .saveToFile(tempFile);
      });
      if (!success) {
        console.log("Error al procesar el video");
        return;
      }
      var bufferwebp = await fs.readFileSync(tempFile);
      await fs.unlinkSync(tempFile);
      await conn.sendMessage(m.key.remoteJid, bufferwebp, MessageType.sticker);
      console.log("Pegatina enviada a: " + m.key.remoteJid);
    } else if (
      m.message.conversation &&
      m.message.conversation.startsWith("/imagen")
    ) {
      let message = m.message.conversation.replace("/imagen", "").trim();
      let isSticker = false;
      if (message.includes("sticker")) {
        isSticker = true;
        message = message.replace("sticker", "").trim();
      }
      let search = message;
      let { data } = await Axios.get(
        encodeURI(`https://st4rz.herokuapp.com/api/yta2?url=${search}`)
      );
      if (!data) {
        console.log("No hay datos de: " + search);
        return;
      }
      let response = await Axios.get(
        data[Math.floor(Math.random() * data.length)],
        {
          responseType: "arraybuffer",
        }
      );
      if (!response.data) return;
      if (isSticker) {
        let sticker = await imageminWebp({ preset: "icon" })(response.data);
        await conn.sendMessage(m.key.remoteJid, sticker, MessageType.sticker);
        console.log("Pegatina aleatoria enviada a: " + m.key.remoteJid);
        return;
      }
      await conn.sendMessage(m.key.remoteJid, response.data, MessageType.image);
      console.log("Imagen aleatoria enviada a: " + m.key.remoteJid);
    }
  }
  conn.on("close", ({ reason, isReconnecting }) =>
    console.log(
      "Se ha perdido la conexión: " + reason + " Intentando reconectar: " + isReconnecting
    )
  );
}

connectToWhatsApp().catch((err) => console.log("Error inesperado: " + err));
