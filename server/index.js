require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

let cellsInMemory = {};

// تحميل البيانات
async function loadMapFromDB() {
  const { data, error } = await supabase.from("cells").select("*");
  if (error) {
    console.error("Error loading map:", error);
  } else {
    cellsInMemory = {};
    data.forEach((cell) => {
      cellsInMemory[`${cell.x}-${cell.y}`] = cell;
    });
    console.log(`Loaded ${data.length} cells.`);
  }
}
loadMapFromDB();

// التنظيف التلقائي
setInterval(async () => {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('cells')
    .delete()
    .lt('expires_at', now) 
    .select();

  if (data && data.length > 0) {
    data.forEach(cell => {
      const key = `${cell.x}-${cell.y}`;
      delete cellsInMemory[key]; 
      io.emit('delete_cell', { x: cell.x, y: cell.y }); 
    });
  }
}, 60 * 1000); 

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);
  socket.emit("load_map", cellsInMemory);

  // === حجز مربع جديد ===
  socket.on("occupy_cell", async (data) => {
    // نستلم userId من الفرونت
    const { x, y, text, userId } = data;
    const key = `${x}-${y}`;

    if (!cellsInMemory[key]) {
      const expireDate = new Date();
      expireDate.setHours(expireDate.getHours() + 1); // ساعة واحدة

      const newCell = {
        x, y,
        text: text || "?",
        // حذفنا الـ color العشوائي
        owner: userId, // صاحب المربع
        likes: 0,
        liked_by: [], // قائمة لتخزين من قام باللايك
        expires_at: expireDate.toISOString()
      };

      cellsInMemory[key] = newCell;
      io.emit("update_cell", newCell);

      const { error } = await supabase
        .from("cells")
        .insert([newCell]);

      if (error) console.error("Error saving to DB:", error);
    }
  });

  // === استقبال اللايكات (الذكي) ===
  socket.on("like_cell", async ({ x, y, userId }) => {
    const key = `${x}-${y}`;
    const cell = cellsInMemory[key];

    // الشرط: المربع موجود + المستخدم لم يقم باللايك سابقاً
    if (cell && (!cell.liked_by || !cell.liked_by.includes(userId))) {
      
      // 1. التحديث
      cell.likes = (cell.likes || 0) + 1;
      
      if (!cell.liked_by) cell.liked_by = [];
      cell.liked_by.push(userId); // تسجيل اسم المستخدم

      // 2. تمديد الوقت (30 دقيقة)
      const currentExpire = new Date(cell.expires_at);
      currentExpire.setMinutes(currentExpire.getMinutes() + 5);
      cell.expires_at = currentExpire.toISOString();

      // 3. النشر
      io.emit("update_cell", cell);

      // 4. الحفظ
      await supabase
        .from("cells")
        .update({ 
            likes: cell.likes, 
            expires_at: cell.expires_at,
            liked_by: cell.liked_by 
        })
        .match({ x, y });
    }
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});