import * as fs from 'fs';
import * as path from 'path';

// Load bad words from kufurler.txt
let kufurler: string[] = [];

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
} catch (error) {
  console.log('Küfür listesi yüklenemedi:', error);
  kufurler = []; // Fallback to empty array
}

export const supheliKufurAlgila = (msg: string): boolean => {
  if (!msg || msg.length < 2) return false;
  
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
    if (kelime.length < 2) continue;
    
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

export const isSekilliYazi = (s: string): boolean => {
  return s != s.replace(/[^A-Za-z0-9üçğşöıÜÖİÇĞŞ\s"!'^+%&/()\=?_<>£#$½{[\]}\\|~`,;@*.:\/,<>|€]/g, "");
};

export const kufurAlgila = (msg: string): boolean => {
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

// Combined profanity detection function
export const detectProfanity = (msg: string): boolean => {
  return supheliKufurAlgila(msg) || kufurAlgila(msg) || isSekilliYazi(msg);
};

// Detect URLs/links in message
export const detectLink = (msg: string): boolean => {
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

// Check for shaped text specifically
export const detectShapedText = (msg: string): boolean => {
  return isSekilliYazi(msg);
};

// Check for basic profanity from word list
export const detectBasicProfanity = (msg: string): boolean => {
  return kufurAlgila(msg);
};

// Check for advanced/suspicious profanity
export const detectAdvancedProfanity = (msg: string): boolean => {
  return supheliKufurAlgila(msg);
};

// Check for Discord mentions
export const detectDiscordMentions = (msg: string): boolean => {
  return /@everyone/i.test(msg) || /@here/i.test(msg);
};

// Filter for Discord patterns and invisible characters
export const filterName = (name: string): boolean => {
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
    '\u2800'  // Braille pattern blank
  ];

  if (!name || name.trim().length === 0) return true;

  // Tüm görünmez karakterleri temizleyip hala boşsa engelle
  let cleaned = name;
  for (let char of invisibleChars) {
    cleaned = cleaned.split(char).join('');
  }
  if (cleaned.trim().length === 0) return true;

  for (let pattern of forbiddenPatterns) {
    if (pattern.test(name)) {
      return true;
    }
  }

  return false;
};

// Filter for message content
export const filterMessage = (message: string): string => {
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
