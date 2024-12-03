const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const app = express();
const server = http.createServer(app);
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // Cho phép client từ localhost:3000 truy cập
    methods: ['GET', 'POST'], // Phương thức HTTP được phép
    allowedHeaders: ['my-custom-header'], // Các header tùy chọn (nếu cần)
    credentials: true, // Cho phép gửi cookie và header xác thực
  },
});
const { v4: uuidv4 } = require('uuid');

// Đọc dữ liệu từ file data.json
const dataFilePath = path.join(__dirname, 'data.json');
const dataScanFilePath = path.join(__dirname, 'scan-data.json');
let sensorData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
// let scanDataMock = JSON.parse(fs.readFileSync(dataScanFilePath, 'utf8'));
const scanDataFilePath = path.join(__dirname, 'scan-data.json');

const readScanData = () => {
  try {
    const data = fs.readFileSync(scanDataFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading scan data:', error);
    return { data: { aps: [], stations: [] } }; // Trả về dữ liệu mặc định nếu có lỗi
  }
};
// Cấu hình CORS cho API (dành cho HTTP)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); // Cho phép domain http://localhost:3000 truy cập
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT'); // Cho phép các phương thức GET và POST
  res.header('Access-Control-Allow-Headers', 'Content-Type'); // Cho phép header Content-Type
  next();
});

// API endpoint trả về dữ liệu sensor
app.get('/api/v2/sensor/all', (req, res) => {
  res.json(sensorData); // Trả về dữ liệu sensor dưới dạng JSON
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
app.post('/api/v2/sensor/:id/start', (req, res) => {
  const sensorId = req.params.id;
  console.log(`Start scan for sensor ID: ${sensorId}`);

  // Gửi thông báo bắt đầu scan thành công
  res.json({
    code: 200,
    message: 'Start scan thành công',
  });

  const scanDataMock = readScanData();
  // Bắt đầu quét và gửi dữ liệu định kỳ qua socket
  scanInterval = setInterval(() => {
    io.emit(`sensor/${sensorId}/scanresult`, scanDataMock);
    console.log(123);
  }, 3000); // Gửi dữ liệu mỗi 3 giây
});

// Lắng nghe sự kiện stopSensorScan từ client
app.post('/api/v2/sensor/:id/stop', (req, res) => {
  const sensorId = req.params.id;
  console.log(`Stop scan for sensor ID: ${sensorId}`);

  // Dừng quét dữ liệu nếu có interval đang chạy
  console.log('ID:', scanInterval);

  if (scanInterval) {
    console.log('clear:', scanInterval);

    clearInterval(scanInterval);

    scanInterval = null;
  }

  res.json({
    code: 200,
    message: 'Stop scan thành công',
  });
});

// API endpoint để cập nhật thông tin sensor
app.put('/api/v2/sensor/:id', (req, res) => {
  const sensorId = req.params.id;
  const updatedSensor = req.body; // Lấy thông tin sensor cần cập nhật từ request body

  // Kiểm tra sensor có tồn tại không
  const sensorIndex = sensorData.data.findIndex(
    (sensor) => sensor.id === sensorId
  );

  if (sensorIndex === -1) {
    return res.status(404).json({
      code: 404,
      message: 'Sensor not found',
    });
  }

  // Cập nhật thông tin sensor
  sensorData.data[sensorIndex] = {
    ...sensorData.data[sensorIndex],
    ...updatedSensor,
  };

  // Ghi lại dữ liệu đã cập nhật vào file
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(sensorData, null, 2));
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: 'Failed to save sensor data',
    });
  }

  // Phát tín hiệu cập nhật qua WebSocket
  io.emit('sensorData', sensorData);

  // Gửi cập nhật qua topic all/sync
  const allSyncData = sensorData.data.map((sensor) => ({
    id: sensor.id,
    state: sensor.state, // Sử dụng field `status` làm trạng thái
    cards: sensor.cards || [],
    rules: sensor.rules || [],
    time_limit: sensor.time_limit || 0,
    packet_limit: sensor.packet_limit || 0,
    attack_list: sensor.attack_list || {},
  }));
  io.emit('all/sync', allSyncData);

  // Phản hồi thành công
  res.status(200).json({
    code: 200,
    message: 'Sensor updated successfully',
    data: sensorData.data[sensorIndex],
  });
});

app.post('/api/v2/sensor', (req, res) => {
  const { name, position } = req.body;

  // Kiểm tra dữ liệu gửi lên
  if (!name || !position) {
    return res.status(400).json({
      code: 400,
      message: 'Name and position are required fields.',
    });
  }

  // Tạo sensor mới
  const newSensor = {
    id: uuidv4(), // Tạo ID duy nhất
    name,
    position,
    status: 0, // Trạng thái mặc định
    last_seen: new Date().toISOString(), // Thời gian hiện tại
    noti_aps: [],
    noti_clients: [],
    noti_channels: [],
  };

  // Thêm sensor mới vào dữ liệu hiện tại
  sensorData.data.push(newSensor);

  // Ghi lại dữ liệu vào file
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(sensorData, null, 2));
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: 'Failed to save sensor data.',
    });
  }

  // Phát tín hiệu cập nhật qua WebSocket
  io.emit('sensorData', sensorData);

  // Phản hồi thành công
  res.status(200).json({
    code: 200,
    message: 'Sensor created successfully.',
    data: newSensor,
  });
});

let syncInterval = null;
// Lắng nghe kết nối từ client
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Gửi ngay dữ liệu sensor khi có kết nối
  socket.emit('sensorData', sensorData);
  if (!syncInterval) {
    syncInterval = setInterval(() => {
      const allSyncData = sensorData.data.map((sensor) => ({
        id: sensor.id,
        state: sensor.state, // Sử dụng field `status` làm trạng thái
        cards: sensor.cards || [],
        rules: sensor.rules || [],
        time_limit: sensor.time_limit || 0,
        packet_limit: sensor.packet_limit || 0,
        attack_list: sensor.attack_list || {},
      }));
      io.emit('all/sync', allSyncData); // Gửi tới tất cả các client
    }, 5000); // Cập nhật mỗi 5 giây
  }
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
