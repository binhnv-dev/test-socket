const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // Cho phép client từ localhost:3000 truy cập
    methods: ['GET', 'POST'], // Phương thức HTTP được phép
    allowedHeaders: ['my-custom-header'], // Các header tùy chọn (nếu cần)
    credentials: true, // Cho phép gửi cookie và header xác thực
  },
});

// Đọc dữ liệu từ file data.json
const dataFilePath = path.join(__dirname, 'data.json');
let sensorData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));

// Cấu hình CORS cho API (dành cho HTTP)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); // Cho phép domain http://localhost:3000 truy cập
  res.header('Access-Control-Allow-Methods', 'GET, POST'); // Cho phép các phương thức GET và POST
  res.header('Access-Control-Allow-Headers', 'Content-Type'); // Cho phép header Content-Type
  next();
});

// API endpoint trả về dữ liệu sensor
app.get('/api/sensors', (req, res) => {
  res.json(sensorData); // Trả về dữ liệu sensor dưới dạng JSON
});

// Lắng nghe kết nối từ client
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Gửi ngay dữ liệu sensor khi có kết nối
  socket.emit('sensorData', sensorData);

  // Theo dõi thay đổi trong file data.json (Giả sử có sự thay đổi trong file này)
  fs.watch(dataFilePath, (eventType, filename) => {
    if (eventType === 'change') {
      // Đọc lại dữ liệu khi file thay đổi và gửi tới client
      sensorData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      socket.emit('sensorData', sensorData); // Gửi dữ liệu mới tới client
    }
  });

  // Xử lý khi client ngắt kết nối
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = 4000;

// Khởi động server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
