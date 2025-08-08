"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoCleanVips = exports.handleVipStyle = exports.handleVipColor = exports.setVipChatStyle = exports.getVipChatStyle = exports.isValidStyleName = exports.getAvailableStyles = exports.vipStyles = exports.getHexFromColorName = exports.isValidColorName = exports.getAvailableColors = exports.vipColors = exports.setVipChatColor = exports.getVipChatColor = exports.initVipSystem = exports.handleVipCheck = exports.handleVipList = exports.handleVipRemove = exports.handleVipAdd = exports.getVipRemainingDays = exports.getAllVips = exports.cleanExpiredVips = exports.removeVip = exports.addVip = exports.getVipInfo = exports.isPlayerVip = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const message_1 = require("./message");
const index_1 = require("../index");
const VIP_FILE_PATH = path.join(process.cwd(), "vips.json");
// Initialize VIP data file if it doesn't exist
const initVipFile = () => {
    if (!fs.existsSync(VIP_FILE_PATH)) {
        const initialData = { vips: [] };
        fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    try {
        const data = fs.readFileSync(VIP_FILE_PATH, 'utf-8');
        const parsedData = JSON.parse(data);
        // VIP verisi doğru formatda değilse düzelt
        if (!parsedData || !Array.isArray(parsedData.vips)) {
            console.warn("VIP dosyası bozuk, yeniden oluşturuluyor...");
            const initialData = { vips: [] };
            fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        return parsedData;
    }
    catch (error) {
        console.error("VIP dosyası okuma hatası:", error);
        const initialData = { vips: [] };
        fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
};
// Save VIP data to file
const saveVipData = (data) => {
    try {
        // Veriyi kaydetmeden önce doğrula
        if (!data || !Array.isArray(data.vips)) {
            console.error("Geçersiz VIP verisi, kaydetme iptal edildi");
            return;
        }
        fs.writeFileSync(VIP_FILE_PATH, JSON.stringify(data, null, 2));
    }
    catch (error) {
        console.error("VIP dosyası kaydetme hatası:", error);
    }
};
// Check if a player is VIP by auth
const isPlayerVip = (auth) => {
    try {
        const data = initVipFile();
        const now = Date.now();
        // Önce expired VIP'leri temizle
        (0, exports.cleanExpiredVips)();
        const vip = data.vips.find(v => v.auth === auth && v.expiresAt > now);
        return !!vip;
    }
    catch (error) {
        console.error("VIP kontrol hatası:", error);
        return false;
    }
};
exports.isPlayerVip = isPlayerVip;
// Get VIP info for a player
const getVipInfo = (auth) => {
    try {
        const data = initVipFile();
        const now = Date.now();
        const vip = data.vips.find(v => v.auth === auth && v.expiresAt > now);
        return vip || null;
    }
    catch (error) {
        console.error("VIP bilgi alma hatası:", error);
        return null;
    }
};
exports.getVipInfo = getVipInfo;
// Add VIP to a player
const addVip = (username, auth, durationDays, addedByAuth) => {
    try {
        const data = initVipFile();
        const now = Date.now();
        const expiresAt = now + (durationDays * 24 * 60 * 60 * 1000); // Convert days to milliseconds
        // Remove existing VIP if exists
        data.vips = data.vips.filter(v => v.auth !== auth);
        // Add new VIP
        const newVip = {
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
    }
    catch (error) {
        console.error("VIP ekleme hatası:", error);
        return false;
    }
};
exports.addVip = addVip;
// Remove VIP from a player
const removeVip = (auth) => {
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
    }
    catch (error) {
        console.error("VIP kaldırma hatası:", error);
        return false;
    }
};
exports.removeVip = removeVip;
// Clean expired VIPs
const cleanExpiredVips = () => {
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
    }
    catch (error) {
        console.error("VIP temizleme hatası:", error);
        return 0;
    }
};
exports.cleanExpiredVips = cleanExpiredVips;
// Get all active VIPs
const getAllVips = () => {
    try {
        const data = initVipFile();
        const now = Date.now();
        // Clean expired VIPs first
        (0, exports.cleanExpiredVips)();
        return data.vips.filter(v => v.expiresAt > now);
    }
    catch (error) {
        console.error("VIP listesi alma hatası:", error);
        return [];
    }
};
exports.getAllVips = getAllVips;
// Get remaining VIP time in days
const getVipRemainingDays = (auth) => {
    try {
        const vip = (0, exports.getVipInfo)(auth);
        if (!vip)
            return 0;
        const now = Date.now();
        const remainingMs = vip.expiresAt - now;
        return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    }
    catch (error) {
        console.error("VIP kalan süre hesaplama hatası:", error);
        return 0;
    }
};
exports.getVipRemainingDays = getVipRemainingDays;
// Handle VIP add command
const handleVipAdd = (admin, args) => {
    if (args.length < 2) {
        (0, message_1.sendMessage)("Kullanım: !vipekle <id> <süre(gün)>", admin);
        return;
    }
    const playerId = parseInt(args[0]);
    const duration = parseInt(args[1]);
    // ID validation
    if (isNaN(playerId)) {
        (0, message_1.sendMessage)("Geçersiz oyuncu ID'si. Sayı girin.", admin);
        return;
    }
    // Duration validation
    if (isNaN(duration) || duration <= 0) {
        (0, message_1.sendMessage)("Geçersiz süre. Pozitif bir sayı girin.", admin);
        return;
    }
    if (duration > 365) {
        (0, message_1.sendMessage)("Maksimum VIP süresi 365 gündür.", admin);
        return;
    }
    // Find player by ID
    const targetPlayer = index_1.room.getPlayer(playerId);
    if (!targetPlayer) {
        (0, message_1.sendMessage)(`ID ${playerId} ile oyuncu bulunamadı. Oyuncu odada olmalı.`, admin);
        return;
    }
    // Get PlayerAugmented version for auth access
    let targetPlayerAug;
    try {
        targetPlayerAug = (0, index_1.toAug)(targetPlayer);
    }
    catch (error) {
        (0, message_1.sendMessage)("Oyuncu bilgileri alınamadı.", admin);
        return;
    }
    // Auth validation
    if (!targetPlayerAug.auth || targetPlayerAug.auth.length < 10) {
        (0, message_1.sendMessage)("Oyuncunun geçersiz auth bilgisi. Auth en az 10 karakter olmalıdır.", admin);
        return;
    }
    // Extract real username (remove [#ID] format if exists)
    const extractRealUsername = (formattedName) => {
        const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
        return match ? match[1] : formattedName;
    };
    const realUsername = extractRealUsername(targetPlayerAug.name);
    // Add VIP
    const success = (0, exports.addVip)(realUsername, targetPlayerAug.auth, duration, admin.auth);
    if (success) {
        (0, message_1.sendMessage)(`✅ ${realUsername} (ID: ${playerId}) oyuncusuna ${duration} gün VIP verildi!`, admin);
        (0, message_1.sendMessage)(`🌟 VIP eklendi: ${realUsername} - ${duration} gün`);
        // Send message to the VIP player
        (0, message_1.sendMessage)(`🌟 Tebrikler! ${duration} gün VIP oldunuz! Özel komutlar: !viprenk`, targetPlayerAug);
    }
    else {
        (0, message_1.sendMessage)("❌ VIP eklenirken hata oluştu.", admin);
    }
};
exports.handleVipAdd = handleVipAdd;
// Handle VIP remove command
const handleVipRemove = (admin, args) => {
    if (args.length < 2) {
        (0, message_1.sendMessage)("Kullanım: !vipsil <username> <auth>", admin);
        return;
    }
    const username = args[0];
    const auth = args[1];
    // Check if player is VIP
    if (!(0, exports.isPlayerVip)(auth)) {
        (0, message_1.sendMessage)(`❌ ${username} zaten VIP değil.`, admin);
        return;
    }
    const success = (0, exports.removeVip)(auth);
    if (success) {
        (0, message_1.sendMessage)(`✅ ${username} oyuncusunun VIP'liği kaldırıldı!`, admin);
        (0, message_1.sendMessage)(`🚫 VIP kaldırıldı: ${username}`);
    }
    else {
        (0, message_1.sendMessage)("❌ VIP kaldırılırken hata oluştu.", admin);
    }
};
exports.handleVipRemove = handleVipRemove;
// Handle VIP list command  
const handleVipList = (admin) => {
    const vips = (0, exports.getAllVips)();
    if (vips.length === 0) {
        (0, message_1.sendMessage)("📝 Aktif VIP bulunmuyor.", admin);
        return;
    }
    (0, message_1.sendMessage)(`📝 Aktif VIP'ler (${vips.length} kişi):`, admin);
    vips.forEach((vip, index) => {
        const remainingDays = (0, exports.getVipRemainingDays)(vip.auth);
        const addedDate = new Date(vip.addedAt).toLocaleDateString('tr-TR');
        (0, message_1.sendMessage)(`${index + 1}. ${vip.username} - ${remainingDays} gün kaldı (${addedDate} tarihinde eklendi)`, admin);
    });
};
exports.handleVipList = handleVipList;
// Handle VIP check command
const handleVipCheck = (admin, args) => {
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !vipkontrol <auth>", admin);
        return;
    }
    const auth = args[0];
    const vip = (0, exports.getVipInfo)(auth);
    if (!vip) {
        (0, message_1.sendMessage)(`❌ Bu auth'a sahip aktif VIP bulunamadı: ${auth}`, admin);
        return;
    }
    const remainingDays = (0, exports.getVipRemainingDays)(auth);
    const addedDate = new Date(vip.addedAt).toLocaleDateString('tr-TR');
    const expiresDate = new Date(vip.expiresAt).toLocaleDateString('tr-TR');
    (0, message_1.sendMessage)(`🌟 VIP Bilgileri:`, admin);
    (0, message_1.sendMessage)(`👤 Kullanıcı: ${vip.username}`, admin);
    (0, message_1.sendMessage)(`🔑 Auth: ${vip.auth}`, admin);
    (0, message_1.sendMessage)(`📅 Ekleme Tarihi: ${addedDate}`, admin);
    (0, message_1.sendMessage)(`⏰ Bitiş Tarihi: ${expiresDate}`, admin);
    (0, message_1.sendMessage)(`⏳ Kalan Süre: ${remainingDays} gün`, admin);
    (0, message_1.sendMessage)(`👮 Ekleyen: ${vip.addedBy}`, admin);
};
exports.handleVipCheck = handleVipCheck;
// Initialize VIP system
const initVipSystem = () => {
    console.log("VIP sistemi başlatılıyor...");
    try {
        initVipFile();
        // Clean expired VIPs on startup
        const cleaned = (0, exports.cleanExpiredVips)();
        if (cleaned > 0) {
            console.log(`Başlangıçta ${cleaned} süresi dolmuş VIP temizlendi`);
        }
        console.log("VIP sistemi başarıyla başlatıldı");
    }
    catch (error) {
        console.error("VIP sistemi başlatma hatası:", error);
    }
};
exports.initVipSystem = initVipSystem;
// Get VIP chat color for a player
const getVipChatColor = (auth) => {
    try {
        const vip = (0, exports.getVipInfo)(auth);
        return (vip === null || vip === void 0 ? void 0 : vip.chatColor) || null;
    }
    catch (error) {
        console.error("VIP renk alma hatası:", error);
        return null;
    }
};
exports.getVipChatColor = getVipChatColor;
// Set VIP chat color
const setVipChatColor = (auth, color) => {
    try {
        const data = initVipFile();
        const vip = data.vips.find(v => v.auth === auth);
        if (!vip) {
            return false; // Not a VIP
        }
        vip.chatColor = color;
        saveVipData(data);
        return true;
    }
    catch (error) {
        console.error("VIP renk ayarlama hatası:", error);
        return false;
    }
};
exports.setVipChatColor = setVipChatColor;
// Predefined VIP colors
exports.vipColors = {
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
const getAvailableColors = () => {
    return ['sarı', 'kırmızı', 'mavi', 'yeşil', 'pembe', 'mor'];
};
exports.getAvailableColors = getAvailableColors;
// Validate color name
const isValidColorName = (colorName) => {
    return colorName.toLowerCase() in exports.vipColors;
};
exports.isValidColorName = isValidColorName;
// Get hex code from color name
const getHexFromColorName = (colorName) => {
    const lowerColorName = colorName.toLowerCase();
    return exports.vipColors[lowerColorName] || null;
};
exports.getHexFromColorName = getHexFromColorName;
// Predefined VIP text styles
exports.vipStyles = {
    'bold': 'bold',
    'italic': 'italic',
    'küçük': 'small',
    'kucuk': 'small',
    'small': 'small',
    'normal': 'normal'
};
// Get available style names
const getAvailableStyles = () => {
    return ['bold', 'italic', 'küçük', 'normal'];
};
exports.getAvailableStyles = getAvailableStyles;
// Validate style name
const isValidStyleName = (styleName) => {
    return styleName.toLowerCase() in exports.vipStyles;
};
exports.isValidStyleName = isValidStyleName;
// Get VIP chat style for a player
const getVipChatStyle = (auth) => {
    try {
        const vip = (0, exports.getVipInfo)(auth);
        return (vip === null || vip === void 0 ? void 0 : vip.chatStyle) || 'normal';
    }
    catch (error) {
        console.error("VIP stil alma hatası:", error);
        return 'normal';
    }
};
exports.getVipChatStyle = getVipChatStyle;
// Set VIP chat style
const setVipChatStyle = (auth, style) => {
    try {
        const data = initVipFile();
        const vip = data.vips.find(v => v.auth === auth);
        if (!vip) {
            return false; // Not a VIP
        }
        vip.chatStyle = style;
        saveVipData(data);
        return true;
    }
    catch (error) {
        console.error("VIP stil ayarlama hatası:", error);
        return false;
    }
};
exports.setVipChatStyle = setVipChatStyle;
// Handle VIP color command
const handleVipColor = (player, args) => {
    // Check if player is VIP
    if (!(0, exports.isPlayerVip)(player.auth)) {
        (0, message_1.sendMessage)("❌ Bu komutu sadece VIP'ler kullanabilir.", player);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !viprenk <renk_adı>", player);
        (0, message_1.sendMessage)("🎨 Mevcut renkler: sarı, kırmızı, mavi, yeşil, pembe, mor", player);
        (0, message_1.sendMessage)("Örnek: !viprenk kırmızı", player);
        return;
    }
    const colorName = args[0].toLowerCase();
    if (!(0, exports.isValidColorName)(colorName)) {
        (0, message_1.sendMessage)("❌ Geçersiz renk adı!", player);
        (0, message_1.sendMessage)("🎨 Mevcut renkler: sarı, kırmızı, mavi, yeşil, pembe, mor", player);
        (0, message_1.sendMessage)("Örnek: !viprenk kırmızı", player);
        return;
    }
    const hexColor = (0, exports.getHexFromColorName)(colorName);
    if (!hexColor) {
        (0, message_1.sendMessage)("❌ Renk kodu alınamadı.", player);
        return;
    }
    const success = (0, exports.setVipChatColor)(player.auth, hexColor);
    if (success) {
        // Get the display name (with Turkish characters if available)
        const displayName = (0, exports.getAvailableColors)().find(color => color.toLowerCase() === colorName ||
            color.toLowerCase().replace(/[ıİğĞüÜşŞöÖçÇ]/g, m => ({
                'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
                'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
            }[m] || m)) === colorName) || colorName;
        (0, message_1.sendMessage)(`✅ VIP chat renginiz "${displayName}" olarak ayarlandı!`, player);
        (0, message_1.sendMessage)(`🌈 Yeni renginizi görmek için bir mesaj yazın.`, player);
    }
    else {
        (0, message_1.sendMessage)("❌ Renk ayarlanırken hata oluştu.", player);
    }
};
exports.handleVipColor = handleVipColor;
// Handle VIP style command
const handleVipStyle = (player, args) => {
    // Check if player is VIP
    if (!(0, exports.isPlayerVip)(player.auth)) {
        (0, message_1.sendMessage)("❌ Bu komutu sadece VIP'ler kullanabilir.", player);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !vipstil <stil_adı>", player);
        (0, message_1.sendMessage)("✨ Mevcut stiller: bold, italic, küçük, normal", player);
        (0, message_1.sendMessage)("Örnek: !vipstil bold", player);
        return;
    }
    const styleName = args[0].toLowerCase();
    if (!(0, exports.isValidStyleName)(styleName)) {
        (0, message_1.sendMessage)("❌ Geçersiz stil adı!", player);
        (0, message_1.sendMessage)("✨ Mevcut stiller: bold, italic, küçük, normal", player);
        (0, message_1.sendMessage)("Örnek: !vipstil bold", player);
        return;
    }
    const actualStyle = exports.vipStyles[styleName];
    const success = (0, exports.setVipChatStyle)(player.auth, actualStyle);
    if (success) {
        // Get the display name for the style
        const displayName = (0, exports.getAvailableStyles)().find(style => style.toLowerCase() === styleName ||
            style.toLowerCase().replace(/[ıİğĞüÜşŞöÖçÇ]/g, m => ({
                'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
                'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
            }[m] || m)) === styleName) || styleName;
        (0, message_1.sendMessage)(`✅ VIP chat stiliniz "${displayName}" olarak ayarlandı!`, player);
        (0, message_1.sendMessage)(`✨ Yeni stilinizi görmek için bir mesaj yazın.`, player);
    }
    else {
        (0, message_1.sendMessage)("❌ Stil ayarlanırken hata oluştu.", player);
    }
};
exports.handleVipStyle = handleVipStyle;
// Auto-clean expired VIPs periodically (call this from game tick or similar)
let lastCleanTime = 0;
const autoCleanVips = () => {
    const now = Date.now();
    // Clean every hour (3600000 ms)
    if (now - lastCleanTime > 3600000) {
        (0, exports.cleanExpiredVips)();
        lastCleanTime = now;
    }
};
exports.autoCleanVips = autoCleanVips;
