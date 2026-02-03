"use client";
import { useEffect, useRef, useState } from "react";

export default function MapCanvas({ socket }) {
  const canvasRef = useRef(null);
  
  // === إعدادات ===
  const CELL_SIZE = 200; 
  const GRID_SIZE = 32;  
  const MAX_LIFE_MS = 60 * 60 * 1000; 
  
  // === الحالة (State) ===
  const [transform, setTransform] = useState({ x: -500, y: -500, k: 0.8 }); // نبدأ بزوم أبعد قليلاً للموبايل
  const [occupiedCells, setOccupiedCells] = useState({});
  const [hoveredCell, setHoveredCell] = useState({ x: -1, y: -1 });
  const [userId, setUserId] = useState(null);
  
  // متغيرات لحساب حركة اللمس (Touch)
  const touchRef = useRef({
    lastX: 0,
    lastY: 0,
    lastDist: 0,
    isDragging: false,
    isPinching: false
  });
  
  // === نافذة الحجز ===
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedCell, setSelectedCell] = useState(null);

  // === 1. إعداد المستخدم ===
  useEffect(() => {
    let storedId = localStorage.getItem("my_user_id");
    if (!storedId) {
        storedId = "user_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("my_user_id", storedId);
    }
    setUserId(storedId);
  }, []);

  // === 2. استقبال السوكيت ===
  useEffect(() => {
    if (!socket) return;
    socket.on("load_map", (serverCells) => setOccupiedCells(serverCells));
    socket.on("update_cell", (newCell) => {
      setOccupiedCells((prev) => ({ ...prev, [`${newCell.x}-${newCell.y}`]: newCell }));
    });
    socket.on("delete_cell", ({ x, y }) => {
      setOccupiedCells((prev) => {
        const newCells = { ...prev };
        delete newCells[`${x}-${y}`];
        return newCells;
      });
    });
    return () => {
      socket.off("load_map");
      socket.off("update_cell");
      socket.off("delete_cell");
    };
  }, [socket]);

  // === 3. معادلات الرسم واللون ===
  const getCellColor = (expiresAt) => {
    const now = new Date().getTime();
    const end = new Date(expiresAt).getTime();
    const remaining = end - now;
    let ratio = Math.max(0, Math.min(1, remaining / MAX_LIFE_MS));
    const r = Math.floor(220 + ratio * (200 - 220)); 
    const g = Math.floor(40 + ratio * (200 - 40));   
    const b = Math.floor(40 + ratio * (200 - 40));   
    return `rgb(${r}, ${g}, ${b})`;
  };

  const drawWrappedText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let lineArray = [];
    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) { lineArray.push(line); line = words[n] + ' '; }
      else { line = testLine; }
    }
    lineArray.push(line);
    let startY = y - ((lineArray.length - 1) * lineHeight) / 2;
    for(let k = 0; k < lineArray.length; k++) ctx.fillText(lineArray[k], x, startY + (k * lineHeight));
  };

  // === 4. حلقة الرسم ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const TOTAL_SIZE = GRID_SIZE * CELL_SIZE;
      
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, TOTAL_SIZE, TOTAL_SIZE);

      Object.values(occupiedCells).forEach((cell) => {
        ctx.fillStyle = getCellColor(cell.expires_at);
        ctx.fillRect(cell.x * CELL_SIZE, cell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        if (transform.k > 0.15) { // نزيد الحد قليلاً للموبايل ليصبح الأداء أفضل
             ctx.fillStyle = "#000";
             ctx.font = "bold 14px Tajawal, Arial"; 
             ctx.textAlign = "center";
             ctx.textBaseline = "middle";
             if (cell.text) drawWrappedText(ctx, cell.text, (cell.x * CELL_SIZE) + (CELL_SIZE / 2), (cell.y * CELL_SIZE) + (CELL_SIZE / 2), CELL_SIZE - 20, 20);
             if (cell.likes > 0) {
                ctx.font = "12px Arial";
                ctx.fillStyle = "#b71c1c";
                ctx.fillText(`❤️ ${cell.likes}`, (cell.x * CELL_SIZE) + (CELL_SIZE / 2), (cell.y * CELL_SIZE) + CELL_SIZE - 15);
             }
        }
      });

      if (transform.k > 0.3) {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1 / transform.k; 
        ctx.beginPath();
        for (let i = 0; i <= GRID_SIZE; i++) {
            ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, TOTAL_SIZE);
            ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(TOTAL_SIZE, i * CELL_SIZE);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 / transform.k;
      ctx.strokeRect(0, 0, TOTAL_SIZE, TOTAL_SIZE);

      // رسم Hover وتلميح الوقت
      if (hoveredCell.x >= 0 && hoveredCell.y >= 0) {
        const key = `${hoveredCell.x}-${hoveredCell.y}`;
        const cell = occupiedCells[key];

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 4 / transform.k;
        ctx.strokeRect(hoveredCell.x * CELL_SIZE, hoveredCell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        if (cell) {
            const now = new Date().getTime();
            const end = new Date(cell.expires_at).getTime();
            const diffMinutes = Math.max(0, Math.ceil((end - now) / 60000));
            
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
            const badgeW = 90 / transform.k; 
            const badgeH = 30 / transform.k;
            const badgeX = (cell.x * CELL_SIZE) + (CELL_SIZE/2) - (badgeW/2);
            const badgeY = (cell.y * CELL_SIZE) - (badgeH * 1.5); 
            
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${14 / transform.k}px Arial`;
            ctx.textAlign = "center";
            ctx.fillText(`⏳ ${diffMinutes} min`, badgeX + (badgeW/2), badgeY + (badgeH/2));
        }
      }

      ctx.restore();
    };

    let animationId;
    const renderLoop = () => {
        draw();
        animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => cancelAnimationFrame(animationId);
  }, [transform, occupiedCells, hoveredCell]); 

  // === 5. التحكم (MOUSE - للكمبيوتر) ===
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
        const newZoom = Math.min(Math.max(0.1, transform.k - e.deltaY * 0.003), 10);
        setTransform(prev => ({ ...prev, k: newZoom }));
    } else {
        setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - transform.x) / transform.k;
    const worldY = (e.clientY - rect.top - transform.y) / transform.k;
    const gridX = Math.floor(worldX / CELL_SIZE);
    const gridY = Math.floor(worldY / CELL_SIZE);

    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        setHoveredCell({ x: gridX, y: gridY });
    } else {
        setHoveredCell({ x: -1, y: -1 });
    }
  };

  // === 6. التحكم (TOUCH - للموبايل) ===
  const getTouchPos = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
      };
  };

  const getDistance = (touches) => {
      return Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY
      );
  };

  const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
          const pos = getTouchPos(e);
          touchRef.current.lastX = pos.x;
          touchRef.current.lastY = pos.y;
          touchRef.current.isDragging = true;
          
          // محاكاة الـ Hover للموبايل (عشان يشوف الوقت)
          const worldX = (pos.x - transform.x) / transform.k;
          const worldY = (pos.y - transform.y) / transform.k;
          const gridX = Math.floor(worldX / CELL_SIZE);
          const gridY = Math.floor(worldY / CELL_SIZE);
          if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
            setHoveredCell({ x: gridX, y: gridY });
          }

      } else if (e.touches.length === 2) {
          touchRef.current.isPinching = true;
          touchRef.current.lastDist = getDistance(e.touches);
      }
  };

  const handleTouchMove = (e) => {
      // منع السكرول الافتراضي للمتصفح
      e.preventDefault(); 

      if (touchRef.current.isDragging && e.touches.length === 1) {
          const pos = getTouchPos(e);
          const dx = pos.x - touchRef.current.lastX;
          const dy = pos.y - touchRef.current.lastY;
          
          setTransform(prev => ({
              ...prev,
              x: prev.x + dx,
              y: prev.y + dy
          }));
          
          touchRef.current.lastX = pos.x;
          touchRef.current.lastY = pos.y;

      } else if (touchRef.current.isPinching && e.touches.length === 2) {
          const dist = getDistance(e.touches);
          const delta = dist - touchRef.current.lastDist;
          
          // معادلة زوم بسيطة للموبايل
          const zoomSensitivity = 0.005;
          const newZoom = Math.min(Math.max(0.1, transform.k + delta * zoomSensitivity), 10);
          
          setTransform(prev => ({ ...prev, k: newZoom }));
          touchRef.current.lastDist = dist;
      }
  };

  const handleTouchEnd = () => {
      touchRef.current.isDragging = false;
      touchRef.current.isPinching = false;
  };

  // === 7. التفاعل (Double Click) ===
  const handleDoubleClick = () => {
    if (hoveredCell.x >= 0) {
        const key = `${hoveredCell.x}-${hoveredCell.y}`;
        if (occupiedCells[key]) {
            socket.emit("like_cell", { x: hoveredCell.x, y: hoveredCell.y, userId });
        } else {
            setSelectedCell(hoveredCell);
            setIsInputOpen(true);
        }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (socket && selectedCell && inputText && userId) {
      socket.emit("occupy_cell", { x: selectedCell.x, y: selectedCell.y, text: inputText, userId });
      setIsInputOpen(false);
      setInputText("");
    }
  };

  return (
    // أضفنا touch-none لمنع حركات المتصفح الافتراضية
    <div className="w-full h-screen bg-gray-900 overflow-hidden relative touch-none">
      <canvas
        ref={canvasRef}
        // Mouse Events
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredCell({ x: -1, y: -1 })}
        onDoubleClick={handleDoubleClick}
        // Touch Events (Mobile)
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        
        className="cursor-crosshair block" 
      />

      {/* تعليمات - جعلناها متجاوبة */}
      <div className="absolute top-4 left-4 bg-black/80 text-white p-3 md:p-4 rounded-xl pointer-events-none text-xs md:text-sm shadow-2xl border border-gray-700 backdrop-blur-sm max-w-[200px] md:max-w-xs">
        <p className="font-bold text-green-400 mb-2 border-b border-gray-600 pb-1">🎮 التحكم:</p>
        <ul className="space-y-1 text-gray-300">
            <li>• تحريك: سحب (اصبع واحد / ماوس)</li>
            <li>• زوم: قرصة (اصبعين) / عجلة</li>
            <li>• حجز: نقرتين (Double Tap/Click)</li>
            <li>• ❤️ لايك: نقرتين على مربع محجوز</li>
        </ul>
      </div>

      {/* نافذة الحجز - جعلناها متجاوبة */}
      {isInputOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-gray-800 p-5 rounded-xl border border-green-500 shadow-2xl w-full max-w-md transform scale-100 transition-all">
            <h3 className="text-white font-bold mb-4 text-lg border-b border-gray-700 pb-2 flex justify-between items-center">
                <span>حجز العقار</span>
                <span className="text-green-400 font-mono text-sm bg-green-900/30 px-2 py-1 rounded">
                    {selectedCell.x}, {selectedCell.y}
                </span>
            </h3>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <textarea 
                    maxLength="140"
                    placeholder="اكتب هنا..." 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    rows="4"
                    className="w-full p-4 rounded-lg bg-gray-900 text-white border border-gray-600 outline-none resize-none text-base"
                    autoFocus
                />
                <span className="absolute bottom-3 right-3 text-xs text-gray-500">{inputText.length}/140</span>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold text-lg active:scale-95 transition">✅ نشر</button>
                <button type="button" onClick={() => setIsInputOpen(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold active:scale-95 transition">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}   