# VIP Sistemi Kurulumu

Bot MongoDB'den VIP bilgilerini çekmek için `.env` dosyasına ihtiyaç duyar.

1. Proje klasöründe `.env` dosyası oluşturun
2. Aşağıdaki bilgileri kendi MongoDB bilgilerinizle doldurun:

```env
# MongoDB Bağlantı Bilgileri
MONGO_URI=mongodb://username:password@host:port/
MONGO_DB=database_name
MONGO_COLLECTION=vips_collection
MONGO_AUTH_FIELD=auth_field
```

**Önemli:** `.env` dosyası gizli bilgiler içerdiği için asla GitHub'a push edilmemelidir.

Eğer MongoDB bağlantı bilgileri sağlanmazsa, bot varsayılan VIP sistemini kullanacaktır.