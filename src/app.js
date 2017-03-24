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
let players = [];

app.listen(port);

io.on('connection', (sock) => {
  const socket = sock;
  socket.join('room1');
  
  playerCount++;
  
  socket.player = {
    socketid: socket.id,
    hash: xxh.h32(`${socket.id}${Date.now()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    name: `player${playerCount}`,
    oldName: `player${playerCount} `,
  };
  
  players.push(socket.player);

  socket.on('textUpdate', (data) => {
    let text = `${socket.player.name}: ${data}`;
    
    if (text.startsWith(`${socket.player.name}: /engage`)) {
      let name = text.split(" ").pop().split(" ").shift();
      
      for(let i = 0; i < players.length; i++) {
        let player = players[i];
        if(player.name === name) {
          text = `${socket.player.name} wants to duel you`;
          io.to(player.socketid).emit('updatedText', text);
          text = `Would you like to duel? (Y or N)`;
          io.to(player.socketid).emit('updatedText', text);
          io.to(player.socketid).emit('initiatedDuel', socket.player);
        }
      }
    } else {
      io.sockets.in('room1').emit('updatedText', text);
    }
  });
  
  socket.on('nameUpdate', (data) => {
    socket.player.oldName = socket.player.name;
    socket.player.name = data;
    const text = `${socket.player.oldName} has changed their name to ${socket.player.name}`;
    io.sockets.in('room1').emit('updatedName', socket.player);
    io.sockets.in('room1').emit('updatedText', text);
  });
  
  socket.on('acceptDuel', (data) => {
    
  });
  
  socket.on('rejectDuel', (data) => {
    
  });
  
  socket.on('disconnect', () => {
    io.sockets.in('room1').emit('disconnect', socket.player);
    
    socket.leave('room1');
  });
  
  socket.emit('joined', socket.player);
  socket.broadcast.to('room1').emit('updatedText', `${socket.player.name} has joined the room`);  
});

console.log(`Listening on port: ${port}`);
