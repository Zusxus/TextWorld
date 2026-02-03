"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import MapCanvas from "./components/MapCanvas"; // <--- استدعاء الملف الجديد

const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

export default function Home() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);

    newSocket.on("connect", () => {
      console.log("✅ Connected!");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("❌ Disconnected");
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-10">
      <h1 className="text-4xl font-bold mb-2">عقار النصوص الرقمي</h1>
      
      {/* شريط الحالة */}
      <div className={`mb-6 px-3 py-1 rounded-full text-sm border ${isConnected ? "border-green-500 text-green-400 bg-green-900/20" : "border-red-500 text-red-400"}`}>
          {isConnected ? "● System Online" : "○ Connecting..."}
      </div>

      {/* استدعاء الخريطة */}
      <MapCanvas socket={socket} />
      
    </main>
  );
}