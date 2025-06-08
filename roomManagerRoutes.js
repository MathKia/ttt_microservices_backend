import express from "express";
import pg from "pg";
import env from "dotenv";
import {generateToken, verifyToken} from "./tokenMiddleware/tokenMiddleware.js"

env.config();

// constants 
const TABLE = process.env.PG_ROOM_TABLE; //db table name

// set up pg database + connection
const dbPool = new pg.Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_ROOM_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    max: 10,  // Max number of connections in the pool
    idleTimeoutMillis: 30000,  // Connection timeout for idle connections
    connectionTimeoutMillis: 2000  // Timeout for establishing a new connection
})

const router = express.Router();

// Use the room routes
/* to join a room */
router.use("/join", verifyToken, async (req, res) => {
  console.log("Received join room request: API gateway -> room service");

  const { room } = req.body;

  /********* TEMPORARY AUTH FALLBACK FOR DESKTOP ***********/
  const username = req.user ? req.user.username.toLowerCase() : req.body.username.toLowerCase();
  console.log(`User '${username}' wants to join room '${room}'`);

  // Check if the room already exists in the DB
  const roomEntries = await dbPool.query(
    `SELECT * FROM ${TABLE} WHERE roomname = $1`,
    [room]
  );

  const currentCount = roomEntries.rows.length;

  // CASE 1: Room doesn't exist — first user joining
  if (currentCount === 0) {
    await dbPool.query(
      `INSERT INTO ${TABLE} (username, roomname, service, isFull, slot_number) VALUES 
        ($1, $2, $3, false, 1),
        ($1, $2, $4, false, 1)`,
      [username, room, 'game', 'chat']
    );
    console.log(`First user '${username}' joined room '${room}'`);

  // CASE 2: Room exists, check if isFull is false
  } else if (roomEntries.rows.length === 2 && roomEntries.rows[0].isfull === false) {
    await dbPool.query(
      `INSERT INTO ${TABLE} (username, roomname, service, isFull, slot_number) VALUES 
        ($1, $2, $3, false, 2),
        ($1, $2, $4, false, 2)`,
      [username, room, 'game', 'chat']
    );

    // Update all entries for that room to mark it full
    await dbPool.query(
      `UPDATE ${TABLE} SET isFull = true WHERE roomname = $1`,
      [room]
    );
    console.log(`Second user '${username}' joined room '${room}', room is now full`);

  // CASE 3: Room is full
  } else {
    console.log(`Room '${room}' is full`);
    return res.json({ success: false, message: `Room '${room}' is full. Please pick another room ...` });
  }

  // Return success response with service addresses
  res.json({
    success: true,
    message: 'Joined room, waiting for opponent ...',
    socketToken: generateToken(username, "120s"),
    serviceAdds: {
      chat: process.env.CHAT_ADD,
      game: process.env.GAME_ADD
    }
  });
});

/* to leave room */
router.use("/exit", verifyToken, async (req, res) => {
    console.log("Received leave room request: API gateway -> room service");

    const {mode} = req.query
    console.log('mode = ', mode)
    const { room } = req.body;          // Still extract the room name from the client
    const username = req.user ? req.user.username.toLowerCase() : req.body.username.toLowerCase(); // Use the verified username from the JWT = more security, but if socket disconnect wont be JWT to get username so can just use req.body.username
    console.log(`user ${username} wants to leave room ${room}`)

    //check if room exist in database and if user is in room 
    const checkRoom = await dbPool.query(`SELECT * FROM ${TABLE} WHERE roomname = $1 AND username = $2`, [room, username])
    console.log(`result of ${room} with ${username} in database  =`, checkRoom.rows)
    // if user not found in the room
    if (checkRoom.rows.length === 0) {
      console.log(`User ${username} from room ${room} not found — possibly already removed`);
      return res.send({ success: true, message: "User already removed or not found" });
    } 
    // if user found in room deletes them from room registry database
    else 
    { const slot = checkRoom.rows[0].slot_number
      await dbPool.query(`DELETE FROM ${TABLE} WHERE roomname = $1 AND username = $2 AND slot_number = $3`,[room, username, slot]);
      console.log(`removed user ${username} from room ${room}`)
      return res.send({ success: true, message: "User removed from room"});
    }
});

export default router; 