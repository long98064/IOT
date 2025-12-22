// server.js

// Tải biến môi trường
require('dotenv').config(); 

// --- 1. KHAI BÁO THƯ VIỆN & CẤU HÌNH ---
const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const path = require('path');
const http = require('http'); // Cần thêm HTTP để chạy Socket.IO
const { Server } = require("socket.io"); // Thư viện Real-time

const app = express();
const server = http.createServer(app); // Tạo server bọc lấy app express
const io = new Server(server); // Khởi tạo Socket.IO

// Lấy biến môi trường
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const MQTT_TOPIC_DATA = 'tlong/bangchuyen/data';
const PORT = process.env.PORT || 3000; 

// --- 2. CẤU HÌNH WEB SERVER (SỬA LẠI ĐƯỜNG DẪN) ---

// Phục vụ file tĩnh ngay tại thư mục gốc (nơi chứa index.html và server.js)
app.use(express.static(__dirname));

// Route trang chủ: Gửi file index.html nằm ngay cạnh server.js
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 3. ĐỊNH NGHĨA MODEL MONGODB ---
const ProductSchema = new mongoose.Schema({
    soluong: { type: Number, required: true },
    mau: { type: String, required: true },
    trangthai: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const ProductModel = mongoose.model('ProductRecord', ProductSchema);

// --- 4. KẾT NỐI MONGODB ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB: Connected successfully.'))
    .catch(err => console.error('MongoDB: Connection error:', err));

// --- 5. LOGIC MQTT & SOCKET.IO ---
const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER}:8883`, {
    username: MQTT_USER,
    password: MQTT_PASS
});

mqttClient.on('connect', () => {
    console.log(`MQTT: Connected to ${MQTT_BROKER}`);
    mqttClient.subscribe(MQTT_TOPIC_DATA, (err) => {
        if (!err) console.log(`MQTT: Subscribed to topic: ${MQTT_TOPIC_DATA}`);
    });
});

mqttClient.on('message', (topic, message) => {
    if (topic.toString() === MQTT_TOPIC_DATA) {
        try {
            const jsonString = message.toString();
            // Làm sạch chuỗi JSON
            const cleanedString = jsonString.trim().replace(/[\n\r]/g, ''); 
            const data = JSON.parse(cleanedString);

            // A. Lưu vào Database
            const newRecord = new ProductModel({
                soluong: data.soluong,
                mau: data.mau,
                trangthai: data.trangthai
            });

            newRecord.save()
                .then(() => console.log(`DB Saved: ${data.mau}`))
                .catch(err => console.error('DB Save Error:', err));

            // B. Gửi tín hiệu ngay lập tức xuống Web (Socket.IO)
            // Để web cập nhật mà không cần F5
            io.emit('mqtt-data', data); 

        } catch (e) {
            console.error('Data Error:', message.toString());
        }
    }
});

// --- 6. API ENDPOINT (LẤY LỊCH SỬ) ---
app.get('/api/history', async (req, res) => {
    try {
        const history = await ProductModel.find().sort({ timestamp: -1 }).limit(50);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving history' });
    }
});

// --- 7. BẮT ĐẦU SERVER ---
// Lưu ý: Dùng server.listen thay vì app.listen để Socket.IO hoạt động
server.listen(PORT, () => {
    console.log(`Server: Running on port ${PORT}`);
});
