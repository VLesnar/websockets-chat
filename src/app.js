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
const players = [];

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
    choice: 1,
  };

  players.push(socket.player);

  socket.on('textUpdate', (data) => {
    let text = `${socket.player.name}: ${data}`;

    if (text.startsWith(`${socket.player.name}: /engage`)) {
      text = data;
      socket.emit('updatedText', text);
      const name = text.split(' ').pop().split(' ').shift();

      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        if (player.name === name) {
          text = `${socket.player.name} wants to duel you`;
          io.to(player.socketid).emit('updatedText', text);
          text = 'Would you like to duel? (Y or N)';
          io.to(player.socketid).emit('updatedText', text);
          io.to(player.socketid).emit('initiatedDuel', socket.player);
          return;
        }
      }

      text = `${name} does not exist`;
      io.to(socket.player.socketid).emit('updatedText', text);
    } else {
      io.sockets.in('room1').emit('updatedText', text);
    }
  });

  socket.on('nameUpdate', (data) => {
    socket.player.oldName = socket.player.name;
    socket.player.name = data;
    socket.player.lastUpdate = Date.now();
    const text = `${socket.player.oldName} has changed their name to ${socket.player.name}`;
    io.sockets.in('room1').emit('updatedName', socket.player);
    io.sockets.in('room1').emit('updatedText', text);
  });

  socket.on('acceptDuel', (data) => {
    let text = `You are dueling ${socket.player.name}`;
    io.to(data.socketid).emit('updatedText', text);
    io.to(data.socketid).emit('chooseHand', socket.player);
    text = `You are dueling ${data.name}`;
    io.to(socket.player.socketid).emit('updatedText', text);
    io.to(socket.player.socketid).emit('chooseHand', data);
  });

  socket.on('rejectDuel', (data) => {
    const text = `${socket.player.name} does not want to duel`;
    io.to(data.socketid).emit('updatedText', text);
  });

  socket.on('chosenHand', (data) => {
    const player = data.player;
    let opponent = data.opponent;

    socket.player.choice = player.choice;
    socket.player.lastUpdate = Date.now();

    let text = 'Undetermined error';
    
    console.log(`${player.name}: ${player.choice}; ${opponent.name}: ${opponent.choice}`);

    if (player.choice === 1 && opponent.choice === 1) {
      text = 'There was a tie';
    } else if (player.choice === 1 && opponent.choice === 2) {
      text = `${opponent.name} has won against ${player.name} with paper vs. rock`;
    } else if (player.choice === 1 && opponent.choice === 3) {
      text = `${player.name} has won against ${opponent.name} with rock vs. scissors`;
    } else if (player.choice === 2 && opponent.choice === 1) {
      text = `${player.name} has won against ${opponent.name} with paper vs. rock`;
    } else if (player.choice === 2 && opponent.choice === 2) {
      text = 'There was a tie';
    } else if (player.choice === 2 && opponent.choice === 3) {
      text = `${opponent.name} has won against ${player.name} with scissors vs. paper`;
    } else if (player.choice === 3 && opponent.choice === 1) {
      text = `${opponent.name} has won against ${player.name} with rock vs. scissors`;
    } else if (player.choice === 3 && opponent.choice === 2) {
      text = `${player.name} has won against ${opponent.name} with scissors vs. paper`;
    } else if (player.choice === 3 && opponent.choice === 3) {
      text = 'There was a tie';
    }

    io.to(player.socketid).emit('updatedText', text);
  });

  socket.on('disconnect', () => {
    io.sockets.in('room1').emit('disconnect', socket.player);

    socket.leave('room1');
  });

  socket.emit('joined', socket.player);
  socket.broadcast.to('room1').emit('updatedText', `${socket.player.name} has joined the room`);
});

console.log(`Listening on port: ${port}`);
