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
router.use("/join", verifyToken, async(req, res) => {
    console.log("Received join room request: API gateway -> room service");

    const { room } = req.body;          // Still extract the room name from the client
    /********* DELETE THE BELOW WHEN MADE ACTUAL AUTH HEADER FOR DESKTOP, THIS IS TEMPORARY !!!!!!!!!! ***********/ 
    const username = req.user ? req.user.username : req.body.username;
    // const username = req.user.username; // Use the verified username from the JWT = more security // THIS REPLACE ABOVE WHEN DESKTOP AUTH SORTED
    console.log(`user '${username}' wants to join room '${room}'`)

    // check if room in database is full 
    const checkRoom = await dbPool.query(`SELECT * FROM ${TABLE} WHERE roomname = $1`, [room])
    console.log(`result of ${room} in database = ${checkRoom.rows.length}`)

    // if there is space in room for 1 more person to join, add there details to room registry database
    if (checkRoom.rows.length < 4){ //2 people max in a room but room is duplicated for 2 serivces = 4 room prescence 
        await dbPool.query(
            `INSERT INTO ${TABLE} (username, roomname, service) VALUES 
              ($1, $2, $3), 
              ($1, $2, $4)`,
            [username, room, 'game', 'chat']
          );
        const checkRoom = await dbPool.query(`SELECT * FROM ${TABLE} WHERE roomname = $1`, [room])
        console.log(`result of ${room} in database after adding new user =`, checkRoom.rows)
        
        // when successful returns the service adds for game + chat
        res.json({
          success: true,
          message: 'Joined room, waiting for opponent ...',
          socketToken: generateToken(username, "120s"), //gen a new short lived  token for socket io auth, wont be passed in cookies so can be acces in JS
          serviceAdds: {
            chat: process.env.CHAT_ADD,
            game: process.env.GAME_ADD
          } // now that they are 'allowed' to join the room the frontend only now recieve the addresses to chat + game services for direct interaction
        });
    } // if room is full
    else if (checkRoom.rows.length === 4){
        console.log(`room ${room} is currently at max capacity. cannot add more members`)
        res.json({ success: false, message: `Room '${room}' is full. Please pick another room ...` });
    }
});

/* to leave room */
router.use("/exit", verifyToken, async (req, res) => {
    console.log("Received leave room request: API gateway -> room service");

    const { room } = req.body;          // Still extract the room name from the client
    const username = req.user ? req.user.username : req.body.username; // Use the verified username from the JWT = more security, but if socket disconnect wont be JWT to get username so can just use req.body.username
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
    { await dbPool.query(`DELETE FROM ${TABLE} WHERE roomname = $1 AND username = $2`,[room, username]);
      console.log(`removed user ${username} from room ${room}`)
      return res.send({ success: true, message: "User removed from room"});
    }
});

export default router; 