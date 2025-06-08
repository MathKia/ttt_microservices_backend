import express from "express";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcryptjs";
import {generateToken, verifyToken} from "./tokenMiddleware/tokenMiddleware.js"

// allow env variables to be configured
env.config();

// constants 
const TABLE = process.env.PG_AUTH_TABLE; //db table name
const saltRounds = 1;      // bcrypt hash rounds
const NODE_ENV = process.env.NODE_ENV // prod or dev env of backend
const EXPIRATION = process.env.JWT_EXPIRES_IN  // JWT expiration time for unique generation

// set up pg database + connection
const dbPool = new pg.Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_AUTH_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    max: 10,  // Max number of connections in the pool
    idleTimeoutMillis: 30000,  // Connection timeout for idle connections
    connectionTimeoutMillis: 2000  // Timeout for establishing a new connection
})

//set up router
const router = express.Router();

/* define routes */

// reusable auth handle function
function handleAuthSuccess(res, mode, token, message) {
    // if mode = browser -> put token in cookies 
    if (mode === "browser") {
        console.log("Login on browser: passing token in cookie req");

        res.cookie("authToken", token, {
            httpOnly: true, // cookie inaccessible by Java Script code on browser
            secure: NODE_ENV === "production" ? true : false, // only send over HTTPS in prod
            sameSite: "lax", // only send cookie over https in prod from CORS ***(MIGHT CHNAGE LAX TO 'STRICT' = same origin not CORS)
            maxAge: 60 * 60 * 1000, // 1 hour life
        }); // sending a cookie called 'authToken' as res to frontend to send to client to store in their browser
        
        console.log("cookies is set with auth token")
        return res.json({ success: true, message: message }); // sent cookie response obj and json status res object
    } 
    
    // if mode = desktop -> send JWT as basic JSON obj, python frontend will handle the auth header
    if (mode === "desktop") {
        console.log("Login on desktop ... returning token");
        
        return res.json({ 
            success: true, 
            message: message,
            token  // Return token directly for desktop clients
        });
    }

    if (mode==="mobile"){
        console.log("Login on mobile ... returning token");
        return res.json({ 
            success: true, 
            message: message,
            token  // Return token directly for desktop clients
        });
    }

    // if error (no valid mode for some reason)
    return res.status(400).json({ success: false, message: "Invalid mode specified" });
}

// sign up route -> new username + password added to db and immediately logged in
router.post("/signup", async(req, res)=>{
    console.log("sign up route used")

    /* pass mode, username, password from client sign up req to backend signup service route */
    const {mode} = req.query; // mode=browser or mode=desktop
    const {password} = req.body;
    const username = req.body.username.toLowerCase();
    
    console.log("Recieved: ", username, password, mode)

    /* check if desired username and password associated with existing user in database */
    try{
        //check username doesn't exist already
        const checkUsername = await dbPool.query(`SELECT username FROM ${TABLE} WHERE username = $1`, [username])
        // if username already taken
        if (checkUsername.rows.length>0){
            console.log("Username already taken")
            return res.json({ success: false, message: "Username already taken. Select another" });
        }
        else{
            // username is valid, now hash password
            const hash = await bcrypt.hash(password, saltRounds)
        
            //add data of username + pass hash to database
            await dbPool.query(`INSERT INTO ${TABLE} (username, password) VALUES ($1, $2)`, [username, hash])

            /* Generate JWT token using middleware */
            const token = generateToken(username, EXPIRATION)
            console.log("generated token , ", token)
            // handle auth func = checks mode desktop/browser to pass token as auth header or cookie
            return handleAuthSuccess(res, mode, token, "Sign up successful.")
        }
    }catch(err){
        console.log(err.message)
        return res.status(500).json({ success: false, message: "Server error" });
    }   
})

// login route -> checks if username and password correct 
router.post("/login", async (req, res) => {
    console.log("Login route called");

    /* pass mode, username, password from client login req to backend login service route */
    const { mode } = req.query; // mode=browser or mode=desktop
    const { password } = req.body;
    const username = req.body.username.toLowerCase();
    console.log("Received:", mode, username, password);

    /* find username + password in database */
    try {
        console.log("Trying to query database...");
        const response = await dbPool.query(`SELECT * FROM ${TABLE} WHERE username = $1`, [username]);

        // if no username found
        if (response.rows.length === 0) {
            console.log("No such user in database");
            return res.json({ success: false, message: "Username not found. Login failed." });
        }

        //if username found move onto password compare
        console.log("User found in database:", response.rows);
        const dbpassword = response.rows[0].password;

        const match = await bcrypt.compare(password, dbpassword);

        // if no password match
        if (!match) {
            console.log("Password does not match, login UNSUCCESSFUL");
            return res.json({ success: false, message: "Password incorrect. Login failed." });
        }

        // if password success -> GENERATE AUTH TOKEN (JWT + COOKIES FOR MODE = BROWSER)
        console.log("Password match, login successful");

        /* Generate JWT token -> using token middleware*/
        const token = generateToken(username, EXPIRATION)
        console.log("Expiration received in generateToken:", EXPIRATION);
        console.log("generated token , ", token)
        // handle auth func = checks mode desktop/browser to pass token as auth header or cookie
        return handleAuthSuccess(res, mode, token, "Login successful.")
        
    } // if error in server for some reason
        catch (err) {
        console.error("ERROR IN QUERY:", err.message);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


// fetches profile by using verify token middlware -> if verify token success, attaches decoded token data in 'req.user' 
router.get("/profile", verifyToken, (req, res) => {
    console.log("route profile called ()");

    const { mode } = req.query;
    console.log(`mode = ${mode}`);

    // Token is already verified by middleware, and req.user is available
    return res.json({ success: true, username: req.user.username });
});


// 🔹 Logout Route (Clears cookie)
router.post("/logout", (req, res) => {
    console.log("Logout route called");

    const { mode } = req.query;  // mode=browser or mode=desktop

    if (mode === "browser") {
        // Clear the authToken cookie for browser
        res.clearCookie("authToken");
        return res.json({ success: true, message: "Logged out from browser" });
    } 
    else if (mode === "desktop") {
        // No cookies to clear, just return a response indicating logout
        return res.json({ success: true, message: "Logged out from desktop" });
    } 
    else if (mode === "mobile") {
        // No cookies to clear, just return a response indicating logout
        return res.json({ success: true, message: "Logged out from mobile" });
    } 
    else {
        return res.status(400).json({ success: false, message: "Invalid mode specified" });
    }
});

export default router; 
