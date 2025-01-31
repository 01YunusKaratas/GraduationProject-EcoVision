const express = require('express');
const twilio = require('twilio');
const bodyParser = require('body-parser');
require('dotenv').config();
const { Client } = require('pg');

// Veritabanı bağlantısını yapılandır
const client = new Client({
    host: "localhost",
    user: "postgres",
    port: 5432,
    password: "postgres", // Burada gerçek şifreni yazman gerekiyor.
    database: "postgres"
});

// Veritabanına bağlan
client.connect()
    .then(() => console.log("Veritabanına başarıyla bağlandı"))
    .catch(err => console.error("Bağlantı hatası:", err.stack));

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // public klasöründeki statik dosyaları sun

// Twilio istemcisi oluşturma
const twilioClient = twilio(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

// /send-verification API'si
app.post('/send-verification', (req, res) => {
    const { phoneNumber } = req.body;

    // Telefon numarasını doğrula (örneğin, +90 ile başlayıp başlamadığını kontrol edin)
    if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Geçersiz telefon numarası formatı.' });
    }

    // 6 haneli rastgele doğrulama kodu oluştur
    const verificationCode = Math.floor(100000 + Math.random() * 900000); 

    // Veritabanına kodu kaydet
    const query = `
        INSERT INTO verification_codes (phone_number, code)
        VALUES ($1, $2)
    `;
    const values = [phoneNumber, verificationCode];

    client.query(query, values)
        .then(result => {
            // Twilio ile SMS gönderme
            twilioClient.messages
                .create({
                    body: `Doğrulama kodunuz: ${verificationCode}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: phoneNumber,
                })
                .then(message => {
                    console.log(`Mesaj gönderildi: ${message.sid}`);
                    res.status(200).json({ message: 'Mesaj başarıyla gönderildi.' });
                })
                .catch(error => {
                    console.error('Mesaj gönderilemedi:', error);
                    res.status(500).json({ error: 'Mesaj gönderilemedi. Lütfen tekrar deneyin.' });
                });
        })
        .catch(err => {
            console.error('Veritabanı hatası:', err);
            res.status(500).json({ error: 'Doğrulama kodu veritabanına kaydedilemedi.' });
        });
});

// /verify-code API'si
app.post('/verify-code', (req, res) => {
    const { phoneNumber, enteredCode } = req.body;

    // Telefon numarası ve girilen doğrulama kodunu kontrol et
    const query = `
        SELECT * FROM verification_codes 
        WHERE phone_number = $1 AND code = $2
    `;
    const values = [phoneNumber, enteredCode];

    client.query(query, values)
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(400).json({ error: 'Doğrulama kodu hatalı.' });
            }

            // Kod doğru ise, başarılı yanıt dön
            res.status(200).json({ message: 'Doğrulama başarılı!' });
        })
        .catch(err => {
            console.error('Veritabanı hatası:', err);
            res.status(500).json({ error: 'Kod doğrulama sırasında bir hata oluştu.' });
        });
});

// /submit API'si
app.post('/submit', (req, res) => {
    const { name, size, color, usability, fabric_type, reason, material,decision } = req.body;

    // Veritabanına veri eklemek için SQL sorgusu
    const query = `
        INSERT INTO box1 (name, size, color, usability, fabric_type, reason, material,decision)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING "Id";
    `;
    const values = [name, size, color, usability, fabric_type, reason, material,decision];

    client.query(query, values)
        .then(result => {
            console.log('Veri başarıyla kaydedildi:', result);
            res.status(200).json({ message: 'Veri başarıyla kaydedildi.' });
        })
        .catch(err => {
            console.error('Veritabanı hatası:', err);
            res.status(500).json({ error: 'Veri kaydedilemedi. Lütfen tekrar deneyin.' });
        });
});

// Sunucu dinleme
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
