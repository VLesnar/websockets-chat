const http = require('http');
const socketio = require('socket.io');
const xxh = require('xxhashjs');
const fs = require('fs');

const groundImage = fs.readFileSync(`${__dirname}/../client/ground.png`);

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const handler = (request, response) => {
  if (request.url === '/ground.png') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(groundImage);
  } else {
    fs.readFile(`${__dirname}/../client/index.html`, (err, data) => {
      if (err) {
        throw err;
      }
      response.writeHead(200);
      response.end(data);
    });
  }
};

const app = http.createServer(handler);
const io = socketio(app);

let playerCount = 0;

app.listen(port);

io.on('connection', (sock) => {
  const socket = sock;
  socket.join('room1');
  
  playerCount++;
  
  socket.player = {
    hash: xxh.h32(`${socket.id}${Date.now()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    name: `player${playerCount}`,
    oldName: `player${playerCount} `,
  };

  socket.on('textUpdate', (data) => {
    const text = `${socket.player.name}: ${data}`;
    io.sockets.in('room1').emit('updatedText', text);
  });
  
  socket.on('nameUpdate', (data) => {
    socket.player.oldName = socket.player.name;
    socket.player.name = data;
    const text = `${socket.player.oldName} has changed their name to ${socket.player.name}`;
    io.sockets.in('room1').emit('updatedName', socket.player);
    io.sockets.in('room1').emit('updatedText', text);
  });
  
  socket.on('disconnect', () => {
    io.sockets.in('room1').emit('disconnect', socket.player);
    
    socket.leave('room1');
  });
  
  socket.emit('joined', socket.player);
  socket.broadcast.to('room1').emit('updatedText', `${socket.player.name} has joined the room`);  
});

console.log(`Listening on port: ${port}`);
