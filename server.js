// server.js

// Tải biến môi trường từ file .env (dùng khi chạy cục bộ)
require('dotenv').config(); 

// --- CẤU HÌNH VÀ KẾT NỐI ---
const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');

// Lấy các biến môi trường
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_TOPIC_DATA = 'tlong/bangchuyen/data'; // Topic nhận dữ liệu từ ESP8266
const PORT = process.env.PORT || 3000; 

const app = express();
app.use(express.json());


// --- 1. ĐỊNH NGHĨA MODEL MONGODB (Sản phẩm) ---
const ProductSchema = new mongoose.Schema({
    soluong: { type: Number, required: true },
    mau: { type: String, required: true },
    trangthai: { type: String, required: true },
    timestamp: { type: Date, default: Date.now } // Tự động thêm thời gian ghi nhận
});
const ProductModel = mongoose.model('ProductRecord', ProductSchema);


// --- 2. KẾT NỐI MONGODB ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB: Connected successfully.'))
    .catch(err => console.error('MongoDB: Connection error:', err));


// --- 3. LOGIC MQTT (Lắng nghe và Lưu Database) ---
const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER}:8883`); // Giữ nguyên

// ... (các hàm on('connect') và on('error') giữ nguyên) ...

// Xử lý dữ liệu nhận được từ ESP8266
mqttClient.on('message', (topic, message) => {
    if (topic.toString() === MQTT_TOPIC_DATA) {
        try {
            // Lấy chuỗi JSON từ payload
            const jsonString = message.toString();

            // SỬA: LÀM SẠCH CHUỖI JSON TRÊN BACKEND
            // Loại bỏ khoảng trắng và ký tự xuống dòng thừa (rất quan trọng)
            const cleanedString = jsonString.trim().replace(/[\n\r]/g, ''); 
            
            // Phân tích chuỗi JSON đã được làm sạch
            const data = JSON.parse(cleanedString);

            // Lưu dữ liệu vào MongoDB
            const newRecord = new ProductModel({
                soluong: data.soluong,
                mau: data.mau,
                trangthai: data.trangthai
            });

            newRecord.save()
                .then(() => console.log(`Database: Record saved (Color: ${data.mau}).`))
                .catch(err => console.error('Database: Error saving record:', err));

        } catch (e) {
            // Lỗi này sẽ hiển thị trong Log Render, giúp debug chuỗi JSON thô
            console.error('Data Error: Failed to parse JSON or save:', message.toString());
        }
    }
});
// Sự kiện kết nối thành công MQTT
mqttClient.on('connect', () => {
    console.log(`MQTT: Connected to ${MQTT_BROKER}`);
    // Đăng ký vào Topic DATA để nhận JSON từ ESP8266
    mqttClient.subscribe(MQTT_TOPIC_DATA, (err) => {
        if (!err) {
            console.log(`MQTT: Subscribed to topic: ${MQTT_TOPIC_DATA}`);
        }
    });
});

// Sự kiện lỗi MQTT
mqttClient.on('error', (err) => {
    console.error('MQTT: Error:', err);
});

// Xử lý dữ liệu nhận được từ ESP8266
mqttClient.on('message', (topic, message) => {
    if (topic.toString() === MQTT_TOPIC_DATA) {
        try {
            // Phân tích chuỗi JSON: {"soluong":7, "mau":"GREEN", "trangthai":"STOP"}
            const data = JSON.parse(message.toString());

            // Lưu dữ liệu vào MongoDB
            const newRecord = new ProductModel({
                soluong: data.soluong,
                mau: data.mau,
                trangthai: data.trangthai
            });

            newRecord.save()
                .then(() => console.log(`Database: Record saved (Color: ${data.mau}).`))
                .catch(err => console.error('Database: Error saving record:', err));

        } catch (e) {
            console.error('Data Error: Failed to parse JSON or save:', message.toString());
        }
    }
});


// --- 4. EXPRESS API ENDPOINT ---

// API Endpoint để lấy lịch sử dữ liệu (Web Dashboard sẽ gọi API này)
app.get('/api/history', async (req, res) => {
    try {
        // Cho phép truy cập từ Web Dashboard tĩnh (CORS)
        res.header('Access-Control-Allow-Origin', '*'); 
        
        // Lấy 50 bản ghi mới nhất, sắp xếp theo thời gian mới nhất (giảm dần)
        const history = await ProductModel.find().sort({ timestamp: -1 }).limit(50);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving history' });
    }
});


// --- 5. BẮT ĐẦU SERVER ---
app.listen(PORT, () => {
    console.log(`Server: Backend running on http://localhost:${PORT}`);
});