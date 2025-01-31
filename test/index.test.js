import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { Client } from 'pg';

// .env dosyasını yükle
dotenv.config();

// Mocklanan Twilio istemcisi
const mockTwilioClient = {
  messages: {
    create: vi.fn().mockResolvedValue({ sid: '12345' }) // Twilio mesajını mockluyoruz
  }
};

// Mocklanan PostgreSQL veritabanı istemcisi
const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }) // Veritabanı sorgusunu mockluyoruz
};

// Test ortamı için Express uygulaması
const app = express();
app.use(bodyParser.json());

// API uç noktaları
app.post('/send-verification', async (req, res) => {
  const { phoneNumber } = req.body;

  // Telefon numarasının geçerliliğini kontrol et
  if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber) || phoneNumber.length < 7) {
    return res.status(400).json({ error: 'Geçersiz telefon numarası formatı.' });
  }

  // Doğrulama kodu üret
  const verificationCode = Math.floor(100000 + Math.random() * 900000);

  // Veritabanına ekleme işlemi
  const query = `INSERT INTO verification_codes (phone_number, code) VALUES ($1, $2)`;
  const values = [phoneNumber, verificationCode];

  try {
    // Mocklanmış veritabanı sorgusu
    await mockClient.query(query, values);

    // Mocklanmış Twilio ile SMS gönderme
    await mockTwilioClient.messages.create({
      body: `Doğrulama kodunuz: ${verificationCode}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    res.status(200).json({ message: 'Mesaj başarıyla gönderildi.' });
  } catch (err) {
    console.error('Veritabanı veya Twilio hatası:', err);
    res.status(500).json({ error: 'Doğrulama kodu veritabanına kaydedilemedi veya mesaj gönderilemedi.' });
  }
});

// Testler
describe('POST /send-verification', () => {
  beforeEach(() => {
    // Her testten önce mock fonksiyonlarını sıfırlıyoruz
    vi.clearAllMocks();
  });

  it('should return 400 if phone number is invalid', async () => {
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: 'invalid-phone' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Geçersiz telefon numarası formatı.');
  });

  it('should return 200 and send verification message when phone number is valid', async () => {
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+905551234567' });
    
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Mesaj başarıyla gönderildi.');
  });

  it('should return 500 if database query fails', async () => {
    // Veritabanı hatasını mocklamak için mockClient.query'i hata döndürebiliriz
    mockClient.query.mockRejectedValueOnce(new Error('Veritabanı hatası'));
    
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+905551234567' });
    
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Doğrulama kodu veritabanına kaydedilemedi veya mesaj gönderilemedi.');
  });

  it('should handle edge case with minimum phone number length', async () => {
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+1' });
    
    expect(response.status).toBe(400); // Geçerli bir numara değil
  });

  it('should handle edge case with maximum phone number length', async () => {
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+123456789012345' }); // Maksimum uzunlukta numara
    expect(response.status).toBe(200); // Geçerli bir numara olmalı
  });

  it('should return 500 if Twilio fails', async () => {
    // Twilio hatası mocklamak için
    mockTwilioClient.messages.create.mockRejectedValueOnce(new Error('Twilio error'));

    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+905551234567' });
    
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Doğrulama kodu veritabanına kaydedilemedi veya mesaj gönderilemedi.');
  });
});

describe('Twilio service', () => {
  it('should send SMS using Twilio service', async () => {
    const twilioSpy = vi.spyOn(mockTwilioClient.messages, 'create').mockResolvedValue({ sid: '12345' });
    
    const response = await request(app)
      .post('/send-verification')
      .send({ phoneNumber: '+905551234567' });
    
    expect(twilioSpy).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Mesaj başarıyla gönderildi.');
  });
});
