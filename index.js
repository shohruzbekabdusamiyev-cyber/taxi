import TelegramBot from "node-telegram-bot-api";
import { MongoClient, ObjectId } from "mongodb";
import cron from "node-cron";
// import { ObjectId } from "mongodb";

// ===== CONFIG =====
const TOKEN = "8552276644:AAEAFmwBiE0aYXIKeNVyOqIg6YiO3fC-Fgk";
const DB_NAME = "taxi";
const GROUP_ID = -1003880550047;

// ===== INIT =====
const bot = new TelegramBot(TOKEN, { polling: true });

bot.setMyCommands([
  { command: "/start", description: "Botni boshlash" },
]);
// ===== MONGO =====
const uri =
  "mongodb://user:user@ac-rxxuq98-shard-00-00.r5qzmqh.mongodb.net:27017,ac-rxxuq98-shard-00-01.r5qzmqh.mongodb.net:27017,ac-rxxuq98-shard-00-02.r5qzmqh.mongodb.net:27017/?replicaSet=atlas-wcifd0-shard-0&ssl=true&authSource=admin";

const client = new MongoClient(uri);

let db, usersCollection, requestsCollection, sessionsCollection;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  usersCollection = db.collection("users");
  requestsCollection = db.collection("requests");
  sessionsCollection = db.collection("sessions");
  console.log("MongoDB ulandi ✅");
}

await connectDB();

// ================= SESSION =================
async function setState(userId, data) {
  await sessionsCollection.updateOne(
    { telegramId: userId },
    { $set: data },
    { upsert: true }
  );
}

async function getState(userId) {
  return await sessionsCollection.findOne({ telegramId: userId });
}

async function clearState(userId) {
  await sessionsCollection.deleteOne({ telegramId: userId });
}

// ================= AUTOMATIC CLEANUP =================
// Har kuni 02:00 O‘zbekiston vaqti bilan eski requestlarni o‘chirish
cron.schedule("0 21 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const result = await requestsCollection.deleteMany({
    createdAt: { $lt: yesterday },
  });

  console.log(`🗑️ ${result.deletedCount} ta eski so‘rov o‘chirildi`);
});

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  await clearState(msg.from.id);

  bot.sendMessage(msg.chat.id, "Tanlang:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚖 Find Taxi", callback_data: "findTaxi" }],
        [{ text: "📝 So‘rov yaratish", callback_data: "createRequest" }],
        [{ text: "📋 Mening so'rovlarim", callback_data: "myRequests" }],
        [{ text: "📋 Malumotlarni tahrirlash", callback_data: "reset" }],
      ],
    },
  });
});

// ================= CALLBACK =================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;
  const username = q.from.username || "No username";
  const data = q.data;

  let state = await getState(userId);


    
  // -------- CREATE REQUEST --------
  if (data === "createRequest") {
    const user = await usersCollection.findOne({ telegramId: userId });

    if (!user || !user.name || !user.phone || !user.car) {
      await setState(userId, { step: "register_name" });
      return bot.sendMessage(
        chatId,
        "Ro‘yxatdan o‘tish boshlandi.\n\nIsmingizni kiriting:"
      );
    }

    await setState(userId, { step: "direction", type: "create" });
    return sendDirectionButtons(chatId, "create");
  }

  // -------- FIND TAXI --------
  if (data === "findTaxi") {
    await setState(userId, { step: "direction", type: "find" });
    return sendDirectionButtons(chatId, "find");
  }

  if (data === "reset") {
  const userId = q.from.id;

  // Users collection’dan o‘chirish
  await usersCollection.deleteOne({ telegramId: userId });

  // Sessions collection’dan o‘chirish
  await sessionsCollection.deleteOne({ telegramId: userId });

  // Requests collection’dan foydalanuvchiga tegishli so‘rovlarni o‘chirish
  // await requestsCollection.deleteMany({ telegramId: userId });

  // Foydalanuvchiga xabar
  await bot.sendMessage(chatId, "✅ Sizning barcha malumotlaringiz o‘chirildi");

  // Callbackni javob bilan yakunlash
  return bot.answerCallbackQuery(q.id);

  
}
if (data === "myRequests") {
  const userId = q.from.id;
  const username = q.from.username || "No username";

  const requests = await requestsCollection
    .find({ telegramId: userId })
    .sort({ createdAt: -1 })
    .toArray();

  if (!requests.length) {
    return bot.sendMessage(chatId, "Sizda hech qanday so‘rov yo‘q ❌");
  }

  for (const r of requests) {
    let text = `
🚖 TAXI

📍 ${r.direction}
⏰ ${r.time}
👥 ${r.peopleCount} TA JOY
🚕 ${r.car}
👤 ${r.name}

📞 ${r.phone}

👤 @${username}
`;

    if (r.post) text += "\n📦 POCHTA OLADI";
    if (r.female) text += "\n👩 SALONDA AYOL BOR";

    await bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📤 Send Again", callback_data: `send_again_${r._id}` }
          ],
          [
            { text: "❌ Delete", callback_data: `delete_${r._id}` }
          ]
        ]
      }
    });
  }
}

// if (data === "myRequests") {
//   const userId = q.from.id;
//   const username = q.from.username || "No username";

//   const requests = await requestsCollection
//     .find({ telegramId: userId })
//     .sort({ createdAt: -1 })
//     .toArray();

//   if (!requests.length) {
//     return bot.sendMessage(chatId, "Sizda hech qanday so‘rov yo‘q ❌");
//   }

//   for (const r of requests) {
//     let text = `
// 🚖 SO‘ROV

// 📍 ${r.direction}
// ⏰ ${r.time}
// 👥 ${r.peopleCount} TA JOY
// 🚕 ${r.car}
// 👤 ${r.name}
// 📞 ${r.phone}
// 👤 @${username}
// `;

//     if (r.post) text += "\n📦 POCHTA OLADI";
//     if (r.female) text += "\n👩 SALONDA AYOL BOR";

//     // Guruhga qayta jo‘natish uchun callback tugmasi
//     await bot.sendMessage(chatId, text, {
//       reply_markup: {
//         inline_keyboard: [
//           [
//             {
//               text: "📤 Send Again",
//               callback_data: `send_again_${r._id}`, // MongoDB document id
//             },
//           ],
//         ],
//       },
//     });
//   }
// }
//   // -------- MY REQUESTS --------
//   if (data === "myRequests") {
//     const myRequests = await requestsCollection
//       .find({ telegramId: userId })
//       .toArray();

//     if (!myRequests.length)
//       return bot.sendMessage(chatId, "Sizning so‘rovingiz yo‘q ❌");

//     for (const r of myRequests) {
//       await bot.sendMessage(
//         chatId,
//         `
// 🚖 SO‘ROV

// 📍 ${r.direction}
// ⏰ ${r.time}
// 👥 ${r.peopleCount} TA JOY
// 🚕 ${r.car}
// 👤 ${r.name}
// 📞 ${r.phone}
// 👤 @${r.username}

// So‘rovni o‘chirish uchun:
// ✅ Tugma ustiga bosing
//       `,
//         {
//           reply_markup: {
//             inline_keyboard: [
//               [
//                 {
//                   text: "🗑️ O‘chirish",
//                   callback_data: `delete_${r._id}`,
//                 },
//               ],
//             ],
//           },
//         }
//       );
//     }
//   }
  if (data.startsWith("send_again_")) {
  const requestId = data.split("send_again_")[1]; // _id ni olamiz

  const request = await requestsCollection.findOne({ _id: new ObjectId(requestId) });
  if (!request) return bot.sendMessage(chatId, "❌ So‘rov topilmadi");

  let text = `
🚖 TAXI

📍 ${request.direction}
⏰ ${request.time}
👥 ${request.peopleCount} TA JOY BOR
🚕 ${request.car}
👤 ${request.name}
📞 ${request.phone}


👤 @${request.username}
`;

  if (request.post) text += "\n📦 POCHTA OLADI";
  if (request.female) text += "\n👩 SALONDA AYOL BOR";

  // Guruhga jo‘natish
  await bot.sendMessage(GROUP_ID, text);

  // Foydalanuvchiga xabar
  return bot.sendMessage(chatId, "✅ So‘rov guruhga qayta yuborildi!");
}
  // -------- DELETE MY REQUEST --------
  if (data.startsWith("delete_")) {
    const id = data.split("_")[1];
    await requestsCollection.deleteOne({ _id: new ObjectId(id), telegramId: userId });
    return bot.sendMessage(chatId, "✅ So‘rov o‘chirildi");
  }

  // -------- DIRECTION --------
  if (data.includes("far_besh") || data.includes("besh_far")) {
    if (!state) return;

    const direction =
      data.includes("far_besh")
        ? "Farg‘ona → Beshariq"
        : "Beshariq → Farg‘ona";

    if (state.type === "create") {
      await setState(userId, { ...state, direction, step: "time" });
      return bot.sendMessage(chatId, "Soatni kiriting (07:30):");
    }

    if (state.type === "find") {
      await setState(userId, { ...state, direction, step: "find_time" });
      return bot.sendMessage(chatId, "Qaysi soat?");
    }
  }

  // -------- POST --------
  if (data === "post_yes" || data === "post_no") {
    await setState(userId, {
      ...state,
      post: data === "post_yes",
      step: "female",
    });

    return bot.sendMessage(chatId, "Salonda ayol bormi?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Ha", callback_data: "female_yes" }],
          [{ text: "Yo‘q", callback_data: "female_no" }],
        ],
      },
    });
  }

  // -------- FEMALE --------
  if (data === "female_yes" || data === "female_no") {
    const updated = {
      ...state,
      female: data === "female_yes",
    };

    const user = await usersCollection.findOne({ telegramId: userId });

    let preview = `
🚖 TAXI

📍 ${updated.direction}
⏰ ${updated.time}
👥 ${updated.peopleCount} TA JOY
🚕 ${user.car}
👤 ${user.name}

📞 ${user.phone}


👤 @${username}
`;

    if (updated.post) preview += "\n📦 POCHTA OLADI";
    if (updated.female) preview += "\n👩 SALONDA AYOL BOR";

    await setState(userId, { ...updated, preview });

    return bot.sendMessage(chatId, preview + "\n\nJo‘nataymi?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Ha", callback_data: "confirm_yes" }],
          [{ text: "❌ Yo‘q", callback_data: "confirm_no" }],
        ],
      },
    });
  }

  // -------- CONFIRM --------
  if (data === "confirm_yes") {
    if (!state) return;

    const user = await usersCollection.findOne({ telegramId: userId });

    await requestsCollection.insertOne({
      telegramId: userId,
      name: user.name,
      username,
      phone: user.phone,
      car: user.car,
      direction: state.direction,
      time: state.time,
      post: state.post,
      female: state.female,
      peopleCount: state.peopleCount,
      createdAt: new Date(),
    });

    await bot.sendMessage(GROUP_ID, state.preview);
    await clearState(userId);

    return bot.sendMessage(chatId, "✅ Guruhga yuborildi!");
  }

  if (data === "confirm_no") {
    await clearState(userId);
    return bot.sendMessage(chatId, "❌ Bekor qilindi.");
  }

  bot.answerCallbackQuery(q.id);
});

// ================= MESSAGE =================
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const state = await getState(userId);
  if (!state) return;

  // ----- REGISTER -----
  if (state.step === "register_name") {
    await setState(userId, { ...state, name: msg.text, step: "register_phone" });
    return bot.sendMessage(chatId, "Telefon raqamingiz:");
  }

  if (state.step === "register_phone") {
    await setState(userId, { ...state, phone: msg.text, step: "register_car" });
    return bot.sendMessage(chatId, "Mashina rusumi:");
  }

  if (state.step === "register_car") {
    await usersCollection.updateOne(
      { telegramId: userId },
      {
        $set: {
          telegramId: userId,
          name: state.name,
          phone: state.phone,
          car: msg.text,
          username: msg.from.username || "No username",
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    await setState(userId, { step: "direction", type: "create" });

    bot.sendMessage(chatId, "Ro‘yxatdan o‘tdingiz ✅");
    return sendDirectionButtons(chatId, "create");
  }

  // ----- TIME -----
  if (state.step === "time") {
    await setState(userId, { ...state, time: msg.text, step: "people" });
    return bot.sendMessage(chatId, "Nechta joy bor?");
  }

  // ----- PEOPLE COUNT -----
  if (state.step === "people") {
    await setState(userId, { ...state, peopleCount: msg.text, step: "post" });

    return bot.sendMessage(chatId, "Pochta olasizmi?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Ha", callback_data: "post_yes" }],
          [{ text: "Yo‘q", callback_data: "post_no" }],
        ],
      },
    });
  }

  // ----- FIND TIME -----
  if (state.step === "find_time") {
    const results = await requestsCollection
      .find({
        direction: state.direction,
        time: msg.text,
      })
      .toArray();

    if (!results.length) {
      await clearState(userId);
      return bot.sendMessage(chatId, "❌ Mos taxi topilmadi");
    }

    for (const r of results) {
      let text = `
🚖 TOPILDI

📍 ${r.direction}
⏰ ${r.time}
👥 ${r.peopleCount} TA JOY
🚕 ${r.car}
👤 ${r.name}

📞 ${r.phone}

👤 @${r.username}
`;

      if (r.post) text += "\n📦 POCHTA OLADI";
      if (r.female) text += "\n👩 SALONDA AYOL BOR";

      await bot.sendMessage(chatId, text);
    }

    await clearState(userId);
  }
});

// ================= YO‘NALISH =================
function sendDirectionButtons(chatId, type) {
  bot.sendMessage(chatId, "Yo‘nalishni tanlang:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Farg‘ona → Beshariq", callback_data: `${type}_far_besh` },
        ],
        [
          { text: "Beshariq → Farg‘ona", callback_data: `${type}_besh_far` },
        ],
      ],
    },
  });
}











