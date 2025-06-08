import { Server } from "socket.io";
import http from "http";
import express from "express";
import axios from "axios"; // for disconnect event to send 'exit room req' -> API GW -> room man
import env from "dotenv";
import jwt from "jsonwebtoken";
//import fs from "fs"; // for ssl certificates for services directly accessed by frontend (api gw, chat, game)
//import https from "https"; // make express app into low-level http server for socket.io to attach too/ socket.io CANT attach directly to express

// allow env variables to be configured
env.config();

const PORT = process.env.GAME_PORT;
const app = express();

// // load ssl certificate and key from certbot # expires 9 June 2025
// const privateKey = fs.readFileSync("/etc/letsencrypt/live/game.kiaramathuraportfolio.com/privkey.pem", "utf8");
// const certificate = fs.readFileSync("/etc/letsencrypt/live/game.kiaramathuraportfolio.com/fullchain.pem", "utf8");
// const credentials = { key: privateKey, cert: certificate };

// //HTTPS server for websockets
// const server = https.createServer(credentials, app)
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: [process.env.REACT_ORIGIN_URL], // Allow connections from both the API Gateway and Frontend
    methods: ["GET", "POST"],     
    credentials: true     // passes cookie
  }
}); // socketio server object

/* will store chat related variables  like  
rooms = {
  "room1": {
    setupConfirmations: 0,
    players: [],
    gameState: Array(9).fill(""),
    round: 0,
    rematchCount: 0,
    rematchConfirmations: 0,
    usernames: { sid1: "user1", sid2: "user2" }
  }
}
*/


// Add a specific namespace for the chat service
const gameNamespace = io.of("/game");  // <-- Define the namespace

const rooms = {} // rooms = {room:{players:[player1, player2], gamestate:["x", "x"....]}
const SECRET_KEY = process.env.JWT_SECRET // for short lived JWT decoding + verifiy

// Handle WebSocket connections

/* Socket.IO Middleware to authenticate on connection runs before connection event triggered */
gameNamespace.use((socket, next) => {
  console.log("Game service socket auth handshake occuring")
  const {token} = socket.handshake.auth; //socket built in handshake + custom auth object we passed from frontend socket client obj which has 'token'

  if (!token) {
    console.log("failed socket auth, missing token")
    return next(new Error("Authentication failed: Token missing"));
  }
  
  // if token exis try to decode it
  try {
    console.log("token exists, decoding")
    const decoded = jwt.verify(token, SECRET_KEY); //decode and verify the JWT 
    console.log(`decoded short lived socket auth token: `, decoded)
    socket.user = decoded; // Attach user info to socket object 
    next();
  } catch (err) {
    console.error("Socket auth failed:", err.message);
    next(new Error("Authentication failed: Invalid token"));
  }
});

/* socket server on connection + listening for events */
gameNamespace.on("connection", (socket) => {
    console.log(`User ${socket.user.username} (${socket.id}) connected`);
    console.log(`Total Connected Clients: ${io.engine.clientsCount}`);

    // Join room logic
    socket.on("join_room", (data) => {
        console.log(`ID ${socket.id} USERNAME: ${data.username} wants to join room ${data.room}`);
        const room = data.room;
        const username = data.username;
        // Initialize the room if it doesn't exist
        console.log("Checking if room already exists ... ")
        if (!rooms[room]) {
            console.log(`room ${room} does not exist in game service. Creating it now ...`)
            rooms[room] = {
                setupConfirmations: 0,
                players: [],
                gameState: Array(9).fill(""),
                round: 0,
                rematchCount:0,
                rematchConfirmations:0,
                usernames: {}, // {sid1:user1}, {sid2:user2}
            };
            console.log(`Room ${room} created in game service`);
        }else 
        {
            console.log(`Room ${room} already exists in game service`);
        }

        // Add the player to the room
        console.log(`Adding player ${username} to room socket ${room} ...`)
        socket.join(room);
        rooms[room].players.push(socket.id);
        rooms[room].usernames[socket.id]= username;
        console.log(`Adding player ${username} to room metadata ${room} ...`)

        // Emit the current state of the room (game state + players) to all clients that joined
        gameNamespace.to(room).emit("room_data", {success: true, message: `${username} Successfully joined room ${room} in game service. Current state of usernames = `, usernames: rooms[room].usernames});
        console.log(`emiting room data from game service to frontend`)
        // If two players have joined, start the game
        if (rooms[room].players.length === 2) {
            console.log(`2 players in room ${room}. can set up initial game state`)
            const [player1, player2] = rooms[room].players;
            rooms[room].player1 = player1;  // Store player1
            rooms[room].player2 = player2;  // Store player2
            rooms[room].gameState = Array(9).fill("");
            gameNamespace.to(room).emit("players_in_room", {usernames: [rooms[room].usernames[player1], rooms[room].usernames[player2] ]});
            gameNamespace.to(player1).emit("initial_setUp", { player: "X", opp: "O", turn: true, gameState: rooms[room].gameState, round:0 });
            gameNamespace.to(player2).emit("initial_setUp", { player: "O", opp: "X", turn: false, gameState: rooms[room].gameState, round:0 });
        }
  
    });

    // server recieve rematch request from a client and notifies other client
    // if rematch confirmation = 2 both players want rematch, reset inital set up
    // else no rematch
    socket.on("rematch_requested",()=>{
      console.log(`rematch request`)
      const room = Object.keys(rooms).find((r) => rooms[r].players.includes(socket.id));
      socket.to(room).emit('rematch_invite')
      if (room) {
          rooms[room].rematchConfirmations++;
      }

      if (rooms[room].rematchConfirmations === 2) {
        console.log(`rematch on`)
          gameNamespace.to(room).emit("rematch_on", {rematchOn: true});

          rooms[room].setupConfirmations = 0;
          console.log("reset setup confirmations")
          rooms[room].rematchConfirmations = 0;
          console.log("reset rematch confirmations")
          rooms[room].gameState = Array(9).fill("");
          console.log("reset gamestate")
          rooms[room].round=0;
          console.log("reset round confirmations")

          rooms[room].rematchCount ++;
          console.log(`this is the ${rooms[room].rematchCount} time a rematch is happening`)

          const { player1, player2 } = rooms[room];  // Retrieve stored players

          if (rooms[room].rematchCount%2===0){
          gameNamespace.to(player1).emit("initial_setUp", { player: "X", opp: "O", turn: true, gameState: rooms[room].gameState, round:0 });
          gameNamespace.to(player2).emit("initial_setUp", { player: "O", opp: "X", turn: false, gameState: rooms[room].gameState, round:0 });
          } 
          else{
          gameNamespace.to(player2).emit("initial_setUp", { player: "X", opp: "O", turn: true, gameState: rooms[room].gameState, round:0 });
          gameNamespace.to(player1).emit("initial_setUp", { player: "O", opp: "X", turn: false, gameState: rooms[room].gameState, round:0 });
          }
      } 
  })

  // server recieves confirmation from both players that they successfully assigned their values
  // they are read to 'start the game' 
  socket.on("initial_setUp_complete", () => {
    console.log(`intial setup sucessfully completed`)
      const room = Object.keys(rooms).find((r) => rooms[r].players.includes(socket.id));
      if (room) {
          rooms[room].setupConfirmations++;
      }

      if (rooms[room].setupConfirmations === 2) {
          gameNamespace.to(room).emit("start_game");
          console.log(`emitting start game event`)
      }
  });

  // GAME feature -> server recieved client move for which block they marked
  // server updates game state for new round
  socket.on("client_move", (data) => {
    console.log(`recieved player move`)
      const room = Object.keys(rooms).find((r) => rooms[r].players.includes(socket.id));
      if (!room) return;
      rooms[room].round ++
      console.log("round is now ", rooms[room].round)
      rooms[room].gameState[data.move] = data.player;
      gameNamespace.to(room).emit("update_round", {round: rooms[room].round})
      gameNamespace.to(room).emit("update_grid", { gameState: rooms[room].gameState });

      // Check for a winner or draw ... if neither continue rounds
      const winStreak = checkWin(rooms[room].gameState);
      if (winStreak) {
        console.log(`winner found`)
          gameNamespace.to(room).emit("win_streak", { winStreak });
      } else if (rooms[room].round === 9) {
        console.log(`draw of game`)
          gameNamespace.to(room).emit("draw");
      }
      else {
        console.log(`turn switch`)
          socket.emit("turn_update", { turn: false });
          socket.to(room).emit("turn_update", { turn: true });
      }
  });

  // func to remove player from room and delete room if empty
  function removePlayerFromRoom(socket, room) {
    console.log(`removing user  ${socket.user.username} (${socket.id}) from room in game service`)
      if (!rooms[room]) return;
  
      rooms[room].players = rooms[room].players.filter(id => id !== socket.id);
      delete rooms[room].usernames[socket.id];
      console.log( `removed user ${socket.user.username} (${socket.id}) from game room service room metadata`)
      socket.leave(room);
      console.log(`removed user ${socket.user.username} (${socket.id}) from actual socket id of game socket room service`)
  
      if (rooms[room].players.length > 0) {
          socket.to(room).emit("rematch_on", {rematchOn: false});
          rooms[room].rematchConfirmations = 0;
      } else {
          delete rooms[room];
          console.log(`No one in Room ${room}. Room deleted`);
      }
  }
  
  // server recieves that player clicks "Exit" to leave room
  socket.on("exit", (data) => {
    const room = data.room;
    console.log(`player ${socket.user.username} (${socket.id}) wants to exit room ${room}`)
    removePlayerFromRoom(socket, room);
  });
  
  // server recieves player disconnects (browser close, refresh, crash)
  socket.on("disconnect", async () => {
    console.log(`Player ${socket.user.username} (${socket.id}) disconnected`);
    for (const room in rooms) {
        if (rooms[room].players.includes(socket.id)) {

            const username = rooms[room].usernames[socket.id]
            
            console.log(`User ${username} has disconnected. Removing them from room ${room} in game service`)
            removePlayerFromRoom(socket, room);
            
        // 🔁 Notify the Room Manager via API Gateway
        try {
            console.log('sending request to exit room')
            const response = await axios.post(`${process.env.ROOM_API_BASE_URL}/exit`, {
                room: room,
                username: username,
            }, 
            {
              params: { mode: "socket" }, // mode = socket is like an SOS exit, not requiring auth token because its a socket event not user event
              headers: {
                'Content-Type': 'application/json',
              },
              withCredentials: false, // No cookies here anyway
            });

            console.log("Room Manager acknowledged exit:", response.data);
        } 
        catch (err) {
            console.error("Failed to notify Room Manager:", err.message);
        }
        break;
        }
    }
  });
  
});

// check if win from most recent player move
function checkWin(gameState) {
  console.log(`checking for win condition`)
  const winningConditions = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
  ];
  
  return winningConditions.find(([a, b, c]) => gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]);
}

server.listen(PORT, () => {
  console.log(`Game Service running on port ${PORT}`);
});
