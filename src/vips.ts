import * as fs from "fs";
import * as path from "path";
import { sendMessage } from "./message";
import { PlayerAugmented } from "../index";
import { room, toAug } from "../index";

interface VipPlayer {
  username: string;
  auth: string;
  addedAt: number; // timestamp when VIP was added
  expiresAt: number; // timestamp when VIP expires
  addedBy: string; // auth of admin who added VIP
  duration: number; // duration in days
  chatColor?: string; // hex color for chat (without #)
  chatStyle?: string; // text style: "bold", "italic", "small", "normal"
}

interface VipData {
  vips: VipPlayer[];
}

const VIP_FILE_PATH = path.join(process.cwd(), "vips.json");

// Initialize VIP data file if it doesn't exist
const initVipFile = (): VipData => {
  if (!fs.existsSync(VIP_FILE_PATH)) {
    const initialData: VipData = { vips: [] };
    fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  
  try {
    const data = fs.readFileSync(VIP_FILE_PATH, 'utf-8');
    const parsedData = JSON.parse(data) as VipData;
    
    // VIP verisi doğru formatda değilse düzelt
    if (!parsedData || !Array.isArray(parsedData.vips)) {
      console.warn("VIP dosyası bozuk, yeniden oluşturuluyor...");
      const initialData: VipData = { vips: [] };
      fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    
    return parsedData;
  } catch (error) {
    console.error("VIP dosyası okuma hatası:", error);
    const initialData: VipData = { vips: [] };
    fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
};

// Save VIP data to file
const saveVipData = (data: VipData): void => {
  try {
    // Veriyi kaydetmeden önce doğrula
    if (!data || !Array.isArray(data.vips)) {
      console.error("Geçersiz VIP verisi, kaydetme iptal edildi");
      return;
    }
    fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("VIP dosyası kaydetme hatası:", error);
  }
};

// Check if a player is VIP by auth
export const isPlayerVip = (auth: string): boolean => {
  try {
    const data = initVipFile();
    const now = Date.now();
    
    // Önce expired VIP'leri temizle
    cleanExpiredVips();
    
    const vip = data.vips.find(v => v.auth === auth && v.expiresAt > now);
    return !!vip;
  } catch (error) {
    console.error("VIP kontrol hatası:", error);
    return false;
  }
};

// Get VIP info for a player
export const getVipInfo = (auth: string): VipPlayer | null => {
  try {
    const data = initVipFile();
    const now = Date.now();
    
    const vip = data.vips.find(v => v.auth === auth && v.expiresAt > now);
    return vip || null;
  } catch (error) {
    console.error("VIP bilgi alma hatası:", error);
    return null;
  }
};

// Add VIP to a player
export const addVip = (username: string, auth: string, durationDays: number, addedByAuth: string): boolean => {
  try {
    const data = initVipFile();
    const now = Date.now();
    const expiresAt = now + (durationDays * 24 * 60 * 60 * 1000); // Convert days to milliseconds
    
    // Remove existing VIP if exists
    data.vips = data.vips.filter(v => v.auth !== auth);
    
    // Add new VIP
    const newVip: VipPlayer = {
      username,
      auth,
      addedAt: now,
      expiresAt,
      addedBy: addedByAuth,
      duration: durationDays
    };
    
    data.vips.push(newVip);
    saveVipData(data);
    
    console.log(`VIP eklendi: ${username} (${auth}) - ${durationDays} gün`);
    return true;
  } catch (error) {
    console.error("VIP ekleme hatası:", error);
    return false;
  }
};

// Remove VIP from a player
export const removeVip = (auth: string): boolean => {
  try {
    const data = initVipFile();
    const originalLength = data.vips.length;
    
    data.vips = data.vips.filter(v => v.auth !== auth);
    
    if (data.vips.length < originalLength) {
      saveVipData(data);
      console.log(`VIP kaldırıldı: ${auth}`);
      return true;
    }
    
    return false; // VIP not found
  } catch (error) {
    console.error("VIP kaldırma hatası:", error);
    return false;
  }
};

// Clean expired VIPs
export const cleanExpiredVips = (): number => {
  try {
    const data = initVipFile();
    
    // VIP verisi yoksa veya bozuksa 0 döndür
    if (!data || !Array.isArray(data.vips)) {
      console.warn("VIP verisi bulunamadı veya bozuk");
      return 0;
    }
    
    const now = Date.now();
    const originalLength = data.vips.length;
    
    data.vips = data.vips.filter(v => v.expiresAt > now);
    
    const removedCount = originalLength - data.vips.length;
    
    if (removedCount > 0) {
      saveVipData(data);
      console.log(`${removedCount} süresi dolmuş VIP temizlendi`);
    }
    
    return removedCount;
  } catch (error) {
    console.error("VIP temizleme hatası:", error);
    return 0;
  }
};

// Get all active VIPs
export const getAllVips = (): VipPlayer[] => {
  try {
    const data = initVipFile();
    const now = Date.now();
    
    // Clean expired VIPs first
    cleanExpiredVips();
    
    return data.vips.filter(v => v.expiresAt > now);
  } catch (error) {
    console.error("VIP listesi alma hatası:", error);
    return [];
  }
};

// Get remaining VIP time in days
export const getVipRemainingDays = (auth: string): number => {
  try {
    const vip = getVipInfo(auth);
    if (!vip) return 0;
    
    const now = Date.now();
    const remainingMs = vip.expiresAt - now;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  } catch (error) {
    console.error("VIP kalan süre hesaplama hatası:", error);
    return 0;
  }
};

// Handle VIP add command
export const handleVipAdd = (admin: PlayerAugmented, args: string[]): void => {
  if (args.length < 2) {
    sendMessage("Kullanım: !vipekle <id> <süre(gün)>", admin);
    return;
  }
  
  const playerId = parseInt(args[0]);
  const duration = parseInt(args[1]);
  
  // ID validation
  if (isNaN(playerId)) {
    sendMessage("Geçersiz oyuncu ID'si. Sayı girin.", admin);
    return;
  }
  
  // Duration validation
  if (isNaN(duration) || duration <= 0) {
    sendMessage("Geçersiz süre. Pozitif bir sayı girin.", admin);
    return;
  }
  
  if (duration > 365) {
    sendMessage("Maksimum VIP süresi 365 gündür.", admin);
    return;
  }
  
  // Find player by ID
  const targetPlayer = room.getPlayer(playerId);
  if (!targetPlayer) {
    sendMessage(`ID ${playerId} ile oyuncu bulunamadı. Oyuncu odada olmalı.`, admin);
    return;
  }
  
  // Get PlayerAugmented version for auth access
  let targetPlayerAug: PlayerAugmented;
  try {
    targetPlayerAug = toAug(targetPlayer);
  } catch (error) {
    sendMessage("Oyuncu bilgileri alınamadı.", admin);
    return;
  }
  
  // Auth validation
  if (!targetPlayerAug.auth || targetPlayerAug.auth.length < 10) {
    sendMessage("Oyuncunun geçersiz auth bilgisi. Auth en az 10 karakter olmalıdır.", admin);
    return;
  }
  
  // Extract real username (remove [#ID] format if exists)
  const extractRealUsername = (formattedName: string): string => {
    const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
    return match ? match[1] : formattedName;
  };
  
  const realUsername = extractRealUsername(targetPlayerAug.name);
  
  // Add VIP
  const success = addVip(realUsername, targetPlayerAug.auth, duration, admin.auth);
  
  if (success) {
    sendMessage(`✅ ${realUsername} (ID: ${playerId}) oyuncusuna ${duration} gün VIP verildi!`, admin);
    sendMessage(`🌟 VIP eklendi: ${realUsername} - ${duration} gün`);
    
    // Send message to the VIP player
    sendMessage(`🌟 Tebrikler! ${duration} gün VIP oldunuz! Özel komutlar: !viprenk`, targetPlayerAug);
  } else {
    sendMessage("❌ VIP eklenirken hata oluştu.", admin);
  }
};

// Handle VIP remove command
export const handleVipRemove = (admin: PlayerAugmented, args: string[]): void => {
  if (args.length < 2) {
    sendMessage("Kullanım: !vipsil <username> <auth>", admin);
    return;
  }
  
  const username = args[0];
  const auth = args[1];
  
  // Check if player is VIP
  if (!isPlayerVip(auth)) {
    sendMessage(`❌ ${username} zaten VIP değil.`, admin);
    return;
  }
  
  const success = removeVip(auth);
  
  if (success) {
    sendMessage(`✅ ${username} oyuncusunun VIP'liği kaldırıldı!`, admin);
    sendMessage(`🚫 VIP kaldırıldı: ${username}`);
  } else {
    sendMessage("❌ VIP kaldırılırken hata oluştu.", admin);
  }
};

// Handle VIP list command  
export const handleVipList = (admin: PlayerAugmented): void => {
  const vips = getAllVips();
  
  if (vips.length === 0) {
    sendMessage("📝 Aktif VIP bulunmuyor.", admin);
    return;
  }
  
  sendMessage(`📝 Aktif VIP'ler (${vips.length} kişi):`, admin);
  
  vips.forEach((vip, index) => {
    const remainingDays = getVipRemainingDays(vip.auth);
    const addedDate = new Date(vip.addedAt).toLocaleDateString('tr-TR');
    
    sendMessage(
      `${index + 1}. ${vip.username} - ${remainingDays} gün kaldı (${addedDate} tarihinde eklendi)`,
      admin
    );
  });
};

// Handle VIP check command
export const handleVipCheck = (admin: PlayerAugmented, args: string[]): void => {
  if (args.length < 1) {
    sendMessage("Kullanım: !vipkontrol <auth>", admin);
    return;
  }
  
  const auth = args[0];
  const vip = getVipInfo(auth);
  
  if (!vip) {
    sendMessage(`❌ Bu auth'a sahip aktif VIP bulunamadı: ${auth}`, admin);
    return;
  }
  
  const remainingDays = getVipRemainingDays(auth);
  const addedDate = new Date(vip.addedAt).toLocaleDateString('tr-TR');
  const expiresDate = new Date(vip.expiresAt).toLocaleDateString('tr-TR');
  
  sendMessage(`🌟 VIP Bilgileri:`, admin);
  sendMessage(`👤 Kullanıcı: ${vip.username}`, admin);
  sendMessage(`🔑 Auth: ${vip.auth}`, admin);
  sendMessage(`📅 Ekleme Tarihi: ${addedDate}`, admin);
  sendMessage(`⏰ Bitiş Tarihi: ${expiresDate}`, admin);
  sendMessage(`⏳ Kalan Süre: ${remainingDays} gün`, admin);
  sendMessage(`👮 Ekleyen: ${vip.addedBy}`, admin);
};

// Initialize VIP system
export const initVipSystem = (): void => {
  console.log("VIP sistemi başlatılıyor...");
  
  try {
    initVipFile();
    
    // Clean expired VIPs on startup
    const cleaned = cleanExpiredVips();
    if (cleaned > 0) {
      console.log(`Başlangıçta ${cleaned} süresi dolmuş VIP temizlendi`);
    }
    
    console.log("VIP sistemi başarıyla başlatıldı");
  } catch (error) {
    console.error("VIP sistemi başlatma hatası:", error);
  }
};

// Get VIP chat color for a player
export const getVipChatColor = (auth: string): string | null => {
  try {
    const vip = getVipInfo(auth);
    return vip?.chatColor || null;
  } catch (error) {
    console.error("VIP renk alma hatası:", error);
    return null;
  }
};

// Set VIP chat color
export const setVipChatColor = (auth: string, color: string): boolean => {
  try {
    const data = initVipFile();
    const vip = data.vips.find(v => v.auth === auth);
    
    if (!vip) {
      return false; // Not a VIP
    }
    
    vip.chatColor = color;
    saveVipData(data);
    return true;
  } catch (error) {
    console.error("VIP renk ayarlama hatası:", error);
    return false;
  }
};

// Predefined VIP colors
export const vipColors = {
  'sarı': 'FFFF00',
  'sari': 'FFFF00',
  'kırmızı': 'FF4040', 
  'kirmizi': 'FF4040',
  'mavi': '12C4FF',
  'yeşil': '00FF00',
  'yesil': '00FF00',
  'pembe': 'FFC0CB',
  'mor': '800080'
};

// Get available color names
export const getAvailableColors = (): string[] => {
  return ['sarı', 'kırmızı', 'mavi', 'yeşil', 'pembe', 'mor'];
};

// Validate color name
export const isValidColorName = (colorName: string): boolean => {
  return colorName.toLowerCase() in vipColors;
};

// Get hex code from color name
export const getHexFromColorName = (colorName: string): string | null => {
  const lowerColorName = colorName.toLowerCase();
  return vipColors[lowerColorName as keyof typeof vipColors] || null;
};

// Predefined VIP text styles
export const vipStyles = {
  'bold': 'bold',
  'italic': 'italic', 
  'küçük': 'small',
  'kucuk': 'small',
  'small': 'small',
  'normal': 'normal'
};

// Get available style names
export const getAvailableStyles = (): string[] => {
  return ['bold', 'italic', 'küçük', 'normal'];
};

// Validate style name
export const isValidStyleName = (styleName: string): boolean => {
  return styleName.toLowerCase() in vipStyles;
};

// Get VIP chat style for a player
export const getVipChatStyle = (auth: string): string | null => {
  try {
    const vip = getVipInfo(auth);
    return vip?.chatStyle || 'normal';
  } catch (error) {
    console.error("VIP stil alma hatası:", error);
    return 'normal';
  }
};

// Set VIP chat style
export const setVipChatStyle = (auth: string, style: string): boolean => {
  try {
    const data = initVipFile();
    const vip = data.vips.find(v => v.auth === auth);
    
    if (!vip) {
      return false; // Not a VIP
    }
    
    vip.chatStyle = style;
    saveVipData(data);
    return true;
  } catch (error) {
    console.error("VIP stil ayarlama hatası:", error);
    return false;
  }
};

// Handle VIP color command
export const handleVipColor = (player: PlayerAugmented, args: string[]): void => {
  // Check if player is VIP
  if (!isPlayerVip(player.auth)) {
    sendMessage("❌ Bu komutu sadece VIP'ler kullanabilir.", player);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !viprenk <renk_adı>", player);
    sendMessage("🎨 Mevcut renkler: sarı, kırmızı, mavi, yeşil, pembe, mor", player);
    sendMessage("Örnek: !viprenk kırmızı", player);
    return;
  }
  
  const colorName = args[0].toLowerCase();
  
  if (!isValidColorName(colorName)) {
    sendMessage("❌ Geçersiz renk adı!", player);
    sendMessage("🎨 Mevcut renkler: sarı, kırmızı, mavi, yeşil, pembe, mor", player);
    sendMessage("Örnek: !viprenk kırmızı", player);
    return;
  }
  
  const hexColor = getHexFromColorName(colorName);
  if (!hexColor) {
    sendMessage("❌ Renk kodu alınamadı.", player);
    return;
  }
  
  const success = setVipChatColor(player.auth, hexColor);
  
  if (success) {
    // Get the display name (with Turkish characters if available)
    const displayName = getAvailableColors().find(color => 
      color.toLowerCase() === colorName || 
      color.toLowerCase().replace(/[ıİğĞüÜşŞöÖçÇ]/g, m => ({
        'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
      }[m] || m)) === colorName
    ) || colorName;
    
    sendMessage(`✅ VIP chat renginiz "${displayName}" olarak ayarlandı!`, player);
    sendMessage(`🌈 Yeni renginizi görmek için bir mesaj yazın.`, player);
  } else {
    sendMessage("❌ Renk ayarlanırken hata oluştu.", player);
  }
};

// Handle VIP style command
export const handleVipStyle = (player: PlayerAugmented, args: string[]): void => {
  // Check if player is VIP
  if (!isPlayerVip(player.auth)) {
    sendMessage("❌ Bu komutu sadece VIP'ler kullanabilir.", player);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !vipstil <stil_adı>", player);
    sendMessage("✨ Mevcut stiller: bold, italic, küçük, normal", player);
    sendMessage("Örnek: !vipstil bold", player);
    return;
  }
  
  const styleName = args[0].toLowerCase();
  
  if (!isValidStyleName(styleName)) {
    sendMessage("❌ Geçersiz stil adı!", player);
    sendMessage("✨ Mevcut stiller: bold, italic, küçük, normal", player);
    sendMessage("Örnek: !vipstil bold", player);
    return;
  }
  
  const actualStyle = vipStyles[styleName as keyof typeof vipStyles];
  const success = setVipChatStyle(player.auth, actualStyle);
  
  if (success) {
    // Get the display name for the style
    const displayName = getAvailableStyles().find(style => 
      style.toLowerCase() === styleName || 
      style.toLowerCase().replace(/[ıİğĞüÜşŞöÖçÇ]/g, m => ({
        'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
      }[m] || m)) === styleName
    ) || styleName;
    
    sendMessage(`✅ VIP chat stiliniz "${displayName}" olarak ayarlandı!`, player);
    sendMessage(`✨ Yeni stilinizi görmek için bir mesaj yazın.`, player);
  } else {
    sendMessage("❌ Stil ayarlanırken hata oluştu.", player);
  }
};

// Auto-clean expired VIPs periodically (call this from game tick or similar)
let lastCleanTime = 0;
export const autoCleanVips = (): void => {
  const now = Date.now();
  // Clean every hour (3600000 ms)
  if (now - lastCleanTime > 3600000) {
    cleanExpiredVips();
    lastCleanTime = now;
  }
};