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
const dataScanFilePath = path.join(__dirname, 'scan-data.json');
let sensorData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
let scanDataMock = JSON.parse(fs.readFileSync(dataScanFilePath, 'utf8'));

// Cấu hình CORS cho API (dành cho HTTP)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); // Cho phép domain http://localhost:3000 truy cập
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE'); // Cho phép các phương thức GET và POST
  res.header('Access-Control-Allow-Headers', 'Content-Type'); // Cho phép header Content-Type
  next();
});

// API endpoint trả về dữ liệu sensor
app.get('/api/v2/sensor/all', (req, res) => {
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

  app.delete('/api/v2/sensor/:id', (req, res) => {
    const sensorId = req.params.id;

    // Tìm và xóa sensor trong dữ liệu
    const updatedSensorData = sensorData.data.filter(
      (sensor) => sensor.id !== sensorId
    );

    sensorData = { ...sensorData, data: updatedSensorData };

    if (updatedSensorData.length === sensorData.length) {
      return res.status(404).json({ error: 'Sensor not found' });
    }

    // Ghi lại dữ liệu đã cập nhật vào file
    fs.writeFileSync(dataFilePath, JSON.stringify(sensorData, null, 2));
    sensorData = updatedSensorData; // Cập nhật dữ liệu sensor trong bộ nhớ

    // Phản hồi thành công
    res.status(200).json({
      message: 'Sensor deleted successfully',
      data: updatedSensorData,
    });

    // Phát tín hiệu cập nhật qua WebSocket
    io.emit('sensorData', sensorData);
  });

  let scanInterval = null;
  // Lắng nghe sự kiện startSensorScan từ client
  app.post('/api/v2/sensor/:id/start-scan', (req, res) => {
    const sensorId = req.params.id;
    console.log(`Start scan for sensor ID: ${sensorId}`);

    // Gửi thông báo bắt đầu scan thành công
    res.json({
      code: 200,
      message: 'Start scan thành công',
    });

    // Bắt đầu quét và gửi dữ liệu định kỳ qua socket
    scanInterval = setInterval(() => {
      io.emit(`sensor/${sensorId}/scanResultData`, scanDataMock);
    }, 3000); // Gửi dữ liệu mỗi 3 giây
  });

  // Lắng nghe sự kiện stopSensorScan từ client
  app.post('/api/v2/sensor/:id/stop-scan', (req, res) => {
    const sensorId = req.params.id;
    console.log(`Stop scan for sensor ID: ${sensorId}`);

    // Dừng quét dữ liệu nếu có interval đang chạy
    if (scanInterval) {
      clearInterval(scanInterval);

      scanInterval = null;
    }

    res.json({
      code: 200,
      message: 'Stop scan thành công',
    });
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
