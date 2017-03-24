const http = require('http');
const socketio = require('socket.io');
const xxh = require('xxhashjs');
const fs = require('fs');

const avatar = fs.readFileSync(`${__dirname}/../client/coin.jpg`);
const groundImage = fs.readFileSync(`${__dirname}/../client/ground.png`);

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const handler = (request, response) => {
  if (request.url === '/ground.png') {  // Background
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(groundImage);
  } else if (request.url === '/coin.jpg') { // Avatars
    response.writeHead(200, { 'Content-Type': 'image/jpg' });
    response.end(avatar);
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
    socketid: socket.id,  // Used for easy access to transmit data from server
    hash: xxh.h32(`${socket.id}${Date.now()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    name: `player${playerCount}`,
    oldName: `player${playerCount} `, // Used for updating username
    choice: 1,
    x: 0,
    y: 0,
    cx: 50, // Used for collision
    cy: 50, // Used for collision
    r: 100, // Used for collision
    prevX: 0,
    prevY: 0,
    destX: 0,
    destY: 0,
    alpha: 0,
    moveLeft: false,
    moveRight: false,
    moveDown: false,
    moveUp: false,
  };

  // Adds the socket player data to an array for easier access
  players.push(socket.player);

  // Transmits text from client to all users
  socket.on('textUpdate', (data) => {
    let text = `${socket.player.name}: ${data}`;

    // Checks if a user wants to duel another player
    if (text.startsWith(`${socket.player.name}: /engage`)) {
      text = data;
      socket.emit('updatedText', text);
      
      // The name of the opponent the player wants to duel
      const name = text.split(' ').pop().split(' ').shift();  

      // Lets the opponent know the player wishes to duel
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
      
      // If the name the player inputted doesn't exist
      text = `${name} does not exist`;
      io.to(socket.player.socketid).emit('updatedText', text);
    } else {  // Regular text update
      io.sockets.in('room1').emit('updatedText', text);
    }
  });

  // Updates the username of the player
  socket.on('nameUpdate', (data) => {
    socket.player.oldName = socket.player.name; // Stores the old username for reference
    socket.player.name = data;
    socket.player.lastUpdate = Date.now();
    const text = `${socket.player.oldName} has changed their name to ${socket.player.name}`;
    io.sockets.in('room1').emit('updatedName', socket.player);
    io.sockets.in('room1').emit('updatedText', text);
  });

  // Updates any positions
  socket.on('movementUpdate', (data) => {
    socket.player = data;
    socket.player.lastUpdate = Date.now();

    socket.broadcast.to('room1').emit('updatedMovement', socket.player);
  });

  // Updates the two users involved in a duel
  socket.on('acceptDuel', (data) => {
    let text = `You are dueling ${socket.player.name}`;
    io.to(data.socketid).emit('updatedText', text);
    io.to(data.socketid).emit('chooseHand', socket.player);
    text = `You are dueling ${data.name}`;
    io.to(socket.player.socketid).emit('updatedText', text);
    io.to(socket.player.socketid).emit('chooseHand', data);
  });

  // Lets the original player know the opponent does not wish to duel
  socket.on('rejectDuel', (data) => {
    const text = `${socket.player.name} does not want to duel`;
    io.to(data.socketid).emit('updatedText', text);
  });

  // Determines who wins the game of Rock, Paper, Scissors
  // TODO: Logic for winning is wrong
  // TODO: Player and opponent choices come into server incorrectly
  socket.on('chosenHand', (data) => {
    const player = data.player;
    const opponent = data.opponent;

    socket.player.choice = player.choice;
    socket.player.lastUpdate = Date.now();
    
    // If the server cannot determine the choices
    let text = 'Undetermined error';

    if (player.choice === 1 && opponent.choice === 1) { // Rock vs. Rock
      text = 'There was a tie';
    } else if (player.choice === 1 && opponent.choice === 2) {  // Rock vs. Paper
      text = `${opponent.name} has won against ${player.name} with paper vs. rock`;
    } else if (player.choice === 1 && opponent.choice === 3) {  // Rock vs. Scissors
      text = `${player.name} has won against ${opponent.name} with rock vs. scissors`;
    } else if (player.choice === 2 && opponent.choice === 1) {  // Paper vs. Rock
      text = `${player.name} has won against ${opponent.name} with paper vs. rock`;
    } else if (player.choice === 2 && opponent.choice === 2) {  // Paper vs. Paper
      text = 'There was a tie';
    } else if (player.choice === 2 && opponent.choice === 3) {  // Paper vs. Scissors
      text = `${opponent.name} has won against ${player.name} with scissors vs. paper`;
    } else if (player.choice === 3 && opponent.choice === 1) {  // Scissors vs. Rock
      text = `${opponent.name} has won against ${player.name} with rock vs. scissors`;
    } else if (player.choice === 3 && opponent.choice === 2) {  // Scissors vs. Paper
      text = `${player.name} has won against ${opponent.name} with scissors vs. paper`;
    } else if (player.choice === 3 && opponent.choice === 3) {  // Scissors vs. Scissors
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
