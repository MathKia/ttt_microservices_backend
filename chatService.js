import { Server } from "socket.io";
import http from "http";
import express from "express";
import axios from "axios"; // for disconnect event to send 'exit room req' -> API GW -> room man
import env from "dotenv";
import jwt from "jsonwebtoken";
import fs from "fs"; // for ssl certificates for services directly accessed by frontend (api gw, chat, game)
import https from "https"; // make express app into low-level http server for socket.io to attach too/ socket.io CANT attach directly to express

// allow env variables to be configured
env.config();

const PORT = process.env.CHAT_PORT;
const app = express();

// load ssl certificate and key from certbot # expires 9 June 2025
const privateKey = fs.readFileSync("/etc/letsencrypt/live/chat.kiaramathuraportfolio.com/privkey.pem", "utf8");
const certificate = fs.readFileSync("/etc/letsencrypt/live/chat.kiaramathuraportfolio.com/fullchain.pem", "utf8");
const credentials = { key: privateKey, cert: certificate };

//HTTPS server for websockets
const server = https.createServer(credentials, app)
const io = new Server(server, {
  cors: {
    origin: [process.env.REACT_ORIGIN_URL], // Allow connections from both the API Gateway and Frontend
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Add a specific namespace for the chat service
const chatNamespace = io.of("/chat");  // <-- Define the namespace

const SECRET_KEY = process.env.JWT_SECRET // for short lived JWT decoding + verifiy
const rooms = {}
/* will store chat related variables  like  
'rooms = {
  "room1": {
    usernames: { sid1: "user1", sid2: "user2" },
    messages: [
      { sender: "user1", text: "Hello" },
      { sender: "user2", text: "Hi" }
    ]
  }
}'
*/

// Handle WebSocket connections

/* Socket.IO Middleware to authenticate on connection runs before connection event triggered */
chatNamespace.use((socket, next) => {
  console.log("Chat service socket auth handshake occuring")
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
chatNamespace.on("connection", (socket) => {
  console.log(`User id: ${socket.id} -> connected`);
  console.log(`Total Connected Clients: ${io.engine.clientsCount}`);

  // Join room logic
  socket.on("join_room", (data) => {
    console.log(`ID ${socket.id} USERNAME: ${data.username} wants to join room ${data.room}`);
    const room = data.room;
    const username = data.username;
    // Initialize the room if it doesn't exist
    console.log("Checking if room already exists ... ")
    if (!rooms[room]) {
      console.log(`room ${room} does not exist in chat service. Creating it now ...`)
      rooms[room] = {
        usernames: {}, // {sid1:user1}, {sid2:user2}
        messages: [], // {{user1, message1}, {user1,message2}, {user2, message3}
      };
      console.log(`Room ${room} created in chat service`);
    } 
    else {
      console.log(`Room ${room} already exists in chat service`);
    }
      
    // Add the player to the room
    console.log(`Adding player to chat service room ${room}...`)
    socket.join(data.room);
    rooms[room].usernames[socket.id]= username; // {sid1:user1}, {sid2:user2}
  
    // Emit the current state of the room ( msgs, players) to all clients that joined
    console.log("chat service: emitting roomData to", socket.id);
    chatNamespace.to(room).emit("room_data", {success: true, message: `${username} Successfully joined room ${room} in chat service. Current state of usernames = `, usernames: rooms[room].usernames});
  });

  // CHAT feature: server recieved a message from client to send to other client
  // add newest message to in mem store of all messages
  socket.on("send_message", (data)=>{
    console.log(`the data from send_message event =`, data)
    const username = rooms[data.room].usernames[socket.id]
    console.log(`${username} sent ${data.message}`)
    const time = new Date().toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' });
    console.log(time); 
    const newMessage = [username, data.message, time];
    rooms[data.room].messages.push(newMessage);
    chatNamespace.to(data.room).emit("updated_messages", [newMessage]); // Send only the new message
  })

  // func to remove player from room and delete room if empty
  function removePlayerFromRoom(socket, room) {
    console.log(`removing user  ${socket.user.username} (${socket.id}) from room in chat service`)
    if (!rooms[room]) return;
  
    delete rooms[room].usernames[socket.id];
    console.log( `removed user ${socket.user.username} (${socket.id}) from chat room service room metadata`)
    socket.leave(room);
    console.log(`removed user ${socket.user.username} (${socket.id}) from actual socket id of chat socket room service`)
  
    if (Object.keys(rooms[room].usernames).length === 0) {
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
      if (Object.keys(rooms[room].usernames).includes(socket.id)) {
        
        const username = rooms[room].usernames[socket.id]
            
        console.log(`User ${username} has disconnected. Removing them from room ${room} in chat service`)
        removePlayerFromRoom(socket, room);

          // 🔁 Notify the Room Manager via API Gateway
          try {
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

server.listen(PORT, () => {
  console.log(`Chat Service running on port ${PORT}`);
});
