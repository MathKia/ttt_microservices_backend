import jwt from "jsonwebtoken";
import env from "dotenv";

// allow env variables to be configured
env.config();

// constants 
const SECRET_KEY = process.env.JWT_SECRET   // JWT secret key for unique generation

/* funct = generate a JWT with payload being the username from successful login/sign up and return the token  */
export function generateToken(username, expirationTime) {
    console.log(`token middleware called -> generateToken for username ${username} expiration of ${expirationTime}`)
    // Generate JWT token -> jwt.sign with data, secret key, expiration
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: expirationTime});
}

/* funct = look at req to see if: 1. JWT exists, 2. JWT is valid */
export function verifyToken(req, res, next) {
  console.log(`token middleware called -> verifyToken`);

  let token; // declare token variable (value unassigned yet)
  const {mode} = req.query; // req mode param -> different platform handling (browser cookie vs desktop auth)
  console.log(`mode = ${mode}`)

  /* if mode = browser: extract JWT from cookie named 'authToken' */
  if (mode === "browser"){
    token = req.cookies.authToken;
    console.log(`browser token from cookie = ${token}`)
  }
  /* if mode = desktop or mobile: extract JWT from authoization header */
  else if (mode === "desktop" || mode === "mobile") {
    token = req.headers.authorization?.split(" ")[1];
    console.log(`${mode} token from Authorization header = ${token}`);
  /* if mode = socket: SOCKET DISCONNECT EVENT wont require auth (on socket event not user event) */
  } else if (mode === "socket"){
    console.log("Socket mode: skipping strict JWT validation, trusting socket-originated request.");
    return next(); // ✅ Allow through socket request (doesnt move on to decode/verify step cause 'next()')
  }
  /* error handling if no valid mode for some reason */
  else {
    console.log(`invalid mode`)
    return res.status(400).json({ success: false, message: "Invalid auth mode specified" });
  }

  /* try to verify token if it exists (decode it)  */
  try {
    console.log(`attempting to decode and verify auth token`)
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log("decoded jwt =", decoded); // e.g = { username: 'susan', iat: 1746447119, exp: 1746450719 }
    req.user = decoded; // Attach decoded info to the request under custom 'user' heading
    next();
  } catch (err) {
    console.log("JWT verification failed:", err.message);
    console.log("token invalid : no decoding possible ");
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}
