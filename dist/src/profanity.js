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
exports.filterMessage = exports.filterName = exports.detectDiscordMentions = exports.detectAdvancedProfanity = exports.detectBasicProfanity = exports.detectShapedText = exports.detectLink = exports.detectProfanity = exports.kufurAlgila = exports.isSekilliYazi = exports.supheliKufurAlgila = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load bad words from kufurler.txt
let kufurler = [];
try {
    const kufurlerPath = path.join(__dirname, '..', 'kufurler.txt');
    const fileContent = fs.readFileSync(kufurlerPath, 'utf8');
    // Parse the content - extract the array from the file
    const match = fileContent.match(/\[([\s\S]*)\]/);
    if (match) {
        const arrayContent = match[1];
        kufurler = arrayContent
            .split(',')
            .map(word => word.trim().replace(/['"]/g, ''))
            .filter(word => word.length > 0);
    }
}
catch (error) {
    console.log('Küfür listesi yüklenemedi:', error);
    kufurler = []; // Fallback to empty array
}
const supheliKufurAlgila = (msg) => {
    if (!msg || msg.length < 2)
        return false;
    // Mesajı temizle
    let temizMsg = msg.toLowerCase();
    // Kelimelere ayır
    let kelimeler = temizMsg.split(/\s+/);
    // BOŞLUKLU KÜFÜR KONTROLÜ (örn: "a m k" gibi)
    // Tüm mesajdaki boşlukları kaldırıp küfür listesiyle karşılaştır
    let tumBosluksuz = temizMsg.replace(/\s/g, '');
    for (let kufur of kufurler) {
        let temizKufur = kufur.toLowerCase();
        if (tumBosluksuz === temizKufur) {
            return true;
        }
    }
    // Her kelimeyi kontrol et
    for (let kelime of kelimeler) {
        if (kelime.length < 2)
            continue;
        // Küfür listesindeki her kelimeyi kontrol et
        for (let kufur of kufurler) {
            let temizKufur = kufur.toLowerCase();
            // 1. TAM EŞLEŞME KONTROLÜ
            if (kelime === temizKufur) {
                return true;
            }
            // 2. SAYILAR İLE HARF DEĞİŞTİRME KONTROLÜ
            let sayisizKelime = kelime
                .replace(/4/g, 'a')
                .replace(/@/g, 'a')
                .replace(/3/g, 'e')
                .replace(/1/g, 'i')
                .replace(/!/g, 'i')
                .replace(/0/g, 'o')
                .replace(/5/g, 's')
                .replace(/\$/g, 's')
                .replace(/7/g, 't')
                .replace(/2/g, 'o')
                .replace(/6/g, 'g')
                .replace(/8/g, 'b')
                .replace(/9/g, 'g');
            if (sayisizKelime === temizKufur) {
                return true;
            }
            // 3. BOŞLUK KALDIRMA KONTROLÜ (kelime içindeki boşluklar)
            let bosluksuzKelime = kelime.replace(/\s/g, '');
            if (bosluksuzKelime === temizKufur) {
                return true;
            }
            // 4. HARF UZATMA KONTROLÜ (aynı harfin tekrarını tek harf yap)
            let uzatmasizKelime = kelime.replace(/(.)\1+/g, '$1');
            if (uzatmasizKelime === temizKufur) {
                return true;
            }
            // 5. KOMBİNE KONTROL (sayı düzeltme + harf uzatma)
            let kombineKelime = kelime
                .replace(/4/g, 'a')
                .replace(/@/g, 'a')
                .replace(/3/g, 'e')
                .replace(/1/g, 'i')
                .replace(/!/g, 'i')
                .replace(/0/g, 'o')
                .replace(/5/g, 's')
                .replace(/\$/g, 's')
                .replace(/7/g, 't')
                .replace(/2/g, 'o')
                .replace(/6/g, 'g')
                .replace(/8/g, 'b')
                .replace(/9/g, 'g')
                .replace(/(.)\1+/g, '$1');
            if (kombineKelime === temizKufur) {
                return true;
            }
        }
    }
    return false;
};
exports.supheliKufurAlgila = supheliKufurAlgila;
const isSekilliYazi = (s) => {
    return s != s.replace(/[^A-Za-z0-9üçğşöıÜÖİÇĞŞ\s"!'^+%&/()\=?_<>£#$½{[\]}\\|~`,;@*.:\/,<>|€]/g, "");
};
exports.isSekilliYazi = isSekilliYazi;
const kufurAlgila = (msg) => {
    let kufur = false;
    let msgParts = msg.toLowerCase().split(" ");
    kufurler.forEach((v) => {
        msgParts.forEach((m) => {
            if (m == v) {
                kufur = true;
            }
        });
    });
    return kufur;
};
exports.kufurAlgila = kufurAlgila;
// Combined profanity detection function
const detectProfanity = (msg) => {
    return (0, exports.supheliKufurAlgila)(msg) || (0, exports.kufurAlgila)(msg) || (0, exports.isSekilliYazi)(msg);
};
exports.detectProfanity = detectProfanity;
// Detect URLs/links in message
const detectLink = (msg) => {
    const urlPatterns = [
        /https?:\/\//i,
        /www\./i,
        /\.com/i,
        /\.net/i,
        /\.org/i,
        /\.co/i,
        /\.gg/i,
        /\.io/i,
        /discord\.gg/i,
        /youtu\.be/i,
        /youtube\.com/i,
        /twitch\.tv/i
    ];
    return urlPatterns.some(pattern => pattern.test(msg));
};
exports.detectLink = detectLink;
// Check for shaped text specifically
const detectShapedText = (msg) => {
    return (0, exports.isSekilliYazi)(msg);
};
exports.detectShapedText = detectShapedText;
// Check for basic profanity from word list
const detectBasicProfanity = (msg) => {
    return (0, exports.kufurAlgila)(msg);
};
exports.detectBasicProfanity = detectBasicProfanity;
// Check for advanced/suspicious profanity
const detectAdvancedProfanity = (msg) => {
    return (0, exports.supheliKufurAlgila)(msg);
};
exports.detectAdvancedProfanity = detectAdvancedProfanity;
// Check for Discord mentions
const detectDiscordMentions = (msg) => {
    return /@everyone/i.test(msg) || /@here/i.test(msg);
};
exports.detectDiscordMentions = detectDiscordMentions;
// Filter for Discord patterns and invisible characters
const filterName = (name) => {
    const forbiddenPatterns = [
        /@everyone/i,
        /@here/i,
        /!/, // '!' karakterini yasakla
        /<@&\d+>/g // Discord rol etiketleme formatını engelle
    ];
    // Görünmez karakterler listesi (yaygın olanlar)
    const invisibleChars = [
        '\u200B', // Zero-width space
        '\u200C', // Zero-width non-joiner
        '\u200D', // Zero-width joiner
        '\u2060', // Word joiner
        '\uFEFF', // Zero-width no-break space
        '\u3164', // Hangul Filler (ㅤ)
        '\u2800' // Braille pattern blank
    ];
    if (!name || name.trim().length === 0)
        return true;
    // Tüm görünmez karakterleri temizleyip hala boşsa engelle
    let cleaned = name;
    for (let char of invisibleChars) {
        cleaned = cleaned.split(char).join('');
    }
    if (cleaned.trim().length === 0)
        return true;
    for (let pattern of forbiddenPatterns) {
        if (pattern.test(name)) {
            return true;
        }
    }
    return false;
};
exports.filterName = filterName;
// Filter for message content
const filterMessage = (message) => {
    const forbiddenPatterns = [
        /@everyone/i,
        /@here/i
    ];
    for (let pattern of forbiddenPatterns) {
        if (pattern.test(message)) {
            return '** (YASAKLI MESAJ!)';
        }
    }
    return message;
};
exports.filterMessage = filterMessage;
